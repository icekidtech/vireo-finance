import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttemptContext, AttemptResult } from '../biometrics/biometric-attempt.entity';
import { BiometricsService, FusionResult } from '../biometrics/biometrics.service';
import { MerchantOrderStatus } from '../common/enums';
import { TransfersService } from '../transfers/transfers.service';
import { CreateTerminalPaymentDto } from './dto/terminal-payment.dto';
import { MerchantOrder } from './merchant-order.entity';
import { MerchantService } from './merchant.service';

export type TerminalPaymentResult =
  | { status: 'paid'; transfer: unknown }
  | { status: 'step_up_required'; message: string; orderReference: string }
  | { status: 'denied'; message: string };

const DENIED_MESSAGE = 'Biometric verification failed';

/**
 * Pay-with-your-face/voice at the till. The merchant app captures the sample;
 * the customer's identity is established here, never by the client.
 *
 * Safeguards (this path has no device signature, so these ARE the authorization):
 *  - only a KYB-verified merchant can accept it, and only for its own open orders;
 *  - the amount comes from the order, never from the request;
 *  - the biometric decision (approve / deny / step-up) comes from the verifier,
 *    which is itself fail-closed in production while only the mock scorer exists;
 *  - when two biometrics are sent, both must approve the SAME customer;
 *  - denials never reveal whether the customer exists or is enrolled;
 *  - a step-up (high value or uncertain match) is NOT completed here: there is
 *    no verifiable second factor, so the customer must approve on their phone
 *    (QR flow) instead.
 */
@Injectable()
export class TerminalPaymentService {
  private readonly logger = new Logger(TerminalPaymentService.name);

  constructor(
    @InjectRepository(MerchantOrder) private readonly orders: Repository<MerchantOrder>,
    private readonly merchants: MerchantService,
    private readonly biometrics: BiometricsService,
    private readonly transfers: TransfersService,
  ) {}

  async pay(
    merchantOwnerUserId: string,
    dto: CreateTerminalPaymentDto,
  ): Promise<TerminalPaymentResult> {
    const merchant = await this.merchants.getByOwner(merchantOwnerUserId);
    if (merchant.kybStatus !== 'verified') {
      throw new ForbiddenException('Merchant must be verified to accept biometric payments');
    }

    const order = await this.orders.findOne({
      where: { reference: dto.orderReference, merchantId: merchant.id },
    });
    if (!order) {
      throw new NotFoundException('Merchant order not found');
    }
    if (order.status !== MerchantOrderStatus.OPEN) {
      throw new BadRequestException(`Merchant order is ${order.status}`);
    }
    if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Merchant order has expired');
    }

    if (dto.secondBiometricSample && !dto.secondBiometricType) {
      throw new BadRequestException('secondBiometricType is required with secondBiometricSample');
    }
    if (dto.secondBiometricType && dto.secondBiometricType === dto.biometricType) {
      throw new BadRequestException('The two biometrics must be of different types');
    }

    const amountMinor = Number(BigInt(order.amount));
    const metadata = {
      ...(dto.metadata ?? {}),
      merchantId: merchant.id,
      orderReference: order.reference,
    };

    const samples = [{ type: dto.biometricType, sample: dto.biometricSample }];
    if (dto.secondBiometricSample && dto.secondBiometricType) {
      samples.push({ type: dto.secondBiometricType, sample: dto.secondBiometricSample });
    }

    const results: FusionResult[] = [];
    for (const { type, sample } of samples) {
      results.push(
        await this.biometrics.verify(
          {
            type,
            identifier: dto.customerIdentifier,
            sampleBase64: sample,
            amountMinor,
            metadata,
          },
          AttemptContext.PAYMENT,
        ),
      );
    }

    if (
      results.some((r) => r.decision === AttemptResult.DENIED || r.decision === AttemptResult.ERROR)
    ) {
      return { status: 'denied', message: DENIED_MESSAGE };
    }

    const customerIds = new Set(results.map((r) => r.userId));
    const customerUserId = results[0].userId;
    if (!customerUserId || customerIds.size !== 1) {
      return { status: 'denied', message: DENIED_MESSAGE };
    }

    if (results.some((r) => r.decision === AttemptResult.STEP_UP)) {
      return {
        status: 'step_up_required',
        orderReference: order.reference,
        message: 'Ask the customer to approve this payment on their phone by scanning the QR code.',
      };
    }

    // Never let a merchant debit their own wallet to themselves.
    if (customerUserId === merchantOwnerUserId) {
      return { status: 'denied', message: DENIED_MESSAGE };
    }

    const { transfer } = await this.transfers.payOrderWithBiometric({
      customerUserId,
      merchantId: merchant.id,
      orderReference: order.reference,
      biometricTypes: samples.map((s) => s.type),
    });
    this.logger.log(`Terminal payment completed order=${order.reference} merchant=${merchant.id}`);
    return { status: 'paid', transfer };
  }
}

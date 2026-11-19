import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttemptContext, AttemptResult } from '../biometrics/biometric-attempt.entity';
import { BiometricsService, FusionResult } from '../biometrics/biometrics.service';
import { MerchantOrderStatus } from '../common/enums';
import { TransfersService } from '../transfers/transfers.service';
import { CreateFaceTerminalPaymentDto, CreateTerminalPaymentDto } from './dto/terminal-payment.dto';
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
 *    which fails closed unless a real vendor adapter is configured;
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
    private readonly config: ConfigService,
  ) {}

  /** Face searches allowed per business per minute: a till has no reason to try faster than this. */
  private static readonly FACE_ATTEMPTS_PER_MINUTE = 10;
  private readonly faceAttempts = new Map<string, number[]>();

  private faceOnlySettings() {
    const cfg = this.config.get<{
      enabled?: boolean;
      allowSandbox?: boolean;
      maxAmountMinor?: number;
      minMatchScore?: number;
    }>('biometrics.faceOnly');
    return {
      enabled: cfg?.enabled === true,
      allowSandbox: cfg?.allowSandbox === true,
      maxAmountMinor: BigInt(cfg?.maxAmountMinor ?? 2_000_000),
      minMatchScore: cfg?.minMatchScore ?? 95,
    };
  }

  /**
   * Pay an order with just the customer's face: no phone number or handle. The server runs the face
   * search, so the customer is never named by the client, and then uses the same payment routine as
   * every other till payment (order checks, risk limits, ledger, notifications).
   *
   * Because the face is the ONLY thing authorising the money, it is stricter than the other paths:
   *  - off unless an operator switches it on, and refused while the face checker is in vendor test
   *    mode (which approves everything) unless that is allowed on purpose;
   *  - only for orders up to a small limit, checked BEFORE any face is processed; bigger orders must
   *    be approved on the customer's phone;
   *  - the face must clear a higher match score than the general threshold;
   *  - a limited number of searches per business per minute;
   *  - every denial looks the same, so the till learns nothing about who is or is not enrolled.
   */
  async payByFace(
    merchantOwnerUserId: string,
    dto: CreateFaceTerminalPaymentDto,
  ): Promise<TerminalPaymentResult> {
    const settings = this.faceOnlySettings();
    if (!settings.enabled) {
      throw new ServiceUnavailableException('Paying with just a face is not switched on yet');
    }
    if (
      this.config.get<string>('biometrics.didit.keyType') === 'sandbox' &&
      !settings.allowSandbox
    ) {
      throw new ServiceUnavailableException(
        'Paying with just a face is not available while the face checker is in test mode',
      );
    }

    const merchant = await this.merchants.getByOwner(merchantOwnerUserId);
    if (merchant.kybStatus !== 'verified') {
      throw new ForbiddenException('Merchant must be verified to accept biometric payments');
    }
    this.throttleFaceSearches(merchant.id);

    const order = await this.orders.findOne({
      where: { reference: dto.orderReference, merchantId: merchant.id },
    });
    if (!order) throw new NotFoundException('Merchant order not found');
    if (order.status !== MerchantOrderStatus.OPEN) {
      throw new BadRequestException(`Merchant order is ${order.status}`);
    }
    if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Merchant order has expired');
    }

    const amount = BigInt(order.amount);
    if (amount > settings.maxAmountMinor) {
      return {
        status: 'step_up_required',
        orderReference: order.reference,
        message:
          'This amount is too large to pay with a face alone. Ask the customer to pay with the QR code.',
      };
    }

    const result = await this.biometrics.identifyByFace(
      dto.sampleBase64,
      AttemptContext.PAYMENT,
      Number(amount),
    );

    if (result.decision === AttemptResult.STEP_UP) {
      return {
        status: 'step_up_required',
        orderReference: order.reference,
        message: 'Ask the customer to approve this payment on their phone by scanning the QR code.',
      };
    }
    const customerUserId = result.userId;
    if (
      result.decision !== AttemptResult.APPROVED ||
      !customerUserId ||
      result.scores.matchScore < settings.minMatchScore
    ) {
      return { status: 'denied', message: DENIED_MESSAGE };
    }
    // Never let a merchant pay itself with its own face.
    if (customerUserId === merchantOwnerUserId) {
      return { status: 'denied', message: DENIED_MESSAGE };
    }

    const { transfer } = await this.transfers.payOrderWithBiometric({
      customerUserId,
      merchantId: merchant.id,
      orderReference: order.reference,
      biometricTypes: ['face'],
    });
    this.logger.log(`Face-only payment completed order=${order.reference} merchant=${merchant.id}`);
    return { status: 'paid', transfer };
  }

  private throttleFaceSearches(merchantId: string): void {
    const now = Date.now();
    const recent = (this.faceAttempts.get(merchantId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= TerminalPaymentService.FACE_ATTEMPTS_PER_MINUTE) {
      throw new HttpException(
        'Too many face attempts. Wait a minute and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.faceAttempts.set(merchantId, recent);
  }

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

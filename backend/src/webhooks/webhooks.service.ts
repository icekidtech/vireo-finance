import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VirtualAccount } from '../accounts/virtual-account.entity';
import { SYSTEM_PAGA_POOL_ACCOUNT_ID } from '../common/constants';
import { LedgerDirection, LedgerTransactionType, PagaEventStatus } from '../common/enums';
import { sha256Hex } from '../common/crypto';
import { parseAmountToMinor } from '../database/money';
import { LedgerService } from '../ledger/ledger.service';
import { MerchantService } from '../merchant/merchant.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IncomingHeaders, PagaService } from '../paga/paga.service';
import { TransfersService } from '../transfers/transfers.service';
import { PagaEvent } from './paga-event.entity';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(PagaEvent) private readonly events: Repository<PagaEvent>,
    @InjectRepository(VirtualAccount) private readonly virtualAccounts: Repository<VirtualAccount>,
    private readonly ledger: LedgerService,
    private readonly paga: PagaService,
    private readonly notifications: NotificationsService,
    private readonly transfers: TransfersService,
    private readonly merchants: MerchantService,
  ) {}

  async handle(headers: IncomingHeaders, rawBody: string, body: Record<string, unknown>) {
    if (!this.paga.verifyCallback(headers, body)) {
      throw new UnauthorizedException('Invalid Paga callback hash');
    }

    const providerEventId = extractEventId(headers, body) ?? sha256Hex(rawBody);
    const type = extractType(body);

    let event: PagaEvent;
    try {
      event = await this.events.save(
        this.events.create({
          providerEventId,
          type,
          payload: body,
          signature: extractSignature(headers, body),
          status: PagaEventStatus.RECEIVED,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { status: 'SUCCESS', duplicate: true };
      }
      throw error;
    }

    try {
      const outcome = await this.process(providerEventId, body);
      event.status = outcome.ignored ? PagaEventStatus.IGNORED : PagaEventStatus.PROCESSED;
      event.processedAt = new Date();
      await this.events.save(event);
      return { status: 'SUCCESS', ...outcome };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Paga event ${providerEventId} failed: ${message}`);
      event.status = PagaEventStatus.FAILED;
      event.error = message.slice(0, 255);
      await this.events.save(event);
      throw error;
    }
  }

  private async process(
    providerEventId: string,
    body: Record<string, unknown>,
  ): Promise<{ ignored?: boolean; credited?: boolean; payoutUpdated?: boolean }> {
    if (isInboundCredit(body)) {
      return this.processInboundCredit(providerEventId, body);
    }
    if (isPayoutUpdate(body)) {
      return this.processPayoutUpdate(body);
    }
    return { ignored: true };
  }

  private async processInboundCredit(
    providerEventId: string,
    body: Record<string, unknown>,
  ): Promise<{ credited?: boolean }> {
    const accountNumber = String(body.accountNumber ?? '');
    if (!accountNumber) {
      throw new Error('Inbound callback is missing an account number');
    }

    const virtualAccount = await this.virtualAccounts.findOne({
      where: { accountNumber, status: 'active' },
    });
    if (!virtualAccount) {
      throw new Error(`No virtual account for ${accountNumber}`);
    }

    const amount = parseAmountToMinor(String(body.amount));
    await this.ledger.runInTransaction(async (manager) => {
      await this.ledger.post(manager, {
        idempotencyKey: `paga-event:${providerEventId}`,
        type: LedgerTransactionType.INBOUND_CREDIT,
        reference: providerEventId,
        currency: 'NGN',
        metadata: {
          providerEventId,
          accountNumber,
          transactionReference: body.transactionReference,
        },
        legs: [
          {
            accountId: SYSTEM_PAGA_POOL_ACCOUNT_ID,
            direction: LedgerDirection.DEBIT,
            amount,
          },
          {
            accountId: virtualAccount.accountId,
            direction: LedgerDirection.CREDIT,
            amount,
          },
        ],
      });
    });

    await this.notifications.creditReceived(virtualAccount.userId, amount);
    return { credited: true };
  }

  private async processPayoutUpdate(
    body: Record<string, unknown>,
  ): Promise<{ payoutUpdated?: boolean; ignored?: boolean }> {
    const reference = String(body.referenceNumber ?? '');
    const success = String(body.responseCode ?? '0') === '0';
    const providerReference = String(body.transactionId ?? reference);
    const reason = String(body.message ?? 'Paga reported failure');

    const handled =
      (await this.transfers.handlePayoutCallback(reference, success, providerReference, reason)) ||
      (await this.merchants.handleSettlementCallback(
        reference,
        success,
        providerReference,
        reason,
      ));

    return handled ? { payoutUpdated: true } : { ignored: true };
  }
}

function isInboundCredit(body: Record<string, unknown>): boolean {
  return (
    body.accountNumber !== undefined &&
    body.amount !== undefined &&
    String(body.statusCode ?? '') === '0'
  );
}

function isPayoutUpdate(body: Record<string, unknown>): boolean {
  return (
    typeof body.referenceNumber === 'string' &&
    body.accountNumber === undefined &&
    (body.transactionId !== undefined ||
      body.transactionStatus !== undefined ||
      body.sessionId !== undefined ||
      body.responseCode !== undefined)
  );
}

function extractEventId(headers: IncomingHeaders, body: Record<string, unknown>): string | null {
  const candidates = [
    body.transactionReference,
    body.fundingTransactionReference,
    body.notificationId,
    body.transactionId,
    body.referenceNumber,
    body.paymentReference,
    headerValue(headers, 'x-paga-request-id'),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate.slice(0, 120);
    }
  }
  return null;
}

function extractType(body: Record<string, unknown>): string {
  const raw = String(
    body.event ?? body.transactionType ?? body.transactionStatus ?? 'paga.callback',
  );
  return raw.slice(0, 80);
}

function extractSignature(headers: IncomingHeaders, body: Record<string, unknown>): string | null {
  const headerHash = headerValue(headers, 'x-paga-hash');
  if (headerHash) {
    return headerHash.slice(0, 255);
  }
  if (typeof body.hash === 'string') {
    return body.hash.slice(0, 255);
  }
  return null;
}

function headerValue(headers: IncomingHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === '23505';
}

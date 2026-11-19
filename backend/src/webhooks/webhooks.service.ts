import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { BalanceCapService } from '../risk/balance-cap.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VirtualAccount } from '../accounts/virtual-account.entity';
import { SYSTEM_PAGA_POOL_ACCOUNT_ID } from '../common/constants';
import { LedgerDirection, LedgerTransactionType, PagaEventStatus } from '../common/enums';
import { sha256Hex } from '../common/crypto';
import { formatMinor, parseAmountToMinor } from '../database/money';
import { LedgerService } from '../ledger/ledger.service';
import { MerchantService } from '../merchant/merchant.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IncomingHeaders, PagaService, statusFromText } from '../paga/paga.service';
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
    @Optional() private readonly caps?: BalanceCapService,
    @Optional() private readonly accounts?: AccountsService,
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
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.events.findOne({ where: { providerEventId } });
      if (!existing || existing.status !== PagaEventStatus.FAILED) {
        // Already processed (or ignored): a repeat delivery changes nothing.
        return { status: 'SUCCESS', duplicate: true };
      }
      // This callback failed earlier. Paga retries callbacks, and one can be replayed once the cause
      // is fixed, so it is processed again. The ledger's idempotency key makes a second credit
      // impossible, so a retry can never pay the same deposit twice.
      event = existing;
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

    const amount = parsePagaAmount(body.amount);
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

    // The same login can own a personal wallet and a business: say which one this money is for.
    const scope = (await this.accounts?.walletOwner(virtualAccount.accountId))
      ? 'personal'
      : 'merchant';
    await this.notifications.creditReceived(virtualAccount.userId, amount, { scope });
    // Balance caps apply to the personal wallet only.
    if (scope === 'personal') await this.applyBalanceCap(virtualAccount.userId);
    return { credited: true };
  }

  /** Money above the tier's balance cap is accepted but restricted; tell the user why. */
  private async applyBalanceCap(userId: string): Promise<void> {
    if (!this.caps) return;
    try {
      const restricted = await this.caps.reconcile(userId);
      if (restricted > 0n) {
        await this.notifications.send(
          userId,
          'Part of your balance is restricted',
          `NGN ${formatMinor(restricted)} is held until you verify more of your identity. Open Verify identity to raise your limit.`,
          undefined,
          { scope: 'personal' },
        );
      }
    } catch (error) {
      // The credit already posted; a failed restriction is logged and retried on the next credit.
      this.logger.error(`Balance cap check failed for ${userId}: ${String(error)}`);
    }
  }

  private async processPayoutUpdate(
    body: Record<string, unknown>,
  ): Promise<{ payoutUpdated?: boolean; ignored?: boolean }> {
    const reference = String(body.referenceNumber ?? '');
    const providerReference = String(body.transactionId ?? reference);
    const reason = String(body.message ?? 'Paga reported failure');

    // Only act on an explicit outcome. A missing status must never default to
    // success, and a still-pending payout is left for reconciliation.
    let success: boolean;
    if (body.transactionStatus !== undefined) {
      const status = statusFromText(body.transactionStatus);
      if (status === 'pending') {
        return { ignored: true };
      }
      success = status === 'completed';
    } else if (body.responseCode !== undefined) {
      success = String(body.responseCode) === '0';
    } else {
      return { ignored: true };
    }

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

/**
 * Paga writes amounts the way people do, with thousands separators ("5,000.00"). The strict money
 * parser rejects those, so the separators are removed first, but only when they are in the exact
 * thousands shape: anything odd (for example "5,00.00") is still refused, never guessed at.
 */
export function parsePagaAmount(value: unknown): bigint {
  const text = String(value ?? '').trim();
  const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text) ? text.replace(/,/g, '') : text;
  return parseAmountToMinor(plain);
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

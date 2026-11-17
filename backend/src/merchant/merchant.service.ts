import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { Challenge } from '../challenges/challenge.entity';
import { ChallengesService } from '../challenges/challenges.service';
import {
  ChallengeType,
  HoldStatus,
  LedgerDirection,
  LedgerTransactionType,
  MerchantOrderStatus,
  SettlementStatus,
} from '../common/enums';
import { SYSTEM_PAGA_POOL_ACCOUNT_ID } from '../common/constants';
import { formatMinor, parseAmountToMinor, assertPositive } from '../database/money';
import { Hold } from '../ledger/hold.entity';
import { LedgerService } from '../ledger/ledger.service';
import { PagaService } from '../paga/paga.service';
import {
  CreateOrderDto,
  CreateSettlementDraftDto,
  OnboardMerchantDto,
  UpdateMerchantDto,
} from './dto/merchant.dto';
import { Merchant } from './merchant.entity';
import { MerchantOrder } from './merchant-order.entity';
import { BUSINESS_LEVEL_FOR, DEFAULT_CASHOUT_LIMITS } from '../kyc/tiers';
import { Settlement } from './settlement.entity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(MerchantOrder) private readonly orders: Repository<MerchantOrder>,
    @InjectRepository(Settlement) private readonly settlements: Repository<Settlement>,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly challenges: ChallengesService,
    private readonly paga: PagaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async onboard(userId: string, dto: OnboardMerchantDto) {
    const handle = dto.handle.toLowerCase();
    const existing = await this.merchants.findOne({ where: { handle } });
    if (existing) {
      throw new ConflictException('Merchant handle is already taken');
    }
    const owned = await this.merchants.findOne({ where: { ownerUserId: userId } });
    if (owned) {
      throw new ConflictException('This account already has a merchant profile');
    }

    const bank = await this.resolveSettlementBank(
      dto.settlementBankCode,
      dto.settlementAccountNumber,
    );

    const merchant = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Merchant).save(
        manager.getRepository(Merchant).create({
          ownerUserId: userId,
          handle,
          businessName: dto.businessName.trim(),
          kybStatus: 'pending',
          settlementBankCode: bank?.bankCode ?? null,
          settlementAccountNumber: bank?.accountNumber ?? null,
          settlementAccountName: bank?.accountName ?? null,
          status: 'active',
        }),
      );
      const account = await this.accounts.createMerchantBalance(saved.id, manager);
      saved.settlementAccountId = account.id;
      return manager.getRepository(Merchant).save(saved);
    });

    return presentMerchant(merchant);
  }

  /**
   * Verifies a payout account with the bank and returns the holder's name.
   * Both fields or neither; a failed verification rejects rather than saving
   * an unverified destination.
   */
  private async resolveSettlementBank(bankCode?: string, accountNumber?: string) {
    if (!bankCode && !accountNumber) return null;
    if (!bankCode || !accountNumber) {
      throw new BadRequestException('Select a bank and enter the account number together');
    }
    const result = await this.paga.validateBankAccount({
      bankCode,
      accountNumber,
      amountMinor: 100n,
      reference: `val_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    });
    return { bankCode: result.bankUuid, accountNumber, accountName: result.accountName };
  }

  async getByOwner(userId: string): Promise<Merchant> {
    const merchant = await this.merchants.findOne({ where: { ownerUserId: userId } });
    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }
    return merchant;
  }

  async getProfile(userId: string) {
    return presentMerchant(await this.getByOwner(userId));
  }

  /**
   * Updates the business name and/or payout bank account. Bank details are a
   * fraud target (redirecting settlements), so they must be supplied as a
   * complete set and cannot change while a payout is in flight. Each payout is
   * still signed on the owner's device with the destination shown for approval.
   */
  async updateProfile(userId: string, dto: UpdateMerchantDto) {
    const merchant = await this.getByOwner(userId);
    const bankFields = [dto.settlementBankCode, dto.settlementAccountNumber];
    const bankProvided = bankFields.filter((v) => v !== undefined).length;

    if (bankProvided > 0 && bankProvided < bankFields.length) {
      throw new BadRequestException(
        'settlementBankCode and settlementAccountNumber must be provided together',
      );
    }
    if (dto.businessName === undefined && bankProvided === 0) {
      throw new BadRequestException('Nothing to update');
    }

    if (bankProvided > 0) {
      const inFlight = await this.settlements.count({
        where: {
          merchantId: merchant.id,
          status: In([
            SettlementStatus.DRAFT,
            SettlementStatus.PENDING,
            SettlementStatus.PROCESSING,
          ]),
        },
      });
      if (inFlight > 0) {
        throw new ConflictException('Bank details cannot change while a settlement is in progress');
      }
      // The holder's name comes from the bank, never from the client.
      const bank = await this.resolveSettlementBank(
        dto.settlementBankCode,
        dto.settlementAccountNumber,
      );
      merchant.settlementBankCode = bank!.bankCode;
      merchant.settlementAccountNumber = bank!.accountNumber;
      merchant.settlementAccountName = bank!.accountName;
    }
    if (dto.businessName !== undefined) {
      merchant.businessName = dto.businessName.trim();
    }

    return presentMerchant(await this.merchants.save(merchant));
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const merchant = await this.getByOwner(userId);
    const amount = parseAmountToMinor(dto.amount);
    assertPositive(amount);
    const ttl = dto.expiresInSeconds ?? 300;

    const order = await this.orders.save(
      this.orders.create({
        merchantId: merchant.id,
        reference: `ord_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        amount: amount.toString(),
        currency: 'NGN',
        status: MerchantOrderStatus.OPEN,
        note: dto.note ?? null,
        expiresAt: new Date(Date.now() + ttl * 1000),
      }),
    );

    return presentOrder(order, merchant);
  }

  async listOrders(userId: string) {
    const merchant = await this.getByOwner(userId);
    const rows = await this.orders.find({
      where: { merchantId: merchant.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((order) => presentOrder(order, merchant));
  }

  async getOrder(reference: string) {
    const order = await this.orders.findOne({ where: { reference } });
    if (!order) {
      throw new NotFoundException('Merchant order not found');
    }
    const merchant = await this.merchants.findOne({ where: { id: order.merchantId } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return presentOrder(order, merchant);
  }

  async cancelOrder(userId: string, reference: string) {
    const merchant = await this.getByOwner(userId);
    // Lock the order so a concurrent payment cannot race the cancellation.
    const order = await this.ledger.runInTransaction(async (manager) => {
      const locked = await manager.getRepository(MerchantOrder).findOne({
        where: { reference, merchantId: merchant.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Merchant order not found');
      }
      if (locked.status === MerchantOrderStatus.PAID) {
        throw new BadRequestException('Paid orders cannot be cancelled');
      }
      if (
        locked.status === MerchantOrderStatus.CANCELLED ||
        locked.status === MerchantOrderStatus.EXPIRED
      ) {
        return locked;
      }
      locked.status = MerchantOrderStatus.CANCELLED;
      return manager.getRepository(MerchantOrder).save(locked);
    });
    return presentOrder(order, merchant);
  }

  /**
   * Bulk-expire open orders past their TTL. Called by the reconciliation job;
   * the payment path also expires lazily, so this only cleans up listings.
   */
  async expireOverdueOrders(now: Date = new Date()): Promise<number> {
    const result = await this.orders.update(
      { status: MerchantOrderStatus.OPEN, expiresAt: LessThan(now) },
      { status: MerchantOrderStatus.EXPIRED },
    );
    return result.affected ?? 0;
  }

  async listAllMerchants() {
    const rows = await this.merchants.find({ order: { createdAt: 'DESC' }, take: 100 });
    return rows.map(presentMerchant);
  }

  async verifyKyb(merchantId: string, status: 'verified' | 'rejected') {
    const merchant = await this.merchants.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    merchant.kybStatus = status;
    await this.merchants.save(merchant);
    return presentMerchant(merchant);
  }

  async dashboard(userId: string) {
    const merchant = await this.getByOwner(userId);
    const account = await this.accounts.getMerchantAccount(merchant.id);
    const balance = await this.ledger.getBalance(account.id);

    const salesRows = await this.dataSource.query(
      `SELECT COALESCE(SUM("amount"), 0)::text AS total, COUNT(*)::int AS count
       FROM "merchant_orders"
       WHERE "merchantId" = $1
         AND "status" = 'paid'
         AND "createdAt" >= date_trunc('day', now())`,
      [merchant.id],
    );
    const salesToday = BigInt(salesRows[0]?.total ?? '0');

    const recent = await this.orders.find({
      where: { merchantId: merchant.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      merchant: presentMerchant(merchant),
      balance: {
        available: formatMinor(balance.available),
        held: formatMinor(balance.held),
        currency: 'NGN',
      },
      salesToday: {
        amount: formatMinor(salesToday),
        count: Number(salesRows[0]?.count ?? 0),
      },
      recentOrders: recent.map((order) => presentOrder(order, merchant)),
    };
  }

  /** Today's cash-outs (anything not failed) plus this one must fit the level's daily cap. */
  private async assertWithinCashoutLimit(merchant: Merchant, amount: bigint): Promise<void> {
    const level = BUSINESS_LEVEL_FOR(
      merchant.kybStatus === 'verified',
      merchant.registrationStatus === 'verified',
    );
    const limits =
      this.config?.get<Record<number, bigint>>('merchantLimits.cashoutDailyLimits') ??
      DEFAULT_CASHOUT_LIMITS;
    const limit = limits[level] ?? 0n;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const today = await this.settlements.find({
      where: {
        merchantId: merchant.id,
        createdAt: MoreThanOrEqual(startOfDay),
        status: In([
          SettlementStatus.DRAFT,
          SettlementStatus.PENDING,
          SettlementStatus.PROCESSING,
          SettlementStatus.COMPLETED,
        ]),
      },
    });
    const used = today.reduce((sum, s) => sum + BigInt(s.amount), 0n);
    if (used + amount > limit) {
      throw new BadRequestException(
        `Daily cash-out limit for your business level is ${formatMinor(limit)} NGN` +
          (level < 2 ? '. Register your business to raise it.' : ''),
      );
    }
  }

  async createSettlementDraft(userId: string, dto: CreateSettlementDraftDto) {
    const merchant = await this.getByOwner(userId);
    if (merchant.kybStatus !== 'verified') {
      throw new BadRequestException('Merchant KYB must be verified before settling');
    }
    const account = await this.accounts.getMerchantAccount(merchant.id);
    const balance = await this.ledger.getBalance(account.id);
    const amount = dto.amount ? parseAmountToMinor(dto.amount) : balance.available;
    assertPositive(amount);

    if (amount > balance.available) {
      throw new BadRequestException('Settlement amount exceeds available balance');
    }
    if (!merchant.settlementBankCode || !merchant.settlementAccountNumber) {
      throw new BadRequestException('Merchant settlement bank details are not set');
    }
    await this.assertWithinCashoutLimit(merchant, amount);

    // Create the draft and reserve funds atomically under the account lock, so
    // concurrent settlements cannot over-reserve or leave an orphaned draft.
    const settlement = await this.ledger.runInTransaction(async (manager) => {
      const saved = await manager.getRepository(Settlement).save(
        manager.getRepository(Settlement).create({
          merchantId: merchant.id,
          amount: amount.toString(),
          status: SettlementStatus.DRAFT,
        }),
      );
      await this.ledger.createHold(manager, {
        accountId: account.id,
        amount,
        reference: `settlement:${saved.id}`,
      });
      return saved;
    });

    // Bind a device challenge to the draft. If the device is invalid the draft
    // is failed and its hold released, so no funds stay reserved without a way
    // to authorize the payout.
    let challenge;
    try {
      challenge = await this.challenges.issue({
        userId,
        deviceId: dto.deviceId,
        type: ChallengeType.SETTLEMENT,
        payload: {
          settlementId: settlement.id,
          type: 'settlement',
          amountMinor: settlement.amount,
          currency: 'NGN',
          bankCode: merchant.settlementBankCode,
          accountNumber: merchant.settlementAccountNumber,
          accountName: merchant.settlementAccountName ?? merchant.businessName,
        },
      });
    } catch (error) {
      await this.failSettlementById(settlement.id, 'Settlement challenge could not be issued');
      throw error;
    }

    settlement.challengeId = challenge.id;
    await this.settlements.save(settlement);

    return { settlement: presentSettlement(settlement), challenge: presentChallenge(challenge) };
  }

  async submitSettlement(userId: string, settlementId: string, signature: string) {
    const merchant = await this.getByOwner(userId);

    // Consume the signed challenge and move DRAFT -> PENDING atomically. Paga is
    // called only after the challenge is committed as used.
    const settlement = await this.ledger.runInTransaction(async (manager) => {
      const locked = await manager.getRepository(Settlement).findOne({
        where: { id: settlementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || locked.merchantId !== merchant.id) {
        throw new NotFoundException('Settlement not found');
      }
      if (
        locked.status === SettlementStatus.PROCESSING ||
        locked.status === SettlementStatus.COMPLETED
      ) {
        return locked;
      }
      if (locked.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException(`Settlement is ${locked.status}`);
      }
      if (!locked.challengeId) {
        throw new BadRequestException('Settlement has no challenge');
      }
      await this.consumeForSettlement(manager, locked, userId, signature);
      locked.status = SettlementStatus.PENDING;
      // Record the payout reference before calling Paga so reconciliation can
      // resolve the outcome even if the response is lost.
      locked.pagaReference = `settlement:${locked.id}`;
      return manager.getRepository(Settlement).save(locked);
    });

    if (settlement.status !== SettlementStatus.PENDING) {
      return presentSettlement(settlement);
    }

    let result;
    try {
      result = await this.paga.depositToBank({
        amountMinor: BigInt(settlement.amount),
        reference: `settlement:${settlement.id}`,
        bankCode: merchant.settlementBankCode!,
        accountNumber: merchant.settlementAccountNumber!,
        accountName: merchant.settlementAccountName ?? merchant.businessName,
        narration: 'Vireo merchant settlement',
      });
    } catch (error) {
      if (error instanceof BadGatewayException) {
        // Ambiguous outcome: Paga may have accepted the payout. Keep the
        // settlement PENDING (funds held) for reconciliation/callback.
        this.logger.warn(
          `Paga settlement outcome unknown for settlement=${settlement.id}: ${String(error)}`,
        );
        const latest = await this.settlements.findOne({ where: { id: settlement.id } });
        return presentSettlement(latest ?? settlement);
      }
      await this.failSettlementById(settlement.id, 'Paga payout request failed');
      throw error;
    }

    if (result.status === 'failed') {
      const failed = await this.failSettlementById(
        settlement.id,
        result.failureReason ?? 'Paga rejected the settlement',
      );
      return presentSettlement(failed);
    }

    if (result.status === 'completed') {
      const completed = await this.completeSettlementById(settlement.id, result.providerReference);
      return presentSettlement(completed);
    }

    await this.settlements.update(
      { id: settlement.id, status: SettlementStatus.PENDING },
      { status: SettlementStatus.PROCESSING, pagaReference: result.providerReference },
    );
    const latest = await this.settlements.findOne({ where: { id: settlement.id } });
    return presentSettlement(latest ?? settlement);
  }

  private async consumeForSettlement(
    manager: EntityManager,
    settlement: Settlement,
    userId: string,
    signature: string,
  ): Promise<void> {
    const challenge = await manager.getRepository(Challenge).findOne({
      where: { id: settlement.challengeId! },
    });
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }
    if (challenge.payload.settlementId !== settlement.id) {
      throw new BadRequestException('Challenge is not bound to this settlement');
    }
    if (challenge.payload.amountMinor !== settlement.amount) {
      throw new BadRequestException('Challenge amount does not match the settlement');
    }

    await this.challenges.consume(manager, {
      challengeId: settlement.challengeId!,
      userId,
      type: ChallengeType.SETTLEMENT,
      expectedPayload: challenge.payload,
      signature,
    });
  }

  async listSettlements(userId: string) {
    const merchant = await this.getByOwner(userId);
    const rows = await this.settlements.find({
      where: { merchantId: merchant.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map(presentSettlement);
  }

  async handleSettlementCallback(
    reference: string,
    success: boolean,
    providerReference: string,
    reason?: string,
  ): Promise<boolean> {
    if (!reference.startsWith('settlement:')) {
      return false;
    }
    const settlementId = reference.slice('settlement:'.length);
    if (!UUID_PATTERN.test(settlementId)) {
      return false;
    }
    const settlement = await this.settlements.findOne({ where: { id: settlementId } });
    if (!settlement) {
      return false;
    }
    if (success) {
      await this.completeSettlementById(settlementId, providerReference || reference);
    } else {
      await this.failSettlementById(settlementId, reason ?? 'Paga reported failure');
    }
    return true;
  }

  async completeSettlementById(
    settlementId: string,
    providerReference: string,
  ): Promise<Settlement> {
    return this.ledger.runInTransaction(async (manager) => {
      const settlement = await manager.getRepository(Settlement).findOne({
        where: { id: settlementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) {
        throw new NotFoundException('Settlement not found');
      }
      if (settlement.status === SettlementStatus.COMPLETED) {
        return settlement;
      }
      if (settlement.status === SettlementStatus.FAILED) {
        throw new BadRequestException(`Settlement is ${settlement.status}`);
      }

      const account = await this.accounts.getMerchantAccount(settlement.merchantId);
      const amount = BigInt(settlement.amount);
      const hold = await manager.getRepository(Hold).findOne({
        where: { reference: `settlement:${settlement.id}`, status: HoldStatus.ACTIVE },
      });
      if (hold) {
        await this.ledger.captureHold(manager, hold.id);
      }

      await this.ledger.post(manager, {
        idempotencyKey: `settlement:${settlement.id}`,
        type: LedgerTransactionType.SETTLEMENT,
        reference: settlement.id,
        currency: 'NGN',
        metadata: { merchantId: settlement.merchantId, pagaReference: providerReference },
        legs: [
          {
            accountId: account.id,
            direction: LedgerDirection.DEBIT,
            amount,
          },
          {
            accountId: SYSTEM_PAGA_POOL_ACCOUNT_ID,
            direction: LedgerDirection.CREDIT,
            amount,
          },
        ],
      });

      settlement.status = SettlementStatus.COMPLETED;
      settlement.pagaReference = providerReference;
      return manager.getRepository(Settlement).save(settlement);
    });
  }

  async failSettlementById(settlementId: string, reason: string): Promise<Settlement> {
    return this.ledger.runInTransaction(async (manager) => {
      const settlement = await manager.getRepository(Settlement).findOne({
        where: { id: settlementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) {
        throw new NotFoundException('Settlement not found');
      }
      if (
        settlement.status === SettlementStatus.COMPLETED ||
        settlement.status === SettlementStatus.FAILED
      ) {
        return settlement;
      }
      const hold = await manager.getRepository(Hold).findOne({
        where: { reference: `settlement:${settlement.id}`, status: HoldStatus.ACTIVE },
      });
      if (hold) {
        await this.ledger.releaseHold(manager, hold.id);
      }
      settlement.status = SettlementStatus.FAILED;
      settlement.failureReason = reason;
      return manager.getRepository(Settlement).save(settlement);
    });
  }
}

export function presentMerchant(merchant: Merchant) {
  return {
    id: merchant.id,
    handle: merchant.handle,
    businessName: merchant.businessName,
    kybStatus: merchant.kybStatus,
    registrationStatus: merchant.registrationStatus,
    cacNumber: merchant.cacNumber,
    status: merchant.status,
    settlementBankCode: merchant.settlementBankCode,
    settlementAccountNumber: merchant.settlementAccountNumber,
    settlementAccountName: merchant.settlementAccountName,
    createdAt: merchant.createdAt,
  };
}

export function presentOrder(order: MerchantOrder, merchant: Merchant) {
  return {
    id: order.id,
    reference: order.reference,
    merchantHandle: merchant.handle,
    merchantName: merchant.businessName,
    amount: formatMinor(BigInt(order.amount)),
    currency: order.currency,
    status: order.status,
    note: order.note,
    expiresAt: order.expiresAt,
    qrPayload: `vireo://pay?ref=${order.reference}`,
    createdAt: order.createdAt,
  };
}

export function presentSettlement(settlement: Settlement) {
  return {
    id: settlement.id,
    amount: formatMinor(BigInt(settlement.amount)),
    status: settlement.status,
    pagaReference: settlement.pagaReference,
    failureReason: settlement.failureReason,
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
  };
}

function presentChallenge(challenge: Challenge) {
  return {
    id: challenge.id,
    type: challenge.type,
    nonce: challenge.nonce,
    payload: challenge.payload,
    payloadHash: challenge.payloadHash,
    expiresAt: challenge.expiresAt,
  };
}

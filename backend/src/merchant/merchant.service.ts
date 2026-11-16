import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import {
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
import { CreateOrderDto, OnboardMerchantDto } from './dto/merchant.dto';
import { Merchant } from './merchant.entity';
import { MerchantOrder } from './merchant-order.entity';
import { Settlement } from './settlement.entity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MerchantService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(MerchantOrder) private readonly orders: Repository<MerchantOrder>,
    @InjectRepository(Settlement) private readonly settlements: Repository<Settlement>,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly paga: PagaService,
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

    const merchant = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Merchant).save(
        manager.getRepository(Merchant).create({
          ownerUserId: userId,
          handle,
          businessName: dto.businessName.trim(),
          kybStatus: 'pending',
          settlementBankCode: dto.settlementBankCode ?? null,
          settlementAccountNumber: dto.settlementAccountNumber ?? null,
          settlementAccountName: dto.settlementAccountName ?? null,
          status: 'active',
        }),
      );
      const account = await this.accounts.createMerchantBalance(saved.id, manager);
      saved.settlementAccountId = account.id;
      return manager.getRepository(Merchant).save(saved);
    });

    return presentMerchant(merchant);
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

  async settle(userId: string, amountInput?: string) {
    const merchant = await this.getByOwner(userId);
    const account = await this.accounts.getMerchantAccount(merchant.id);
    const balance = await this.ledger.getBalance(account.id);
    const amount = amountInput ? parseAmountToMinor(amountInput) : balance.available;
    assertPositive(amount);

    if (amount > balance.available) {
      throw new BadRequestException('Settlement amount exceeds available balance');
    }
    if (!merchant.settlementBankCode || !merchant.settlementAccountNumber) {
      throw new BadRequestException('Merchant settlement bank details are not set');
    }

    const settlement = await this.settlements.save(
      this.settlements.create({
        merchantId: merchant.id,
        amount: amount.toString(),
        status: SettlementStatus.PENDING,
      }),
    );

    await this.ledger.runInTransaction(async (manager) => {
      await this.ledger.createHold(manager, {
        accountId: account.id,
        amount,
        reference: `settlement:${settlement.id}`,
      });
    });

    let result;
    try {
      result = await this.paga.depositToBank({
        amountMinor: amount,
        reference: `settlement:${settlement.id}`,
        bankCode: merchant.settlementBankCode,
        accountNumber: merchant.settlementAccountNumber,
        accountName: merchant.settlementAccountName ?? merchant.businessName,
        narration: 'Vireo merchant settlement',
      });
    } catch (error) {
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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Challenge } from '../challenges/challenge.entity';
import {
  ChallengeType,
  HoldStatus,
  LedgerTransactionType,
  MerchantOrderStatus,
  SettlementStatus,
} from '../common/enums';
import { Hold } from '../ledger/hold.entity';
import { MerchantOrder } from './merchant-order.entity';
import { MerchantService } from './merchant.service';
import { Settlement } from './settlement.entity';

function makeMerchant(overrides: any = {}) {
  return {
    id: 'merchant-1',
    ownerUserId: 'user-1',
    handle: 'biz',
    businessName: 'Biz Name',
    kybStatus: 'verified',
    settlementBankCode: '058',
    settlementAccountNumber: '0123456789',
    settlementAccountName: 'Biz Name',
    settlementAccountId: 'acc-m',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSettlement(overrides: any = {}) {
  return {
    id: 'settle-1',
    merchantId: 'merchant-1',
    amount: '50000',
    status: SettlementStatus.DRAFT,
    challengeId: 'challenge-1',
    pagaReference: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeChallenge(overrides: any = {}) {
  return {
    id: 'challenge-1',
    userId: 'user-1',
    deviceId: 'device-1',
    type: ChallengeType.SETTLEMENT,
    nonce: 'nonce',
    payload: { settlementId: 'settle-1', amountMinor: '50000', type: 'settlement' },
    payloadHash: 'hash',
    status: 'pending',
    expiresAt: new Date(Date.now() + 120000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeOrder(overrides: any = {}) {
  return {
    id: 'order-1',
    merchantId: 'merchant-1',
    reference: 'ord_abc',
    amount: '50000',
    currency: 'NGN',
    status: MerchantOrderStatus.OPEN,
    paidByUserId: null,
    transferId: null,
    note: null,
    expiresAt: new Date(Date.now() + 300000),
    createdAt: new Date(),
    ...overrides,
  };
}

interface HarnessOptions {
  merchant?: any;
  settlement?: any;
  challenge?: any;
  order?: any;
  available?: bigint;
  hold?: any;
  pagaResult?: any;
  issueError?: Error;
}

function makeService(opts: HarnessOptions = {}) {
  const merchant = opts.merchant ?? makeMerchant();
  const settlement = opts.settlement ?? makeSettlement();
  const challenge = opts.challenge ?? makeChallenge();
  const order = opts.order === undefined ? makeOrder() : opts.order;
  const hold = opts.hold ?? { id: 'hold-1', accountId: 'acc-m', status: HoldStatus.ACTIVE };

  const createHold = jest.fn(async () => ({ id: 'hold-1' }));
  const releaseHold = jest.fn(async () => hold);
  const captureHold = jest.fn(async () => hold);
  const post = jest.fn(async () => ({ id: 'txn-1' }));
  const consume = jest.fn(async () => challenge);
  const issue = jest.fn(async () => {
    if (opts.issueError) throw opts.issueError;
    return challenge;
  });
  const depositToBank = jest.fn(
    async () =>
      opts.pagaResult ?? {
        status: 'completed',
        providerReference: 'paga-ref',
        raw: {},
      },
  );

  // A single fake manager shared by every runInTransaction call. Settlement
  // saves assign an id so the draft path mirrors the database generating one.
  const manager = {
    getRepository: jest.fn((entity: any) => {
      if (entity === Settlement) {
        return {
          findOne: jest.fn(async () => settlement),
          create: jest.fn((dto: any) => dto),
          save: jest.fn(async (dto: any) => {
            const saved = { ...dto, id: dto.id ?? 'settle-new' };
            Object.assign(settlement, saved);
            return saved;
          }),
        };
      }
      if (entity === Challenge) {
        return { findOne: jest.fn(async () => challenge) };
      }
      if (entity === MerchantOrder) {
        return {
          findOne: jest.fn(async () => order),
          save: jest.fn(async (dto: any) => {
            if (order) Object.assign(order, dto);
            return dto;
          }),
        };
      }
      if (entity === Hold) {
        return { findOne: jest.fn(async () => hold) };
      }
      return { findOne: jest.fn(), save: jest.fn(), create: jest.fn((d: any) => d) };
    }),
  };

  const ledger = {
    runInTransaction: jest.fn(async (cb: any) => cb(manager)),
    getBalance: jest.fn(async () => ({
      accountId: 'acc-m',
      currency: 'NGN',
      balance: opts.available ?? 100000n,
      held: 0n,
      available: opts.available ?? 100000n,
    })),
    createHold,
    releaseHold,
    captureHold,
    post,
  };

  const settlementsRepo = {
    findOne: jest.fn(async () => settlement),
    create: jest.fn((dto: any) => dto),
    save: jest.fn(async (dto: any) => dto),
    update: jest.fn(async (_criteria: any, patch: any) => {
      Object.assign(settlement, patch);
      return { affected: 1 };
    }),
    find: jest.fn(async () => []),
  };
  const merchantsRepo = {
    findOne: jest.fn(async () => merchant),
    save: jest.fn(async (dto: any) => dto),
    find: jest.fn(async () => [merchant]),
  };
  const ordersRepo = {
    findOne: jest.fn(async () => order),
    update: jest.fn(async (_criteria: any, patch: any) => {
      if (order) Object.assign(order, patch);
      return { affected: 1 };
    }),
    find: jest.fn(async () => []),
  };
  const accounts = { getMerchantAccount: jest.fn(async () => ({ id: 'acc-m' })) };
  const challenges = { issue, consume };
  const paga = { depositToBank };

  const service = new MerchantService(
    {} as any,
    merchantsRepo as any,
    ordersRepo as any,
    settlementsRepo as any,
    accounts as any,
    ledger as any,
    challenges as any,
    paga as any,
  );

  return {
    service,
    settlement,
    challenge,
    order,
    spies: { createHold, releaseHold, captureHold, post, consume, issue, depositToBank },
    settlementsRepo,
    merchantsRepo,
    ordersRepo,
  };
}

describe('MerchantService.createSettlementDraft cash-out limit', () => {
  it('blocks a cash-out that takes the day over the level-1 limit', async () => {
    const { service, settlementsRepo, spies } = makeService({ available: 50_000_000n });
    settlementsRepo.find.mockResolvedValueOnce([{ amount: '15000000' }] as never);
    await expect(
      service.createSettlementDraft('user-1', { amount: '60000.00', deviceId: 'device-1' }),
    ).rejects.toThrow(/Daily cash-out limit/);
    expect(spies.createHold).not.toHaveBeenCalled();
  });
});

describe('MerchantService.createSettlementDraft', () => {
  it('rejects settlement when merchant KYB is not verified', async () => {
    const { service, spies } = makeService({ merchant: makeMerchant({ kybStatus: 'pending' }) });
    await expect(service.createSettlementDraft('user-1', { deviceId: 'device-1' })).rejects.toThrow(
      'Merchant KYB must be verified before settling',
    );
    expect(spies.createHold).not.toHaveBeenCalled();
  });

  it('rejects an amount above the available balance', async () => {
    const { service } = makeService({ available: 1000n });
    await expect(
      service.createSettlementDraft('user-1', { amount: '500.00', deviceId: 'device-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when settlement bank details are missing', async () => {
    const { service } = makeService({ merchant: makeMerchant({ settlementBankCode: null }) });
    await expect(service.createSettlementDraft('user-1', { deviceId: 'device-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates a DRAFT settlement, reserves a hold and issues a settlement challenge', async () => {
    const { service, spies, settlement } = makeService();
    const result = await service.createSettlementDraft('user-1', {
      amount: '500.00',
      deviceId: 'device-1',
    });

    expect(result.settlement.status).toBe(SettlementStatus.DRAFT);
    expect(result.challenge.type).toBe(ChallengeType.SETTLEMENT);
    expect(spies.createHold).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: 'acc-m',
        amount: 50000n,
        reference: `settlement:${settlement.id}`,
      }),
    );
    expect(spies.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        deviceId: 'device-1',
        type: ChallengeType.SETTLEMENT,
        payload: expect.objectContaining({ settlementId: settlement.id, amountMinor: '50000' }),
      }),
    );
    expect(settlement.challengeId).toBe('challenge-1');
  });

  it('defaults to the full available balance when no amount is given', async () => {
    const { service, spies } = makeService({ available: 75000n });
    await service.createSettlementDraft('user-1', { deviceId: 'device-1' });
    expect(spies.createHold).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 75000n }),
    );
  });

  it('fails the draft and releases the hold when the challenge cannot be issued', async () => {
    const { service, settlement, spies } = makeService({
      issueError: new BadRequestException('Device is not registered or has been revoked'),
    });
    await expect(service.createSettlementDraft('user-1', { deviceId: 'device-1' })).rejects.toThrow(
      BadRequestException,
    );
    expect(settlement.status).toBe(SettlementStatus.FAILED);
    expect(spies.releaseHold).toHaveBeenCalled();
  });
});

describe('MerchantService.submitSettlement', () => {
  it('rejects a settlement owned by another merchant', async () => {
    const { service } = makeService({ settlement: makeSettlement({ merchantId: 'other' }) });
    await expect(service.submitSettlement('user-1', 'settle-1', 'sig')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('is idempotent for an already completed settlement and never calls Paga', async () => {
    const { service, spies } = makeService({
      settlement: makeSettlement({ status: SettlementStatus.COMPLETED }),
    });
    const result = await service.submitSettlement('user-1', 'settle-1', 'sig');
    expect(result.status).toBe(SettlementStatus.COMPLETED);
    expect(spies.consume).not.toHaveBeenCalled();
    expect(spies.depositToBank).not.toHaveBeenCalled();
  });

  it('rejects a failed settlement', async () => {
    const { service } = makeService({
      settlement: makeSettlement({ status: SettlementStatus.FAILED }),
    });
    await expect(service.submitSettlement('user-1', 'settle-1', 'sig')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('consumes the challenge, pays out via Paga and completes the settlement', async () => {
    const { service, settlement, spies } = makeService();
    const result = await service.submitSettlement('user-1', 'settle-1', 'sig');

    expect(spies.consume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        challengeId: 'challenge-1',
        userId: 'user-1',
        type: ChallengeType.SETTLEMENT,
      }),
    );
    expect(spies.depositToBank).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 50000n, reference: 'settlement:settle-1' }),
    );
    expect(spies.post).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: LedgerTransactionType.SETTLEMENT }),
    );
    expect(result.status).toBe(SettlementStatus.COMPLETED);
    expect(settlement.status).toBe(SettlementStatus.COMPLETED);
  });

  it('marks the settlement PROCESSING when Paga reports pending', async () => {
    const { service, spies } = makeService({
      pagaResult: { status: 'pending', providerReference: 'paga-ref', raw: {} },
    });
    const result = await service.submitSettlement('user-1', 'settle-1', 'sig');
    expect(result.status).toBe(SettlementStatus.PROCESSING);
    expect(spies.post).not.toHaveBeenCalled();
  });

  it('fails the settlement and releases the hold when Paga rejects the payout', async () => {
    const { service, settlement, spies } = makeService({
      pagaResult: {
        status: 'failed',
        providerReference: 'paga-ref',
        failureReason: 'no funds',
        raw: {},
      },
    });
    const result = await service.submitSettlement('user-1', 'settle-1', 'sig');
    expect(result.status).toBe(SettlementStatus.FAILED);
    expect(settlement.failureReason).toBe('no funds');
    expect(spies.releaseHold).toHaveBeenCalled();
    expect(spies.post).not.toHaveBeenCalled();
  });
});

describe('MerchantService.consumeForSettlement binding', () => {
  it('rejects a challenge bound to a different settlement', async () => {
    const { service } = makeService({
      challenge: makeChallenge({ payload: { settlementId: 'other', amountMinor: '50000' } }),
    });
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () =>
          makeChallenge({ payload: { settlementId: 'other', amountMinor: '50000' } }),
        ),
      })),
    };
    await expect(
      service['consumeForSettlement'](manager as any, makeSettlement() as any, 'user-1', 'sig'),
    ).rejects.toThrow('Challenge is not bound to this settlement');
  });

  it('rejects a challenge whose amount does not match the settlement', async () => {
    const { service } = makeService();
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () =>
          makeChallenge({ payload: { settlementId: 'settle-1', amountMinor: '999' } }),
        ),
      })),
    };
    await expect(
      service['consumeForSettlement'](manager as any, makeSettlement() as any, 'user-1', 'sig'),
    ).rejects.toThrow('Challenge amount does not match the settlement');
  });

  it('consumes a correctly bound challenge', async () => {
    const { service, spies } = makeService();
    const manager = {
      getRepository: jest.fn(() => ({ findOne: jest.fn(async () => makeChallenge()) })),
    };
    await service['consumeForSettlement'](manager as any, makeSettlement() as any, 'user-1', 'sig');
    expect(spies.consume).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        challengeId: 'challenge-1',
        type: ChallengeType.SETTLEMENT,
        signature: 'sig',
      }),
    );
  });
});

describe('MerchantService.cancelOrder', () => {
  it('cancels an open order', async () => {
    const { service, order } = makeService();
    const result = await service.cancelOrder('user-1', 'ord_abc');
    expect(result.status).toBe(MerchantOrderStatus.CANCELLED);
    expect(order.status).toBe(MerchantOrderStatus.CANCELLED);
  });

  it('rejects cancelling a paid order', async () => {
    const { service } = makeService({ order: makeOrder({ status: MerchantOrderStatus.PAID }) });
    await expect(service.cancelOrder('user-1', 'ord_abc')).rejects.toThrow(
      'Paid orders cannot be cancelled',
    );
  });

  it('is idempotent for an already cancelled order', async () => {
    const { service } = makeService({
      order: makeOrder({ status: MerchantOrderStatus.CANCELLED }),
    });
    const result = await service.cancelOrder('user-1', 'ord_abc');
    expect(result.status).toBe(MerchantOrderStatus.CANCELLED);
  });

  it('returns an expired order unchanged', async () => {
    const { service } = makeService({ order: makeOrder({ status: MerchantOrderStatus.EXPIRED }) });
    const result = await service.cancelOrder('user-1', 'ord_abc');
    expect(result.status).toBe(MerchantOrderStatus.EXPIRED);
  });

  it('rejects an order belonging to another merchant', async () => {
    const { service } = makeService({ order: null });
    await expect(service.cancelOrder('user-1', 'ord_abc')).rejects.toThrow(NotFoundException);
  });
});

describe('MerchantService.expireOverdueOrders', () => {
  it('bulk-updates only open orders past their expiry', async () => {
    const { service, ordersRepo } = makeService();
    const now = new Date();
    const count = await service.expireOverdueOrders(now);
    expect(count).toBe(1);
    const [criteria, patch] = ordersRepo.update.mock.calls[0];
    expect(criteria.status).toBe(MerchantOrderStatus.OPEN);
    expect(criteria.expiresAt).toBeDefined();
    expect(patch).toEqual({ status: MerchantOrderStatus.EXPIRED });
  });
});

describe('MerchantService.verifyKyb', () => {
  it('marks a merchant verified', async () => {
    const { service } = makeService({ merchant: makeMerchant({ kybStatus: 'pending' }) });
    const result = await service.verifyKyb('merchant-1', 'verified');
    expect(result.kybStatus).toBe('verified');
  });

  it('marks a merchant rejected', async () => {
    const { service } = makeService();
    const result = await service.verifyKyb('merchant-1', 'rejected');
    expect(result.kybStatus).toBe('rejected');
  });

  it('rejects an unknown merchant', async () => {
    const { service, merchantsRepo } = makeService();
    merchantsRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.verifyKyb('missing', 'verified')).rejects.toThrow(NotFoundException);
  });
});

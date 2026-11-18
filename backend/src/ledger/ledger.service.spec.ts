import { BadRequestException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import {
  AccountStatus,
  AccountType,
  LedgerDirection,
  LedgerTransactionType,
} from '../common/enums';

interface LockedAccountRow {
  id: string;
  accountType: AccountType;
  currency: string;
  status: AccountStatus;
  net: string;
  held: string;
}

function mockEntityManager(
  accounts: LockedAccountRow[],
  entries: Array<{ accountId: string; direction: string; amount: bigint }> = [],
  holds: Array<{ accountId: string; amount: bigint; status: string }> = [],
): any {
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (sql.includes('FOR UPDATE')) {
      return accounts.filter((a) => params[0].includes(a.id));
    }
    if (sql.includes('ledger_entries') && sql.includes('GROUP BY')) {
      const nets: Array<{ accountId: string; net: string }> = [];
      for (const accountId of params[0]) {
        const sum = entries
          .filter((e) => e.accountId === accountId)
          .reduce((acc, e) => acc + (e.direction === 'credit' ? e.amount : -e.amount), 0n);
        nets.push({ accountId, net: sum.toString() });
      }
      return nets;
    }
    if (sql.includes('holds') && sql.includes('GROUP BY')) {
      const helds: Array<{ accountId: string; held: string }> = [];
      for (const accountId of params[0]) {
        const sum = holds
          .filter((h) => h.accountId === accountId && h.status === 'active')
          .reduce((acc, h) => acc + h.amount, 0n);
        helds.push({ accountId, held: sum.toString() });
      }
      return helds;
    }
    if (sql.includes('INSERT INTO "ledger_transactions"')) {
      return [
        {
          id: 'txn-1',
          idempotencyKey: params[0],
          type: params[1],
          reference: params[2],
          status: 'posted',
          metadata: params[3],
          createdAt: new Date(),
        },
      ];
    }
    return [];
  });

  const savedEntries: Array<{ accountId: string; direction: string; amount: string }> = [];
  const repository = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(async () => ({ id: 'txn-1' })),
    save: jest.fn(async (dto: any) => {
      if (Array.isArray(dto)) savedEntries.push(...dto);
      return dto;
    }),
    create: jest.fn((dto: any) => dto),
  };
  const getRepository = jest.fn(() => repository);

  return {
    query,
    getRepository,
    savedEntries,
    transaction: jest.fn(async (work: any) => work(mockEntityManager(accounts, entries, holds))),
  } as unknown;
}

function makeAccount(overrides: any): LockedAccountRow {
  return {
    id: overrides.id,
    accountType: overrides.accountType ?? AccountType.WALLET,
    currency: 'NGN',
    status: AccountStatus.ACTIVE,
    net: overrides.net ?? '0',
    held: overrides.held ?? '0',
    ...overrides,
  } as LockedAccountRow;
}

describe('LedgerService', () => {
  describe('post', () => {
    it('posts a balanced internal transfer', async () => {
      const source = makeAccount({ id: 'acc-1', net: '100000', held: '0' });
      const dest = makeAccount({ id: 'acc-2', net: '0', held: '0' });
      const entries = [{ accountId: 'acc-1', direction: 'credit' as const, amount: 100000n }];
      const manager = mockEntityManager([source, dest], entries);

      const service = new LedgerService({ query: manager.query } as any);
      await service.post(manager, {
        idempotencyKey: 'idem-1',
        type: LedgerTransactionType.INTERNAL_TRANSFER,
        reference: 'ref-1',
        legs: [
          { accountId: 'acc-1', direction: LedgerDirection.DEBIT, amount: 5000n },
          { accountId: 'acc-2', direction: LedgerDirection.CREDIT, amount: 5000n },
        ],
      });

      expect(manager.query).toHaveBeenCalled();
    });

    it('rejects unbalanced transactions', async () => {
      const source = makeAccount({ id: 'acc-1', net: '100000', held: '0' });
      const manager = mockEntityManager([source]);
      const service = new LedgerService({ query: manager.query } as any);

      await expect(
        service.post(manager, {
          idempotencyKey: 'idem-2',
          type: LedgerTransactionType.INTERNAL_TRANSFER,
          reference: 'ref-2',
          legs: [
            { accountId: 'acc-1', direction: LedgerDirection.DEBIT, amount: 5000n },
            { accountId: 'acc-1', direction: LedgerDirection.CREDIT, amount: 3000n },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects insufficient balance', async () => {
      const source = makeAccount({ id: 'acc-1', net: '1000', held: '0' });
      const dest = makeAccount({ id: 'acc-2', net: '0', held: '0' });
      const manager = mockEntityManager([source, dest]);
      const service = new LedgerService({ query: manager.query } as any);

      await expect(
        service.post(manager, {
          idempotencyKey: 'idem-3',
          type: LedgerTransactionType.INTERNAL_TRANSFER,
          reference: 'ref-3',
          legs: [
            { accountId: 'acc-1', direction: LedgerDirection.DEBIT, amount: 5000n },
            { accountId: 'acc-2', direction: LedgerDirection.CREDIT, amount: 5000n },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects single-leg transactions', async () => {
      const manager = mockEntityManager([]);
      const service = new LedgerService({ query: manager.query } as any);

      await expect(
        service.post(manager, {
          idempotencyKey: 'idem-4',
          type: LedgerTransactionType.INTERNAL_TRANSFER,
          reference: 'ref-4',
          legs: [{ accountId: 'acc-1', direction: LedgerDirection.DEBIT, amount: 5000n }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBalance', () => {
    it('returns balance summary', async () => {
      const manager = mockEntityManager([]);
      manager.query.mockResolvedValueOnce([
        {
          id: 'acc-1',
          accountType: AccountType.WALLET,
          currency: 'NGN',
          net: '50000',
          held: '10000',
        },
      ]);
      const service = new LedgerService({ query: manager.query } as any);

      const balance = await service.getBalance('acc-1');

      expect(balance.balance).toBe(50000n);
      expect(balance.held).toBe(10000n);
      expect(balance.available).toBe(40000n);
    });
  });

  describe('Paga pool (debit-normal)', () => {
    const POOL = 'pool-1';

    /** Debit-normal balance: debits minus credits. */
    function poolDelta(
      entries: Array<{ accountId: string; direction: string; amount: string }>,
    ): bigint {
      return entries
        .filter((e) => e.accountId === POOL)
        .reduce(
          (acc, e) => acc + (e.direction === 'debit' ? BigInt(e.amount) : -BigInt(e.amount)),
          0n,
        );
    }

    it('accepts the first inbound credit on a fresh database and grows the pool', async () => {
      const pool = makeAccount({ id: POOL, accountType: AccountType.PAGA_POOL });
      const wallet = makeAccount({ id: 'wallet-1' });
      const manager = mockEntityManager([pool, wallet]);
      const service = new LedgerService({ query: manager.query } as any);

      await service.post(manager, {
        idempotencyKey: 'paga-event:evt-1',
        type: LedgerTransactionType.INBOUND_CREDIT,
        reference: 'evt-1',
        legs: [
          { accountId: POOL, direction: LedgerDirection.DEBIT, amount: 25000n },
          { accountId: 'wallet-1', direction: LedgerDirection.CREDIT, amount: 25000n },
        ],
      });

      const posted: Array<{ accountId: string; direction: string; amount: string }> =
        manager.savedEntries;
      expect(poolDelta(posted)).toBe(25000n);
      const walletNet = posted
        .filter((e) => e.accountId === 'wallet-1')
        .reduce(
          (acc, e) => acc + (e.direction === 'credit' ? BigInt(e.amount) : -BigInt(e.amount)),
          0n,
        );
      expect(walletNet).toBe(25000n);
    });

    it('shrinks the pool when a bank payout leaves Paga', async () => {
      const pool = makeAccount({ id: POOL, accountType: AccountType.PAGA_POOL });
      const wallet = makeAccount({ id: 'wallet-1' });
      // History: a 25000 inbound credit already landed (pool debit, wallet credit).
      const history = [
        { accountId: POOL, direction: 'debit' as const, amount: 25000n },
        { accountId: 'wallet-1', direction: 'credit' as const, amount: 25000n },
      ];
      const manager = mockEntityManager([pool, wallet], history);
      const service = new LedgerService({ query: manager.query } as any);

      await service.post(manager, {
        idempotencyKey: 'transfer:t-1',
        type: LedgerTransactionType.BANK_TRANSFER,
        reference: 't-1',
        legs: [
          { accountId: 'wallet-1', direction: LedgerDirection.DEBIT, amount: 25000n },
          { accountId: POOL, direction: LedgerDirection.CREDIT, amount: 25000n },
        ],
      });

      expect(25000n + poolDelta(manager.savedEntries)).toBe(0n);
    });

    it('rejects a payout larger than the funds held at Paga', async () => {
      const pool = makeAccount({ id: POOL, accountType: AccountType.PAGA_POOL });
      const wallet = makeAccount({ id: 'wallet-1' });
      // Fixture isolates the pool's own guard: pool holds 1000, wallet 50000.
      const history = [
        { accountId: POOL, direction: 'debit' as const, amount: 1000n },
        { accountId: 'wallet-1', direction: 'credit' as const, amount: 50000n },
      ];
      const manager = mockEntityManager([pool, wallet], history);
      const service = new LedgerService({ query: manager.query } as any);

      await expect(
        service.post(manager, {
          idempotencyKey: 'transfer:t-2',
          type: LedgerTransactionType.BANK_TRANSFER,
          reference: 't-2',
          legs: [
            { accountId: 'wallet-1', direction: LedgerDirection.DEBIT, amount: 5000n },
            { accountId: POOL, direction: LedgerDirection.CREDIT, amount: 5000n },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reports a positive pool balance from a negative net', async () => {
      const manager = mockEntityManager([]);
      manager.query.mockResolvedValueOnce([
        {
          id: POOL,
          accountType: AccountType.PAGA_POOL,
          currency: 'NGN',
          net: '-25000',
          held: '0',
        },
      ]);
      const service = new LedgerService({ query: manager.query } as any);

      const balance = await service.getBalance(POOL);

      expect(balance.balance).toBe(25000n);
      expect(balance.available).toBe(25000n);
    });
  });
});

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

  const getRepository = jest.fn(() => ({
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(async (dto: any) => dto),
    create: jest.fn((dto: any) => dto),
  }));

  return {
    query,
    getRepository,
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
});

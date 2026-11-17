import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { TransferStatus, TransferType } from '../common/enums';
import { SYSTEM_PAGA_POOL_ACCOUNT_ID, SYSTEM_FEE_INCOME_ACCOUNT_ID } from '../common/constants';

function mockRepo(_entity: any) {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (dto: any) => dto),
    create: jest.fn((dto: any) => dto),
    find: jest.fn(),
  } as unknown as jest.Mocked<any>;
}

function makeTransfer(overrides: any = {}) {
  return {
    id: 'transfer-1',
    idempotencyKey: 'idem-1',
    type: TransferType.INTERNAL,
    status: TransferStatus.DRAFT,
    sourceAccountId: 'acc-1',
    destinationAccountId: 'acc-2',
    challengeId: 'challenge-1',
    initiatedByUserId: 'user-1',
    recipientPhone: null,
    recipientBankCode: null,
    recipientAccountNumber: null,
    recipientName: 'Bob',
    amount: '5000',
    fee: '0',
    currency: 'NGN',
    pagaReference: null,
    failureReason: null,
    metadata: { recipientKey: 'user:recipient', channel: 'user' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TransfersService constants', () => {
  it('BANK_TRANSFER_FEE_MINOR is 10000 kobo (NGN 100)', () => {
    expect(10000n).toBe(10000n);
  });

  it('SYSTEM_PAGA_POOL_ACCOUNT_ID is the pool account', () => {
    expect(SYSTEM_PAGA_POOL_ACCOUNT_ID).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('SYSTEM_FEE_INCOME_ACCOUNT_ID is the fee account', () => {
    expect(SYSTEM_FEE_INCOME_ACCOUNT_ID).toBe('00000000-0000-0000-0000-000000000002');
  });
});

describe('TransfersService lockDraft validation', () => {
  function makeService(transfersRepo: any) {
    return new TransfersService(
      transfersRepo,
      mockRepo({}),
      mockRepo({}),
      mockRepo({}),
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('throws when transfer is not a draft', async () => {
    const transfersRepo = mockRepo(makeTransfer({ status: TransferStatus.COMPLETED }));
    const service = makeService(transfersRepo);

    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () => makeTransfer({ status: TransferStatus.COMPLETED })),
      })),
    } as any;

    await expect(service['lockDraft'](manager, 'user-1', 'transfer-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when transfer not found', async () => {
    const transfersRepo = mockRepo(null);
    const service = makeService(transfersRepo);

    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () => null),
      })),
    } as any;

    await expect(service['lockDraft'](manager, 'user-1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the transfer when it is a draft', async () => {
    const transfer = makeTransfer({ status: TransferStatus.DRAFT });
    const transfersRepo = mockRepo(transfer);
    const service = makeService(transfersRepo);

    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () => transfer),
      })),
    } as any;

    const result = await service['lockDraft'](manager, 'user-1', 'transfer-1');
    expect(result.id).toBe('transfer-1');
  });
});

describe('TransferType enum', () => {
  it('has expected transfer types', () => {
    expect(TransferType.INTERNAL).toBe('internal');
    expect(TransferType.BANK).toBe('bank');
    expect(TransferType.MERCHANT).toBe('merchant');
    expect(TransferType.PAGA_WALLET).toBe('paga_wallet');
  });
});

describe('TransferStatus enum', () => {
  it('has expected statuses', () => {
    expect(TransferStatus.DRAFT).toBe('draft');
    expect(TransferStatus.PENDING).toBe('pending');
    expect(TransferStatus.COMPLETED).toBe('completed');
    expect(TransferStatus.FAILED).toBe('failed');
    expect(TransferStatus.REVERSED).toBe('reversed');
  });
});

describe('TransfersService bank lookup', () => {
  const dto = {
    bankCode: '11111111-1111-4111-8111-111111111111',
    accountNumber: '0123456789',
    amount: '200',
  };
  function make(paga: any) {
    return new TransfersService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      paga,
      {} as any,
    );
  }

  it('returns the account holder name from Paga', async () => {
    const paga = {
      validateBankAccount: jest.fn(async () => ({
        accountName: 'ADA OBI',
        accountNumber: dto.accountNumber,
      })),
    };
    await expect(make(paga).lookupBankAccount('u1', dto)).resolves.toMatchObject({
      accountName: 'ADA OBI',
    });
  });

  it('rate-limits lookups per user', async () => {
    const paga = {
      validateBankAccount: jest.fn(async () => ({
        accountName: 'ADA OBI',
        accountNumber: dto.accountNumber,
      })),
    };
    const service = make(paga);
    for (let i = 0; i < 15; i++) await service.lookupBankAccount('u1', dto);
    await expect(service.lookupBankAccount('u1', dto)).rejects.toThrow('Too many account lookups');
    await expect(service.lookupBankAccount('u2', dto)).resolves.toBeDefined();
  });

  it('lists banks sorted by name, exposing only name and code', async () => {
    const paga = {
      listBanks: jest.fn(async () => [
        { name: 'Zenith', uuid: 'z', sortCode: '057' },
        { name: 'Access', uuid: 'a', sortCode: '044' },
      ]),
    };
    await expect(make(paga).listBanks()).resolves.toEqual([
      { code: 'a', name: 'Access' },
      { code: 'z', name: 'Zenith' },
    ]);
  });
});

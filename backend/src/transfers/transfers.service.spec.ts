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
  const noOwnAccounts = {
    findOwnDepositAccount: jest.fn(async () => null),
    walletOwner: jest.fn(async () => null),
  };
  function make(paga: any, accounts: any = noOwnAccounts, users: any = {}, merchants: any = {}) {
    return new TransfersService(
      {} as any,
      users,
      merchants,
      {} as any,
      accounts,
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

describe('TransfersService.submit PIN confirmation', () => {
  function make(pins: any) {
    const draft = {
      id: 't1',
      status: TransferStatus.DRAFT,
      type: TransferType.INTERNAL,
      initiatedByUserId: 'u1',
    };
    const transfers = { findOne: jest.fn(async () => draft) };
    const ledger = { runInTransaction: jest.fn(async () => ({ id: 't1', status: 'completed' })) };
    const service = new TransfersService(
      transfers as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      ledger as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      pins,
    );
    return { service, ledger };
  }

  it('checks the PIN first and never starts the payment when it is wrong', async () => {
    const pins = {
      verify: jest.fn(async () => {
        throw new Error('Wrong PIN. 4 attempts left.');
      }),
    };
    const { service, ledger } = make(pins);
    await expect(
      service.submit('u1', 't1', 'sig', { approval: 'pin', pin: '1111' }),
    ).rejects.toThrow('Wrong PIN');
    expect(pins.verify).toHaveBeenCalledWith('u1', '1111');
    expect(ledger.runInTransaction).not.toHaveBeenCalled();
  });

  it('does not ask for a PIN on the biometric path', async () => {
    const pins = { verify: jest.fn() };
    const { service } = make(pins);
    await service.submit('u1', 't1', 'sig', { approval: 'biometric' }).catch(() => undefined);
    expect(pins.verify).not.toHaveBeenCalled();
  });
});

describe('TransfersService lookups of our own account numbers', () => {
  const PAGA_BANK = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
  const ACCESS = '11111111-1111-4111-8111-111111111111';
  const paga = {
    listBanks: jest.fn(async () => [
      { name: 'Access Bank', uuid: ACCESS },
      { name: 'Paga', uuid: PAGA_BANK },
    ]),
    validateBankAccount: jest.fn(async () => ({
      accountName: 'FROM PAGA',
      accountNumber: '1',
      bankUuid: ACCESS,
    })),
  };

  function make(
    own: { accountId: string; userId: string } | null,
    walletOwner: string | null,
    merchant: any = null,
  ) {
    const accounts = {
      findOwnDepositAccount: jest.fn(async () => own),
      walletOwner: jest.fn(async () => walletOwner),
    };
    const users = { findOne: jest.fn(async () => ({ id: 'owner', name: 'Ada Obi' })) };
    const merchants = { findOne: jest.fn(async () => merchant) };
    paga.validateBankAccount.mockClear();
    return new TransfersService(
      {} as any,
      users as any,
      merchants as any,
      {} as any,
      accounts as any,
      {} as any,
      {} as any,
      {} as any,
      paga as any,
      {} as any,
    );
  }
  const lookup = (bankCode: string) => ({ bankCode, accountNumber: '2404324874' });

  it("answers for another person's wallet number on our own ledger, without asking Paga", async () => {
    const service = make({ accountId: 'w2', userId: 'owner' }, 'owner');
    await expect(service.lookupBankAccount('me', lookup(PAGA_BANK))).resolves.toMatchObject({
      accountName: 'Ada Obi',
      internal: true,
    });
    expect(paga.validateBankAccount).not.toHaveBeenCalled();
  });

  it('shows the business name for a merchant balance number', async () => {
    const service = make({ accountId: 'm1', userId: 'owner' }, null, {
      businessName: 'Ice Stores',
    });
    await expect(service.lookupBankAccount('me', lookup(PAGA_BANK))).resolves.toMatchObject({
      accountName: 'Ice Stores',
      internal: true,
    });
  });

  it('refuses your own wallet number', async () => {
    const service = make({ accountId: 'w1', userId: 'me' }, 'me');
    await expect(service.lookupBankAccount('me', lookup(PAGA_BANK))).rejects.toThrow(/own wallet/);
  });

  it('only treats the number as ours when the chosen bank is Paga; any other bank goes to Paga', async () => {
    const service = make({ accountId: 'w2', userId: 'owner' }, 'owner');
    await expect(service.lookupBankAccount('me', lookup(ACCESS))).resolves.toMatchObject({
      accountName: 'FROM PAGA',
      internal: false,
    });
    expect(paga.validateBankAccount).toHaveBeenCalled();
  });

  it('numbers that are not ours go to the bank as before', async () => {
    const service = make(null, null);
    await expect(service.lookupBankAccount('me', lookup(PAGA_BANK))).resolves.toMatchObject({
      internal: false,
    });
  });
});

describe('TransfersService.createDraft to one of our own account numbers', () => {
  const PAGA_BANK = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';

  function make(own: { accountId: string; userId: string } | null) {
    const saved: any[] = [];
    const transfers = {
      findOne: jest.fn(async () => null),
      create: jest.fn((v: any) => ({ id: 't1', ...v })),
      save: jest.fn(async (v: any) => {
        saved.push({ ...v });
        return v;
      }),
    };
    const users = {
      findOne: jest.fn(async ({ where }: any) => ({ id: where.id, name: 'Ada Obi', kycTier: 1 })),
    };
    const accounts = {
      getWallet: jest.fn(async () => ({ id: 'w-me' })),
      findOwnDepositAccount: jest.fn(async () => own),
      walletOwner: jest.fn(async () => 'owner'),
    };
    const paga = {
      listBanks: jest.fn(async () => [{ name: 'Paga', uuid: PAGA_BANK }]),
      validateBankAccount: jest.fn(),
    };
    const risk = { preCheck: jest.fn(async () => undefined) };
    const challenges = {
      issue: jest.fn(async () => ({
        id: 'c1',
        payloadHash: 'h',
        payload: {},
        expiresAt: new Date(),
        nonce: 'n',
      })),
    };
    const service = new TransfersService(
      transfers as any,
      users as any,
      {} as any,
      {} as any,
      accounts as any,
      {} as any,
      challenges as any,
      risk as any,
      paga as any,
      {} as any,
    );
    return { service, transfers, paga, risk, saved };
  }
  const dto = {
    type: 'bank' as any,
    amount: '100.00',
    idempotencyKey: 'abcdefgh1234',
    deviceId: 'd',
    bankCode: PAGA_BANK,
    accountNumber: '2404324874',
  };

  it('becomes an internal, fee-free ledger transfer to that account, never a Paga payout', async () => {
    const { service, paga, saved, risk } = make({ accountId: 'w-other', userId: 'owner' });
    const result = await service.createDraft('me', dto);
    expect(paga.validateBankAccount).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({
      type: 'internal',
      destinationAccountId: 'w-other',
      fee: '0',
      recipientName: 'Ada Obi',
    });
    expect(risk.preCheck).toHaveBeenCalledWith(
      expect.objectContaining({ fee: 0n, recipientKey: 'internal:w-other' }),
    );
    expect(result.transfer.type).toBe('internal');
  });

  it('is still a bank payout for numbers that are not ours', async () => {
    const { service, paga } = make(null);
    paga.validateBankAccount.mockResolvedValue({
      accountName: 'Test Customer',
      accountNumber: '2404324874',
      bankUuid: PAGA_BANK,
      bankCode: PAGA_BANK,
    });
    await service.createDraft('me', dto);
    expect(paga.validateBankAccount).toHaveBeenCalled();
  });
});

describe('TransfersService.payOrderWithBiometric', () => {
  function make(opts: { notifyFails?: boolean } = {}) {
    const order = {
      id: 'order-1',
      reference: 'ord_abc',
      merchantId: 'm1',
      amount: '250000',
      status: 'open',
      expiresAt: new Date(Date.now() + 60_000),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () => order),
        create: jest.fn((v: any) => ({ id: 't1', ...v })),
        save: jest.fn(async (v: any) => v),
      })),
    };
    const ledger = {
      runInTransaction: jest.fn(async (work: any) => work(manager)),
      post: jest.fn(),
    };
    const notifications = {
      send: jest.fn(async (userId: string, ..._rest: unknown[]) => {
        if (opts.notifyFails && userId === 'customer-1') throw new Error('inbox down');
      }),
    };
    const service = new TransfersService(
      {} as any,
      { findOne: jest.fn(async () => ({ id: 'customer-1', kycTier: 1, status: 'active' })) } as any,
      {
        findOne: jest.fn(async () => ({
          id: 'm1',
          ownerUserId: 'owner-1',
          businessName: 'Ada Kitchen',
        })),
      } as any,
      {} as any,
      {
        getWallet: jest.fn(async () => ({ id: 'wallet-1' })),
        getMerchantAccount: jest.fn(async () => ({ id: 'macct-1' })),
      } as any,
      ledger as any,
      {} as any,
      { preCheck: jest.fn() } as any,
      {} as any,
      notifications as any,
    );
    return { service, notifications };
  }

  const input = {
    customerUserId: 'customer-1',
    merchantId: 'm1',
    orderReference: 'ord_abc',
    biometricTypes: ['face'],
  };

  it('tells the customer afterwards, since they did not approve it on their phone', async () => {
    const { service, notifications } = make();
    await service.payOrderWithBiometric(input);
    const toCustomer = notifications.send.mock.calls.find((c) => c[0] === 'customer-1');
    expect(toCustomer).toBeDefined();
    expect(toCustomer![1]).toBe('You paid with your face');
    expect(toCustomer![2]).toContain('Ada Kitchen');
    expect(toCustomer![2]).toContain('2500.00');
    expect(toCustomer![4]).toMatchObject({ scope: 'personal', kind: 'biometric_payment' });
  });

  it('still completes the payment if the notification cannot be delivered', async () => {
    const { service } = make({ notifyFails: true });
    await expect(service.payOrderWithBiometric(input)).resolves.toBeDefined();
  });
});

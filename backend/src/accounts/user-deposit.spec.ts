import { BadGatewayException } from '@nestjs/common';
import { UserDepositService } from './user-deposit.service';

function setup(o: { existing?: unknown; pagaFails?: boolean } = {}) {
  const users = {
    findOne: jest.fn(async () => ({ id: 'u1', name: 'Ada Obi', phone: '+2348012345678' })),
  };
  const accounts = {
    getWallet: jest.fn(async () => ({ id: 'w1' })),
    getVirtualAccountForAccount: jest.fn(async () => o.existing ?? null),
    createVirtualAccount: jest.fn(async (_u: string, _a: string, d: Record<string, string>) => d),
  };
  const paga = {
    createVirtualAccount: jest.fn(async () => {
      if (o.pagaFails) throw new BadGatewayException('Paga failed (500)');
      return { accountNumber: '1234567890', bankName: 'Paga', providerReference: 'ref' };
    }),
  };
  return {
    service: new UserDepositService(accounts as never, paga as never, users as never),
    accounts,
    paga,
  };
}

describe('UserDepositService', () => {
  it('creates the account for the wallet on first request', async () => {
    const { service, accounts, paga } = setup();
    await expect(service.getOrCreate('u1')).resolves.toEqual({
      bankName: 'Paga',
      accountNumber: '1234567890',
      accountName: 'Ada Obi',
    });
    expect(paga.createVirtualAccount).toHaveBeenCalledWith({
      userId: 'u1',
      name: 'Ada Obi',
      phone: '+2348012345678',
    });
    expect(accounts.createVirtualAccount.mock.calls[0][1]).toBe('w1');
  });

  it('reuses an existing account without calling the provider', async () => {
    const { service, paga } = setup({ existing: { accountNumber: '999', bankName: 'Paga' } });
    expect((await service.getOrCreate('u1')).accountNumber).toBe('999');
    expect(paga.createVirtualAccount).not.toHaveBeenCalled();
  });

  it('shares one creation between simultaneous requests', async () => {
    const { service, paga } = setup();
    await Promise.all([service.getOrCreate('u1'), service.getOrCreate('u1')]);
    expect(paga.createVirtualAccount).toHaveBeenCalledTimes(1);
  });

  it('stores nothing when the provider fails', async () => {
    const { service, accounts } = setup({ pagaFails: true });
    await expect(service.getOrCreate('u1')).rejects.toThrow(BadGatewayException);
    expect(accounts.createVirtualAccount).not.toHaveBeenCalled();
  });
});

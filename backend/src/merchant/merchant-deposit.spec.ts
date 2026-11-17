import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { MerchantDepositService } from './merchant-deposit.service';

function setup(opts: { merchant?: unknown; existing?: unknown; pagaFails?: boolean } = {}) {
  const merchant =
    opts.merchant === undefined
      ? { id: 'm1', businessName: 'Ada Kitchen', settlementAccountId: 'acct-m1' }
      : opts.merchant;
  const merchants = { findOne: jest.fn(async () => merchant) };
  const users = { findOne: jest.fn(async () => ({ id: 'u1', phone: '+2348012345678' })) };
  const accounts = {
    getVirtualAccountForAccount: jest.fn(async () => opts.existing ?? null),
    createVirtualAccount: jest.fn(async (_u: string, _a: string, d: Record<string, string>) => d),
  };
  const paga = {
    createVirtualAccount: jest.fn(async () => {
      if (opts.pagaFails) throw new BadGatewayException('Paga failed (500)');
      return { accountNumber: '1234567890', bankName: 'Paga', providerReference: 'ref' };
    }),
  };
  const service = new MerchantDepositService(
    merchants as never,
    users as never,
    accounts as never,
    paga as never,
  );
  return { service, accounts, paga };
}

describe('MerchantDepositService', () => {
  it('creates the account against the merchant balance on first use', async () => {
    const { service, accounts, paga } = setup();
    const result = await service.getDepositAccount('u1');
    expect(result).toEqual({
      bankName: 'Paga',
      accountNumber: '1234567890',
      accountName: 'Ada Kitchen',
    });
    expect(paga.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'm1', name: 'Ada Kitchen' }),
    );
    // Credited to the merchant balance account, not the owner's wallet.
    expect(accounts.createVirtualAccount.mock.calls[0][1]).toBe('acct-m1');
  });

  it('reuses an existing account without calling Paga', async () => {
    const { service, paga } = setup({ existing: { accountNumber: '999', bankName: 'Paga' } });
    expect((await service.getDepositAccount('u1')).accountNumber).toBe('999');
    expect(paga.createVirtualAccount).not.toHaveBeenCalled();
  });

  it('shares one provisioning between simultaneous requests', async () => {
    const { service, paga } = setup();
    await Promise.all([service.getDepositAccount('u1'), service.getDepositAccount('u1')]);
    expect(paga.createVirtualAccount).toHaveBeenCalledTimes(1);
  });

  it('surfaces a Paga failure and stores nothing', async () => {
    const { service, accounts } = setup({ pagaFails: true });
    await expect(service.getDepositAccount('u1')).rejects.toThrow(BadGatewayException);
    expect(accounts.createVirtualAccount).not.toHaveBeenCalled();
  });

  it('needs a merchant profile', async () => {
    await expect(setup({ merchant: null }).service.getDepositAccount('u1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

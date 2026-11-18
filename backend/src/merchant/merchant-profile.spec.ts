import { BadRequestException, ConflictException } from '@nestjs/common';
import { SettlementStatus } from '../common/enums';
import { MerchantService } from './merchant.service';

function setup(inFlight = 0) {
  const merchant: any = {
    id: 'merchant-1',
    ownerUserId: 'user-1',
    handle: 'biz',
    businessName: 'Biz',
    kybStatus: 'verified',
    status: 'active',
    settlementBankCode: '058',
    settlementAccountNumber: '0123456789',
    settlementAccountName: 'Biz',
    createdAt: new Date(),
  };
  const merchants = {
    findOne: jest.fn(async () => merchant),
    save: jest.fn(async (m: any) => m),
  };
  const settlements = { count: jest.fn(async () => inFlight) };
  const paga = {
    validateBankAccount: jest.fn(async (i: any) => ({
      accountName: 'RESOLVED NAME',
      bankCode: i.bankCode,
      accountNumber: i.accountNumber,
      bankUuid: i.bankCode,
    })),
  };
  const service = new MerchantService(
    {} as any,
    merchants as any,
    {} as any,
    settlements as any,
    {} as any,
    {} as any,
    {} as any,
    paga as any,
  );
  return { service, merchant, merchants, settlements, paga };
}

const BANK_UUID = '11111111-1111-4111-8111-111111111111';
const bank = {
  settlementBankCode: BANK_UUID,
  settlementAccountNumber: '9876543210',
};

describe('MerchantService.updateProfile', () => {
  it('updates the bank details as a complete set', async () => {
    const { service, merchants } = setup();
    const result = await service.updateProfile('user-1', bank);
    expect(result.settlementBankCode).toBe(BANK_UUID);
    expect(result.settlementAccountNumber).toBe('9876543210');
    // The name is whatever the bank says, never client-supplied.
    expect(result.settlementAccountName).toBe('RESOLVED NAME');
    expect(merchants.save).toHaveBeenCalled();
  });

  it('saves nothing when the bank cannot verify the account', async () => {
    const { service, merchants, paga } = setup();
    paga.validateBankAccount.mockRejectedValueOnce(new BadRequestException('Could not validate'));
    await expect(service.updateProfile('user-1', bank)).rejects.toThrow(BadRequestException);
    expect(merchants.save).not.toHaveBeenCalled();
  });

  it('rejects a partial set of bank fields', async () => {
    const { service, merchants } = setup();
    await expect(
      service.updateProfile('user-1', { settlementAccountNumber: '9876543210' }),
    ).rejects.toThrow(BadRequestException);
    expect(merchants.save).not.toHaveBeenCalled();
  });

  it('rejects an empty update', async () => {
    const { service } = setup();
    await expect(service.updateProfile('user-1', {})).rejects.toThrow(BadRequestException);
  });

  it('refuses to change bank details while a settlement is in flight', async () => {
    const { service, merchants, settlements } = setup(1);
    await expect(service.updateProfile('user-1', bank)).rejects.toThrow(ConflictException);
    expect(merchants.save).not.toHaveBeenCalled();
    const where = (settlements.count.mock.calls as any[][])[0][0].where;
    expect(where.merchantId).toBe('merchant-1');
    expect(where.status._value).toEqual([
      SettlementStatus.DRAFT,
      SettlementStatus.PENDING,
      SettlementStatus.PROCESSING,
    ]);
  });

  it('allows renaming the business even while a settlement is in flight', async () => {
    const { service } = setup(1);
    const result = await service.updateProfile('user-1', { businessName: ' New Biz ' });
    expect(result.businessName).toBe('New Biz');
  });
});

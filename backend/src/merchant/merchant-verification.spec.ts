import { MerchantVerificationService, nameMatches } from './merchant-verification.service';

function setup(
  o: { kyb?: string; tier?: number; identity?: unknown; accountName?: string | null } = {},
) {
  const merchant: Record<string, unknown> = {
    id: 'm1',
    kybStatus: o.kyb ?? 'pending',
    settlementAccountName: o.accountName === undefined ? 'ADA OBI' : o.accountName,
  };
  const merchants = {
    findOne: jest.fn(async () => merchant),
    save: jest.fn(async (m: unknown) => m),
  };
  const users = { findOne: jest.fn(async () => ({ id: 'u1', kycTier: o.tier ?? 1 })) };
  const identities = {
    findOne: jest.fn(async () =>
      o.identity === undefined ? { firstName: 'Ada', lastName: 'Obi' } : o.identity,
    ),
  };
  return {
    service: new MerchantVerificationService(
      merchants as never,
      users as never,
      identities as never,
    ),
    merchants,
    merchant,
  };
}

describe('MerchantVerificationService', () => {
  it('verifies when the owner is BVN-verified and the payout account is in their name', async () => {
    const { service, merchant } = setup();
    await expect(service.check('u1')).resolves.toMatchObject({
      kybStatus: 'verified',
      reason: 'verified',
    });
    expect(merchant.kybStatus).toBe('verified');
  });

  it('waits for identity verification first', async () => {
    const { service, merchants } = setup({ tier: 0, identity: null });
    await expect(service.check('u1')).resolves.toMatchObject({
      reason: 'identity_required',
      kybStatus: 'pending',
    });
    expect(merchants.save).not.toHaveBeenCalled();
  });

  it('needs a payout bank account', async () => {
    await expect(setup({ accountName: null }).service.check('u1')).resolves.toMatchObject({
      reason: 'bank_required',
    });
  });

  it('leaves a name mismatch pending for human review', async () => {
    const { service, merchants } = setup({ accountName: 'ACME TRADING LTD' });
    await expect(service.check('u1')).resolves.toMatchObject({
      reason: 'name_mismatch',
      kybStatus: 'pending',
    });
    expect(merchants.save).not.toHaveBeenCalled();
  });

  it('never overrides an admin rejection', async () => {
    const { service, merchants } = setup({ kyb: 'rejected' });
    await expect(service.check('u1')).resolves.toMatchObject({
      reason: 'rejected',
      kybStatus: 'rejected',
    });
    expect(merchants.save).not.toHaveBeenCalled();
  });
});

describe('nameMatches', () => {
  it('matches in any order, ignoring case, accents and punctuation', () => {
    expect(nameMatches('OBI, ADA CHIOMA', 'Ada', 'Obi')).toBe(true);
    expect(nameMatches('Adé Obi', 'Ade', 'Obi')).toBe(true);
  });
  it('requires both names', () => {
    expect(nameMatches('ADA OKAFOR', 'Ada', 'Obi')).toBe(false);
    expect(nameMatches('OBI', 'Ada', 'Obi')).toBe(false);
  });
});

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
      { get: jest.fn() } as never,
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

describe('business levels', () => {
  function levelSetup(m: Record<string, unknown>) {
    const merchant: Record<string, unknown> = {
      id: 'm1',
      ownerUserId: 'u1',
      kybStatus: 'verified',
      registrationStatus: 'none',
      ...m,
    };
    const merchants = {
      findOne: jest.fn(async () => merchant),
      save: jest.fn(async (v: unknown) => v),
    };
    const service = new MerchantVerificationService(
      merchants as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { get: jest.fn() } as never,
    );
    return { service, merchant, merchants };
  }

  it('reports level 1 for a verified owner and level 2 once the registration is verified', async () => {
    expect((await levelSetup({}).service.getLevels('u1')).currentLevel).toBe(1);
    expect(
      (await levelSetup({ registrationStatus: 'verified' }).service.getLevels('u1')).currentLevel,
    ).toBe(2);
    expect((await levelSetup({ kybStatus: 'pending' }).service.getLevels('u1')).currentLevel).toBe(
      0,
    );
  });

  it('accepts a well-formed CAC number as pending review, normalising it', async () => {
    const { service, merchant } = levelSetup({});
    await service.submitRegistration('u1', { cacNumber: ' rc 1234567 ', tin: '12345678-0001' });
    expect(merchant.cacNumber).toBe('RC1234567');
    expect(merchant.registrationStatus).toBe('pending');
  });

  it('rejects malformed numbers, an unverified owner and duplicate submissions', async () => {
    await expect(
      levelSetup({}).service.submitRegistration('u1', { cacNumber: '12345' }),
    ).rejects.toThrow(/CAC number/);
    await expect(
      levelSetup({}).service.submitRegistration('u1', { cacNumber: 'RC1234567', tin: 'abc' }),
    ).rejects.toThrow(/TIN/);
    await expect(
      levelSetup({ kybStatus: 'pending' }).service.submitRegistration('u1', {
        cacNumber: 'RC1234567',
      }),
    ).rejects.toThrow(/level 1/);
    await expect(
      levelSetup({ registrationStatus: 'pending' }).service.submitRegistration('u1', {
        cacNumber: 'RC1234567',
      }),
    ).rejects.toThrow(/already/);
  });

  it('lets a reviewer decide only on a pending registration', async () => {
    const pending = levelSetup({ registrationStatus: 'pending' });
    await expect(pending.service.reviewRegistration('m1', 'verified')).resolves.toMatchObject({
      registrationStatus: 'verified',
    });
    await expect(levelSetup({}).service.reviewRegistration('m1', 'verified')).rejects.toThrow(
      /no registration/,
    );
  });
});

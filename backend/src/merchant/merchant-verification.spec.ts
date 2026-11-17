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

describe('business levels', () => {
  const CERT = '33333333-3333-4333-8333-333333333333';

  function levelSetup(m: Record<string, unknown>, companies: unknown = [], docOk = true) {
    const merchant: Record<string, unknown> = {
      id: 'm1',
      ownerUserId: 'u1',
      businessName: 'Ada Kitchen',
      kybStatus: 'verified',
      registrationStatus: 'none',
      ...m,
    };
    const merchants = {
      findOne: jest.fn(async () => merchant),
      save: jest.fn(async (v: unknown) => v),
    };
    const documents = {
      assertOwned: jest.fn(async () => {
        if (!docOk) throw new Error('missing');
      }),
    };
    const verifier = {
      searchCompany: jest.fn(async () => {
        if (companies instanceof Error) throw companies;
        return companies;
      }),
    };
    const service = new MerchantVerificationService(
      merchants as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { get: jest.fn() } as never,
      documents as never,
      verifier as never,
    );
    return { service, merchant, merchants, documents, verifier };
  }
  const input = { cacNumber: ' rc 1234567 ', tin: '12345678-0001', certificateDocumentId: CERT };

  it('reports level 1 for a verified owner and level 2 once the registration is verified', async () => {
    expect((await levelSetup({}).service.getLevels('u1')).currentLevel).toBe(1);
    expect(
      (await levelSetup({ registrationStatus: 'verified' }).service.getLevels('u1')).currentLevel,
    ).toBe(2);
    expect((await levelSetup({ kybStatus: 'pending' }).service.getLevels('u1')).currentLevel).toBe(
      0,
    );
  });

  it('verifies at once when the company registry confirms number, active status and name', async () => {
    const { service, merchant, verifier } = levelSetup({}, [
      { name: 'ADA KITCHEN LIMITED', registrationNumber: '1234567', status: 'active' },
    ]);
    await service.submitRegistration('u1', input);
    expect(verifier.searchCompany).toHaveBeenCalledWith('1234567');
    expect(merchant.cacNumber).toBe('RC1234567');
    expect(merchant.cacDocumentId).toBe(CERT);
    expect(merchant.registrationStatus).toBe('verified');
  });

  it.each([
    ['the registry finds nothing', []],
    [
      'the company is not active',
      [{ name: 'ADA KITCHEN LIMITED', registrationNumber: '1234567', status: 'dissolved' }],
    ],
    [
      'the name is different',
      [{ name: 'ZENITH OIL AND GAS', registrationNumber: '1234567', status: 'active' }],
    ],
    [
      'the number is different',
      [{ name: 'ADA KITCHEN LIMITED', registrationNumber: '7654321', status: 'active' }],
    ],
    ['the registry is unavailable', new Error('down')],
  ])('goes to a person for review when %s', async (_name, companies) => {
    const { service, merchant } = levelSetup({}, companies);
    await service.submitRegistration('u1', input);
    expect(merchant.registrationStatus).toBe('pending');
  });

  it('rejects malformed numbers, a missing certificate, an unverified owner and duplicates', async () => {
    await expect(
      levelSetup({}).service.submitRegistration('u1', { ...input, cacNumber: '12345' }),
    ).rejects.toThrow(/CAC number/);
    await expect(
      levelSetup({}).service.submitRegistration('u1', { ...input, tin: 'abc' }),
    ).rejects.toThrow(/TIN/);
    await expect(
      levelSetup({}, [], false).service.submitRegistration('u1', input),
    ).rejects.toThrow();
    await expect(
      levelSetup({ kybStatus: 'pending' }).service.submitRegistration('u1', input),
    ).rejects.toThrow(/level 1/);
    await expect(
      levelSetup({ registrationStatus: 'pending' }).service.submitRegistration('u1', input),
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

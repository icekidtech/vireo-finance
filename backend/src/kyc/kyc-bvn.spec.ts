import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycStatus } from '../common/enums';
import { DiditIdentityVerifier } from './didit-identity.verifier';
import { KycService } from './kyc.service';

const KEY = randomBytes(32).toString('base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const SELFIE = JPEG.toString('base64').padEnd(120, 'A');
const dto = {
  bvn: '12345678901',
  firstName: 'Ada',
  lastName: 'Obi',
  dateOfBirth: '1990-04-02',
  selfie: JPEG.toString('base64'),
};

type Verifier = {
  name: string;
  isLive: jest.Mock;
  verifyBvn: jest.Mock;
  verifyNin: jest.Mock;
  readIdDocument: jest.Mock;
  faceMatchScore: jest.Mock;
  verifyProofOfAddress: jest.Mock;
};

function setup(
  opts: {
    verifier?: Partial<Verifier>;
    identity?: Record<string, unknown> | null;
    usedBy?: unknown;
    failed?: number;
    key?: string;
    tier?: number;
  } = {},
) {
  const saved: Record<string, unknown>[] = [];
  const identityRow = opts.identity === undefined ? null : opts.identity;
  const identities = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      'bvnHash' in where || 'ninHash' in where ? (opts.usedBy ?? null) : identityRow,
    ),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => {
      saved.push(v);
      return v;
    }),
  };
  const records = {
    findOne: jest.fn(async () => ({ status: KycStatus.VERIFIED })),
    count: jest.fn(async () => opts.failed ?? 0),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => {
      saved.push(v);
      return v;
    }),
  };
  const user = { id: 'u1', kycTier: opts.tier ?? 0 };
  const users = { findOne: jest.fn(async () => user), save: jest.fn(async (u: unknown) => u) };
  const verifier: Verifier = {
    name: 'didit',
    isLive: jest.fn(async () => true),
    verifyBvn: jest.fn(async () => true),
    verifyNin: jest.fn(async () => true),
    readIdDocument: jest.fn(async () => ({
      approved: true,
      firstName: 'ADA',
      lastName: 'OBI',
      dateOfBirth: '1990-04-02',
      portrait: Buffer.from('portrait'),
    })),
    faceMatchScore: jest.fn(async () => 92),
    verifyProofOfAddress: jest.fn(async () => true),
    ...opts.verifier,
  };
  const documents = {
    isAvailable: jest.fn(() => true),
    loadOwned: jest.fn(async () => ({ bytes: JPEG, mime: 'image/jpeg' })),
  };
  const caps = { reconcile: jest.fn(async () => 0n) };
  const config = {
    get: jest.fn((k: string) =>
      k === 'kyc.encryptionKey' ? (opts.key ?? KEY) : k === 'kyc.minFaceMatch' ? 75 : undefined,
    ),
  };
  const service = new KycService(
    records as never,
    users as never,
    identities as never,
    config as never,
    verifier as never,
    documents as never,
    caps as never,
  );
  return { service, saved, verifier, user, users, records, identities, documents, caps };
}

const identity = {
  firstName: 'Ada',
  lastName: 'Obi',
  dateOfBirth: '1990-04-02',
  bvnLast4: '8901',
  ninHash: null,
  addressEncrypted: null,
};
const tier2 = {
  nin: '10987654321',
  idFrontDocumentId: '11111111-1111-4111-8111-111111111111',
  selfie: JPEG.toString('base64'),
};

describe('KycService.verifyBvn (tier 1)', () => {
  it('checks liveness and the BVN with the selfie, stores the BVN encrypted and raises the tier', async () => {
    const { service, saved, verifier, users, caps } = setup();
    await service.verifyBvn('u1', dto);
    expect(verifier.isLive).toHaveBeenCalled();
    expect(verifier.verifyBvn).toHaveBeenCalledWith(
      expect.objectContaining({ bvn: dto.bvn, selfie: expect.any(Buffer) }),
    );
    const id = saved.find((s) => 'bvnEncrypted' in s) as Record<string, string>;
    expect(id.bvnEncrypted.startsWith('v1:')).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(dto.bvn);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ kycTier: 1 }));
    expect(caps.reconcile).toHaveBeenCalledWith('u1');
  });

  it('does not match the BVN when the selfie is not a live person', async () => {
    const { service, verifier, saved } = setup({
      verifier: { isLive: jest.fn(async () => false) },
    });
    await expect(service.verifyBvn('u1', dto)).rejects.toThrow(BadRequestException);
    expect(verifier.verifyBvn).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({ status: KycStatus.REJECTED, provider: 'bvn' });
  });

  it('records a rejection, without suspending, when details do not match', async () => {
    const { service, saved } = setup({ verifier: { verifyBvn: jest.fn(async () => false) } });
    await expect(service.verifyBvn('u1', dto)).rejects.toThrow(BadRequestException);
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain(dto.bvn);
  });

  it('refuses a BVN already used elsewhere with the same message as a mismatch', async () => {
    const a = await setup({ usedBy: { userId: 'other' } })
      .service.verifyBvn('u1', dto)
      .catch((e: Error) => e);
    const b = await setup({ verifier: { verifyBvn: jest.fn(async () => false) } })
      .service.verifyBvn('u1', dto)
      .catch((e: Error) => e);
    expect((a as Error).message).toBe((b as Error).message);
  });

  it('stops after repeated failures, rejects bad input, and fails closed without a key or vendor', async () => {
    const limited = setup({ failed: 3 });
    await expect(limited.service.verifyBvn('u1', dto)).rejects.toThrow(/Too many/);
    expect(limited.verifier.isLive).not.toHaveBeenCalled();
    await expect(
      setup().service.verifyBvn('u1', { ...dto, dateOfBirth: '2999-01-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      setup().service.verifyBvn('u1', { ...dto, selfie: 'not-an-image' }),
    ).rejects.toThrow(/selfie/);
    await expect(setup({ key: '' }).service.verifyBvn('u1', dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(setup({ identity }).service.verifyBvn('u1', dto)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('KycService.verifyNinAndId (tier 2)', () => {
  it('needs tier 1 first', async () => {
    await expect(setup().service.verifyNinAndId('u1', tier2)).rejects.toThrow(/tier 1/);
  });

  it('passes when NIN, ID document and selfie all agree, and stores the NIN encrypted', async () => {
    const { service, saved, users, documents } = setup({ identity: { ...identity }, tier: 1 });
    await service.verifyNinAndId('u1', tier2);
    expect(documents.loadOwned).toHaveBeenCalledWith('u1', tier2.idFrontDocumentId, ['id_front']);
    const updated = saved.find((s) => 'ninEncrypted' in s) as Record<string, string>;
    expect(updated.ninEncrypted.startsWith('v1:')).toBe(true);
    expect(updated.ninLast4).toBe('4321');
    expect(JSON.stringify(saved)).not.toContain(tier2.nin);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ kycTier: 2 }));
  });

  it.each([
    ['NIN does not match', { verifyNin: jest.fn(async () => false) }],
    [
      'ID is for a different person',
      {
        readIdDocument: jest.fn(async () => ({
          approved: true,
          firstName: 'Chi',
          lastName: 'Eze',
          dateOfBirth: '1990-04-02',
          portrait: Buffer.from('p'),
        })),
      },
    ],
    [
      'ID date of birth differs',
      {
        readIdDocument: jest.fn(async () => ({
          approved: true,
          firstName: 'Ada',
          lastName: 'Obi',
          dateOfBirth: '1991-01-01',
          portrait: Buffer.from('p'),
        })),
      },
    ],
    [
      'ID is declined',
      {
        readIdDocument: jest.fn(async () => ({
          approved: false,
          firstName: 'Ada',
          lastName: 'Obi',
          dateOfBirth: '',
          portrait: Buffer.from('p'),
        })),
      },
    ],
    [
      'ID has no portrait',
      {
        readIdDocument: jest.fn(async () => ({
          approved: true,
          firstName: 'Ada',
          lastName: 'Obi',
          dateOfBirth: '',
          portrait: null,
        })),
      },
    ],
    ['selfie does not match the ID photo', { faceMatchScore: jest.fn(async () => 40) }],
    ['selfie is not live', { isLive: jest.fn(async () => false) }],
  ])('rejects when %s, without raising the tier', async (_name, override) => {
    const { service, users, saved } = setup({
      identity: { ...identity },
      tier: 1,
      verifier: override as Partial<Verifier>,
    });
    await expect(service.verifyNinAndId('u1', tier2)).rejects.toThrow(BadRequestException);
    expect(users.save).not.toHaveBeenCalled();
    expect(saved.some((s) => s.status === KycStatus.REJECTED && s.provider === 'nin_id')).toBe(
      true,
    );
  });
});

describe('KycService.verifyAddress (tier 3)', () => {
  const body = {
    address: '12 Allen Avenue, Ikeja, Lagos',
    proofDocumentId: '22222222-2222-4222-8222-222222222222',
  };

  it('needs tier 2 first', async () => {
    await expect(
      setup({ identity: { ...identity } }).service.verifyAddress('u1', body),
    ).rejects.toThrow(/tier 2/);
  });

  it('raises the tier when the proof of address is accepted, keeping the address encrypted', async () => {
    const { service, saved, users, verifier } = setup({
      identity: { ...identity, ninHash: 'h' },
      tier: 2,
    });
    await service.verifyAddress('u1', body);
    expect(verifier.verifyProofOfAddress).toHaveBeenCalledWith(
      expect.objectContaining({ address: body.address, firstName: 'Ada' }),
    );
    expect(JSON.stringify(saved)).not.toContain(body.address);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ kycTier: 3 }));
  });

  it('rejects an unaccepted document', async () => {
    const { service, users } = setup({
      identity: { ...identity, ninHash: 'h' },
      tier: 2,
      verifier: { verifyProofOfAddress: jest.fn(async () => false) },
    });
    await expect(service.verifyAddress('u1', body)).rejects.toThrow(BadRequestException);
    expect(users.save).not.toHaveBeenCalled();
  });
});

describe('KycService.getUserKycStatus', () => {
  function statusFor(record: unknown, identityRow: unknown = null) {
    const records = { findOne: jest.fn(async () => record) };
    const users = { findOne: jest.fn(async () => ({ id: 'u1', kycTier: 0 })) };
    const identities = { findOne: jest.fn(async () => identityRow) };
    return new KycService(
      records as never,
      users as never,
      identities as never,
      { get: jest.fn() } as never,
      null,
      { isAvailable: () => false } as never,
    ).getUserKycStatus('u1');
  }

  it('is not_started before anything is submitted', async () => {
    await expect(statusFor(null)).resolves.toMatchObject({ status: 'not_started' });
  });
  it('is pending after an automated check that did not match', async () => {
    await expect(statusFor({ provider: 'bvn', status: KycStatus.REJECTED })).resolves.toMatchObject(
      { status: 'pending' },
    );
  });
  it('stays rejected when a reviewer rejected a manual submission', async () => {
    await expect(
      statusFor({ provider: 'manual', status: KycStatus.REJECTED }),
    ).resolves.toMatchObject({ status: 'rejected' });
  });
  it('is verified once the identity is on file', async () => {
    await expect(
      statusFor({ provider: 'bvn', status: KycStatus.VERIFIED }, { bvnLast4: '1234' }),
    ).resolves.toMatchObject({ status: 'verified', bvnLast4: '1234' });
  });
});

describe('DiditIdentityVerifier', () => {
  const v = new DiditIdentityVerifier({
    apiKey: 'k',
    baseUrl: 'https://didit.test/v3',
    timeoutMs: 1000,
  });
  const reply = (body: unknown, status = 200) =>
    ({ ok: status < 300, status, json: async () => body }) as Response;
  const img = Buffer.from('img');

  beforeEach(() => {
    for (const m of ['log', 'error'])
      jest.spyOn((v as any).client.logger, m).mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const dv = (service: string, outcome: string) =>
    reply({
      database_validation: { validations: [{ service_id: service, outcome_code: outcome }] },
    });

  it('sends the BVN with the selfie and accepts only a MATCH outcome', async () => {
    const f = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(dv('nga_bank_verification_number', 'MATCH'));
    await expect(
      v.verifyBvn({
        bvn: '12345678901',
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '1990-01-01',
        selfie: img,
      }),
    ).resolves.toBe(true);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://didit.test/v3/database-validation/');
    const body = init.body as FormData;
    expect(body.get('services')).toBe('nga_bank_verification_number');
    expect(body.get('selfie')).toBeInstanceOf(Blob);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    for (const outcome of [
      'PARTIAL_MATCH',
      'BIOMETRIC_NO_MATCH',
      'DOCUMENT_NOT_FOUND',
      'INCONCLUSIVE',
    ]) {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(dv('nga_bank_verification_number', outcome));
      await expect(
        v.verifyBvn({
          bvn: '12345678901',
          firstName: 'A',
          lastName: 'B',
          dateOfBirth: '1990-01-01',
          selfie: img,
        }),
      ).resolves.toBe(false);
    }
  });

  it('checks the NIN through the national-id service', async () => {
    const f = jest.spyOn(global, 'fetch').mockResolvedValueOnce(dv('nga_national_id', 'MATCH'));
    await expect(
      v.verifyNin({ nin: '10987654321', firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' }),
    ).resolves.toBe(true);
    const body = (f.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get('services')).toBe('nga_national_id');
    expect(body.get('national_id')).toBe('10987654321');
  });

  it('fails closed on a vendor error or an unreadable answer', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({ detail: 'boom' }, 500));
    await expect(
      v.verifyNin({ nin: '1', firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' }),
    ).rejects.toThrow(ServiceUnavailableException);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({}));
    await expect(
      v.verifyNin({ nin: '1', firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('reads an ID document and decodes the inline portrait', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      reply({
        id_verification: {
          status: 'Approved',
          first_name: 'Ada',
          last_name: 'Obi',
          date_of_birth: '1990-04-02',
          portrait_image: Buffer.from('face').toString('base64'),
        },
      }),
    );
    const r = await v.readIdDocument(img);
    expect(r).toMatchObject({ approved: true, firstName: 'Ada', dateOfBirth: '1990-04-02' });
    expect(r.portrait?.toString()).toBe('face');
  });

  it('never fetches a portrait URL', async () => {
    const f = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      reply({
        id_verification: { status: 'Approved', portrait_image: 'https://evil.example/x.jpg' },
      }),
    );
    expect((await v.readIdDocument(img)).portrait).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('only passes a live, single face, and returns the raw match score', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ liveness: { status: 'Approved', warnings: [] } }));
    await expect(v.isLive(img)).resolves.toBe(true);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      reply({
        liveness: { status: 'Approved', warnings: [{ risk: 'MULTIPLE_FACES_DETECTED' }] },
      }),
    );
    await expect(v.isLive(img)).resolves.toBe(false);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({ face_match: { score: 88.5 } }));
    await expect(v.faceMatchScore(img, img)).resolves.toBe(88.5);
  });

  it('proof of address and company search use their endpoints', async () => {
    const f = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ poa: { status: 'Approved' } }));
    await expect(
      v.verifyProofOfAddress({
        document: img,
        mime: 'application/pdf',
        address: '12 Allen Ave',
        firstName: 'A',
        lastName: 'B',
      }),
    ).resolves.toBe(true);
    expect(((f.mock.calls[0][1] as RequestInit).body as FormData).get('expected_country')).toBe(
      'NGA',
    );
    const g = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      reply({
        kyb_registry: {
          companies: [
            { name: 'ADA KITCHEN LTD', registration_number: '1234567', status: 'Active' },
          ],
        },
      }),
    );
    await expect(v.searchCompany('1234567')).resolves.toEqual([
      { name: 'ADA KITCHEN LTD', registrationNumber: '1234567', status: 'active' },
    ]);
    const [url, init] = g.mock.calls[g.mock.calls.length - 1] as [string, RequestInit];
    expect(url).toBe('https://didit.test/v3/kyb/search/');
    expect(JSON.parse(init.body as string)).toEqual({
      country_code: 'NG',
      registration_number: '1234567',
    });
  });
});

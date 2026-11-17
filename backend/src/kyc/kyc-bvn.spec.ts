import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycStatus } from '../common/enums';
import { DiditBvnVerifier } from './didit-bvn.verifier';
import { KycService } from './kyc.service';

const KEY = randomBytes(32).toString('base64');
const dto = { bvn: '12345678901', firstName: 'Ada', lastName: 'Obi', dateOfBirth: '1990-04-02' };

function setup(
  opts: {
    verify?: jest.Mock;
    identity?: unknown;
    usedBy?: unknown;
    failed?: number;
    key?: string;
  } = {},
) {
  const saved: Record<string, unknown>[] = [];
  const identities = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      'bvnHash' in where ? (opts.usedBy ?? null) : (opts.identity ?? null),
    ),
  };
  const manager = {
    getRepository: jest.fn(() => ({
      create: (v: unknown) => v,
      save: jest.fn(async (v: Record<string, unknown>) => {
        saved.push(v);
        return v;
      }),
      update: jest.fn(),
    })),
  };
  const records = {
    findOne: jest.fn(async () => ({ status: KycStatus.VERIFIED })),
    count: jest.fn(async () => opts.failed ?? 0),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => {
      saved.push(v);
      return v;
    }),
    manager: { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) },
  };
  const users = { findOne: jest.fn(async () => ({ id: 'u1', kycTier: 0 })) };
  const verifier = { name: 'didit', verify: opts.verify ?? jest.fn(async () => true) };
  const config = {
    get: jest.fn((k: string) => (k === 'kyc.encryptionKey' ? (opts.key ?? KEY) : undefined)),
  };
  const service = new KycService(
    records as never,
    users as never,
    identities as never,
    config as never,
    verifier as never,
  );
  return { service, records, saved, verifier, users };
}

describe('KycService.verifyBvn', () => {
  it('verifies a matching BVN, stores it encrypted and raises the tier', async () => {
    const { service, saved, verifier } = setup();
    const result = await service.verifyBvn('u1', dto);
    expect(verifier.verify).toHaveBeenCalledWith(dto);
    const identity = saved.find((s) => 'bvnEncrypted' in s) as Record<string, string>;
    expect(identity.bvnEncrypted.startsWith('v1:')).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(dto.bvn);
    expect(identity.bvnLast4).toBe('8901');
    expect(identity.bvnHash).toHaveLength(64);
    expect(saved.some((s) => s.status === KycStatus.VERIFIED && s.tier === 1)).toBe(true);
    expect(result.userId).toBe('u1');
  });

  it('records a rejection, without suspending, when details do not match', async () => {
    const { service, saved } = setup({ verify: jest.fn(async () => false) });
    await expect(service.verifyBvn('u1', dto)).rejects.toThrow(BadRequestException);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ status: KycStatus.REJECTED, provider: 'bvn' });
    expect(JSON.stringify(saved)).not.toContain(dto.bvn);
  });

  it('refuses a BVN already verified on another account, with the same message', async () => {
    const { service, verifier } = setup({ usedBy: { userId: 'other' } });
    const err = await service.verifyBvn('u1', dto).catch((e: Error) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(verifier.verify).not.toHaveBeenCalled();
    const { service: s2 } = setup({ verify: jest.fn(async () => false) });
    const err2 = await s2.verifyBvn('u1', dto).catch((e: Error) => e);
    expect((err as Error).message).toBe((err2 as Error).message);
  });

  it('stops after repeated failures without calling the vendor', async () => {
    const { service, verifier } = setup({ failed: 3 });
    await expect(service.verifyBvn('u1', dto)).rejects.toThrow(/Too many/);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rejects users who are already verified, minors and impossible dates', async () => {
    await expect(setup({ identity: { id: 'x' } }).service.verifyBvn('u1', dto)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      setup().service.verifyBvn('u1', { ...dto, dateOfBirth: '2999-01-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      setup().service.verifyBvn('u1', { ...dto, dateOfBirth: '1990-02-31' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails closed when the vendor or key is missing, or the vendor errors', async () => {
    await expect(setup({ key: '' }).service.verifyBvn('u1', dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    const down = setup({
      verify: jest.fn(async () => {
        throw new ServiceUnavailableException('x');
      }),
    });
    await expect(down.service.verifyBvn('u1', dto)).rejects.toThrow(ServiceUnavailableException);
    expect(down.saved).toHaveLength(0);
  });
});

describe('KycService.getUserKycStatus', () => {
  function statusFor(record: unknown, identity: unknown = null) {
    const records = { findOne: jest.fn(async () => record) };
    const users = { findOne: jest.fn(async () => ({ id: 'u1', kycTier: 0 })) };
    const identities = { findOne: jest.fn(async () => identity) };
    const config = { get: jest.fn() };
    return new KycService(
      records as never,
      users as never,
      identities as never,
      config as never,
      null,
    ).getUserKycStatus('u1');
  }

  it('is not_started before anything is submitted', async () => {
    await expect(statusFor(null)).resolves.toMatchObject({ status: 'not_started' });
  });

  it('is pending after a BVN check that did not match', async () => {
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
    ).resolves.toMatchObject({
      status: 'verified',
      bvnLast4: '1234',
    });
  });
});

describe('DiditBvnVerifier', () => {
  const verifier = new DiditBvnVerifier({
    apiKey: 'k',
    baseUrl: 'https://didit.test/v3',
    timeoutMs: 1000,
  });
  const reply = (body: unknown, status = 200) =>
    ({ ok: status < 300, status, json: async () => body }) as Response;
  const approved = {
    status: 'Approved',
    match_type: 'full_match',
    validations: [{ outcome_code: 'MATCH', service_id: 'nga_bank_verification_number' }],
  };

  beforeEach(() => {
    for (const m of ['log', 'error'])
      jest.spyOn((verifier as any).logger, m).mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends the check as form data with the key in a header', async () => {
    const f = jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply(approved));
    await expect(verifier.verify(dto)).resolves.toBe(true);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://didit.test/v3/database-validation/');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    const body = init.body as FormData;
    expect(body.get('services')).toBe('nga_bank_verification_number');
    expect(body.get('issuing_state')).toBe('NGA');
    expect(body.get('bvn')).toBe(dto.bvn);
  });

  it('only accepts a full MATCH', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ ...approved, match_type: 'partial_match' }));
    await expect(verifier.verify(dto)).resolves.toBe(false);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({ ...approved, status: 'Declined' }));
    await expect(verifier.verify(dto)).resolves.toBe(false);
  });

  it('treats an unknown BVN as a non-match but an outage as unavailable', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({ detail: 'not found' }, 404));
    await expect(verifier.verify(dto)).resolves.toBe(false);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({ detail: 'boom' }, 500));
    await expect(verifier.verify(dto)).rejects.toThrow(ServiceUnavailableException);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(verifier.verify(dto)).rejects.toThrow(ServiceUnavailableException);
  });
});

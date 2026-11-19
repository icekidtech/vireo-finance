import { randomBytes } from 'crypto';
import { BiometricStatus, BiometricType } from './biometric-enrollment.entity';
import { AttemptResult } from './biometric-attempt.entity';
import { AttemptContext } from './biometric-attempt.entity';
import { BiometricsService } from './biometrics.service';
import { DiditProvider } from './didit.provider';

const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');
const SESSION = '3f2c9a1e-8b7d-4c5e-9a10-0123456789ab';
const USER = 'b1e5a9d2-6c3f-4a7e-8d21-0a1b2c3d4e5f';

function reply(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as Response;
}
const live = (extra: Record<string, unknown> = {}) =>
  reply({
    ...extra,
    liveness: { status: 'Approved', score: 96, face_quality: 88, warnings: [] },
  });

describe('DiditProvider face search index', () => {
  let fetchMock: jest.SpyInstance;
  const make = (indexFaces?: boolean) => {
    const p = new DiditProvider({
      apiKey: 'k',
      baseUrl: 'https://didit.test/v3',
      timeoutMs: 1000,
      indexFaces,
    });
    for (const m of ['log', 'error'])
      jest.spyOn((p as any).logger, m).mockImplementation(() => undefined);
    return p;
  };
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps no copy at Didit by default, even when a customer id is known', async () => {
    fetchMock.mockResolvedValueOnce(live({ request_id: SESSION }));
    const r = await make().enroll(BiometricType.FACE, IMG, { userId: USER });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('save_api_request')).toBe('false');
    expect(form.get('vendor_data')).toBeNull();
    expect(r.searchRef).toBeUndefined();
  });

  it('saves the face in the search index, labelled with the customer id, when switched on', async () => {
    fetchMock.mockResolvedValueOnce(live({ request_id: SESSION }));
    const r = await make(true).enroll(BiometricType.FACE, IMG, { userId: USER });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('save_api_request')).toBe('true');
    expect(form.get('vendor_data')).toBe(USER);
    expect(r.searchRef).toBe(SESSION);
    expect(fetchMock).toHaveBeenCalledTimes(1); // one call both checks and saves the face
  });

  it('does not enrol a face it could not save with a deletable id', async () => {
    fetchMock.mockResolvedValueOnce(live()); // no request_id
    await expect(make(true).enroll(BiometricType.FACE, IMG, { userId: USER })).rejects.toThrow(
      'not available',
    );
  });

  it('does not save a face that fails the liveness check', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ liveness: { status: 'Declined', score: 5 }, request_id: SESSION }),
    );
    await expect(make(true).enroll(BiometricType.FACE, IMG, { userId: USER })).rejects.toThrow(
      'live face',
    );
  });

  it('deletes a saved face with the right request', async () => {
    fetchMock.mockResolvedValueOnce(reply({ face_retention_outcome: 'deleted' }));
    await make(true).forgetFace(SESSION);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://didit.test/v3/session/${SESSION}/delete/`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
  });

  it('treats an already-deleted face as done, but reports a real failure', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 404));
    await expect(make(true).forgetFace(SESSION)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply({}, 403));
    await expect(make(true).forgetFace(SESSION)).rejects.toThrow('not available');
  });

  it('refuses to build a delete URL from anything but a session id', async () => {
    await expect(make(true).forgetFace('../../other')).rejects.toThrow('Invalid saved face');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('BiometricsService.identifyByFace (face alone)', () => {
  function setup(o: {
    matches?: Array<Record<string, unknown>>;
    user?: any;
    enrolled?: number;
    consent?: boolean;
    denials?: number;
  }) {
    const provider = {
      name: 'didit',
      searchFace: jest.fn(async () => o.matches ?? []),
      forgetFace: jest.fn(async () => undefined),
    };
    const users = { findOne: jest.fn(async () => (o.user === undefined ? { id: USER } : o.user)) };
    const enrollments = {
      count: jest.fn(async () => (o.enrolled === undefined ? 1 : o.enrolled)),
      find: jest.fn(async () => []),
      update: jest.fn(),
    };
    const consents = { findOne: jest.fn(async () => (o.consent === false ? null : { id: 'c1' })) };
    const attempts = {
      save: jest.fn(),
      create: jest.fn((v: unknown) => v),
      count: jest.fn(async () => o.denials ?? 0),
    };
    const config = {
      get: (k: string) =>
        k === 'biometrics.encryptionKey' ? randomBytes(32).toString('base64') : undefined,
    };
    const service = new BiometricsService(
      {} as never,
      enrollments as never,
      consents as never,
      attempts as never,
      users as never,
      config as never,
      provider as never,
    );
    return { service, provider, users, enrollments, attempts };
  }
  const strong = (over: Record<string, unknown> = {}) => ({
    vendorData: USER,
    similarityScore: 99,
    ...over,
  });
  const run = (s: BiometricsService) => s.identifyByFace(IMG, AttemptContext.PAYMENT, 200000);

  it('approves a strong match to an enrolled, consenting customer', async () => {
    const { service } = setup({ matches: [strong()] });
    const r = await run(service);
    expect(r.decision).toBe(AttemptResult.APPROVED);
    expect(r.userId).toBe(USER);
  });

  it('denies a match to someone whose enrolment was removed, even if Didit still has the face', async () => {
    const { service } = setup({ matches: [strong()], enrolled: 0 });
    const r = await run(service);
    expect(r.decision).toBe(AttemptResult.DENIED);
    expect(r.userId).toBeUndefined();
  });

  it('denies when consent was withdrawn', async () => {
    const { service } = setup({ matches: [strong()], consent: false });
    expect((await run(service)).decision).toBe(AttemptResult.DENIED);
  });

  it('denies when nobody matches', async () => {
    const { service } = setup({ matches: [] });
    expect((await run(service)).decision).toBe(AttemptResult.DENIED);
  });

  it('never looks up a label that is not one of our customer ids', async () => {
    const { service, users } = setup({ matches: [strong({ vendorData: "x' OR '1'='1" })] });
    const r = await run(service);
    expect(r.decision).toBe(AttemptResult.DENIED);
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('denies a match to a customer id we do not have', async () => {
    const { service } = setup({ matches: [strong()], user: null });
    expect((await run(service)).decision).toBe(AttemptResult.DENIED);
  });

  it('locks a customer out after repeated denials', async () => {
    const { service } = setup({ matches: [strong()], denials: 99 });
    const r = await run(service);
    expect(r.decision).toBe(AttemptResult.DENIED);
  });

  it('deletes the saved faces at Didit when an enrolment is revoked', async () => {
    const { service, provider, enrollments } = setup({});
    enrollments.find.mockResolvedValue([
      {
        type: BiometricType.FACE,
        status: BiometricStatus.ACTIVE,
        metadata: { searchRef: SESSION },
      },
      { type: BiometricType.FACE, status: BiometricStatus.ACTIVE, metadata: null },
    ] as never);
    await service.revokeEnrollment(USER, { type: BiometricType.FACE } as never);
    expect(provider.forgetFace).toHaveBeenCalledTimes(1);
    expect(provider.forgetFace).toHaveBeenCalledWith(SESSION);
    expect(enrollments.update).toHaveBeenCalled();
  });

  it('still revokes locally when Didit cannot be reached', async () => {
    const { service, provider, enrollments } = setup({});
    enrollments.find.mockResolvedValue([
      {
        type: BiometricType.FACE,
        status: BiometricStatus.ACTIVE,
        metadata: { searchRef: SESSION },
      },
    ] as never);
    provider.forgetFace.mockRejectedValue(new Error('didit down'));
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    await expect(
      service.revokeEnrollment(USER, { type: BiometricType.FACE } as never),
    ).resolves.toBeUndefined();
    expect(enrollments.update).toHaveBeenCalled();
  });
});

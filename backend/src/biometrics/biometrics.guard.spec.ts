import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { encryptEmbedding } from '../common/crypto';
import { AttemptResult } from './biometric-attempt.entity';
import { BiometricType } from './biometric-enrollment.entity';
import { BiometricProvider } from './biometric-provider';
import { BiometricsService } from './biometrics.service';

const KEY = randomBytes(32);

/** Test double for a vendor adapter; spec-only, never part of the app. */
function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-vendor',
    enroll: jest.fn(async () => ({ template: 'tmpl-1', qualityScore: 90 })),
    verify: jest.fn(async () => ({
      matchScore: 95,
      livenessScore: 95,
      spoofScore: 1,
      qualityScore: 90,
      matchedTemplateIndex: 0,
    })),
    ...overrides,
  } as unknown as BiometricProvider & { enroll: jest.Mock; verify: jest.Mock };
}

function setup(
  opts: {
    provider?: BiometricProvider | null;
    key?: boolean;
    denials?: number;
    stored?: string;
  } = {},
) {
  const user = { id: 'user-1', phone: '+2348012345678' };
  const attempts = {
    count: jest.fn(async () => opts.denials ?? 0),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
  };
  const consents = { findOne: jest.fn(async () => ({ id: 'consent-1' })) };
  const enrolled = {
    id: 'enr-1',
    embeddingEncrypted: opts.stored ?? encryptEmbedding('tmpl-1', KEY, 'user-1'),
  };
  const enrollments = {
    find: jest.fn(async () => [enrolled]),
    update: jest.fn(),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ id: 'enr-new', ...v })),
  };
  const users = { findOne: jest.fn(async () => user) };
  const config = {
    get: jest.fn((k: string) =>
      k === 'biometrics.encryptionKey' && opts.key !== false ? KEY.toString('base64') : undefined,
    ),
  };
  const provider = opts.provider === undefined ? makeProvider() : opts.provider;
  const service = new BiometricsService(
    {} as never,
    enrollments as never,
    consents as never,
    attempts as never,
    users as never,
    config as never,
    provider,
  );
  return { service, attempts, enrollments, provider: provider as ReturnType<typeof makeProvider> };
}

const verifyDto = {
  type: BiometricType.FACE,
  identifier: '+2348012345678',
  sampleBase64: 'AAAA',
};

describe('BiometricsService', () => {
  describe('with no provider configured (fail closed)', () => {
    it('refuses to verify', async () => {
      const { service, enrollments } = setup({ provider: null });
      await expect(service.verify(verifyDto, 'payment' as never)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(enrollments.find).not.toHaveBeenCalled();
    });

    it('refuses to enroll', async () => {
      const { service } = setup({ provider: null });
      await expect(
        service.enroll('user-1', { type: BiometricType.FACE, sampleBase64: 'A', consentId: 'c' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('refuses to verify without an encryption key even if a provider exists', async () => {
      const { service } = setup({ key: false });
      await expect(service.verify(verifyDto, 'payment' as never)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('with a provider', () => {
    it('stores the vendor template encrypted, never in the clear', async () => {
      const { service, enrollments } = setup();
      await service.enroll('user-1', {
        type: BiometricType.FACE,
        sampleBase64: 'AAAA',
        consentId: 'consent-1',
      });
      const saved = (enrollments.save.mock.calls as Record<string, string>[][])[0][0];
      expect(saved.embeddingEncrypted.startsWith('v1:')).toBe(true);
      expect(saved.embeddingEncrypted).not.toContain('tmpl-1');
      expect(saved.modelVersion).toBe('test-vendor');
    });

    it('passes decrypted templates to the vendor and approves a strong match', async () => {
      const { service, provider } = setup();
      const result = await service.verify(verifyDto, 'payment' as never);
      expect(provider.verify).toHaveBeenCalledWith(BiometricType.FACE, 'AAAA', ['tmpl-1']);
      expect(result.decision).toBe(AttemptResult.APPROVED);
      expect(result.userId).toBe('user-1');
      expect(result.matchedEnrollmentId).toBe('enr-1');
    });

    it('denies and never calls the vendor when a template cannot be decrypted', async () => {
      const legacy = Buffer.from('{"vector":[0.1]}').toString('base64');
      const { service, provider } = setup({ stored: legacy });
      const result = await service.verify(verifyDto, 'payment' as never);
      expect(result.decision).toBe(AttemptResult.DENIED);
      expect(provider.verify).not.toHaveBeenCalled();
    });

    it('refuses a template that was encrypted for a different user', async () => {
      const { service, provider } = setup({
        stored: encryptEmbedding('tmpl-1', KEY, 'someone-else'),
      });
      const result = await service.verify(verifyDto, 'payment' as never);
      expect(result.decision).toBe(AttemptResult.DENIED);
      expect(provider.verify).not.toHaveBeenCalled();
    });

    it('denies on a failed liveness check', async () => {
      const provider = makeProvider({
        verify: jest.fn(async () => ({
          matchScore: 99,
          livenessScore: 10,
          spoofScore: 1,
          qualityScore: 90,
          matchedTemplateIndex: 0,
        })),
      });
      const { service } = setup({ provider });
      const result = await service.verify(verifyDto, 'payment' as never);
      expect(result.decision).toBe(AttemptResult.DENIED);
    });

    it('propagates a vendor failure instead of approving', async () => {
      const provider = makeProvider({
        verify: jest.fn(async () => {
          throw new Error('vendor down');
        }),
      });
      const { service } = setup({ provider });
      await expect(service.verify(verifyDto, 'payment' as never)).rejects.toThrow('vendor down');
    });

    it('locks a customer out after repeated denials without calling the vendor', async () => {
      const { service, provider } = setup({ denials: 5 });
      const result = await service.verify(verifyDto, 'payment' as never);
      expect(result.decision).toBe(AttemptResult.DENIED);
      expect(result.reason).toBe('Too many failed attempts');
      expect(provider.verify).not.toHaveBeenCalled();
    });
  });
});

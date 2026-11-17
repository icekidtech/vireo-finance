import { NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import { AttemptResult } from './biometric-attempt.entity';
import { BiometricType } from './biometric-enrollment.entity';
import { BiometricsService } from './biometrics.service';

function setup(opts: { denials?: number } = {}) {
  const user = { id: 'user-1', phone: '+2348012345678' };
  const attempts = {
    count: jest.fn(async () => opts.denials ?? 0),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
  };
  const consents = { findOne: jest.fn(async () => ({ id: 'consent-1' })) };
  const enrollments = { find: jest.fn(async () => [{ id: 'enr-1' }]) };
  const users = { findOne: jest.fn(async () => user) };
  const service = new BiometricsService(
    {} as any,
    enrollments as any,
    consents as any,
    attempts as any,
    users as any,
    {} as any,
  );
  return { service, attempts, enrollments };
}

const verifyDto = {
  type: BiometricType.FACE,
  identifier: '+2348012345678',
  sampleBase64: 'AAAA',
};

describe('BiometricsService safety guards', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('allows the mock provider outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.BIOMETRIC_PROVIDER;
    const { service } = setup();
    const result = await service.verify(verifyDto, 'payment' as any);
    expect(result.userId).toBe('user-1');
  });

  it('refuses to verify with the mock provider in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BIOMETRIC_PROVIDER;
    const { service, enrollments } = setup();
    await expect(service.verify(verifyDto, 'payment' as any)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(enrollments.find).not.toHaveBeenCalled();
  });

  it('refuses to enroll with the mock provider in production', async () => {
    process.env.NODE_ENV = 'production';
    const { service } = setup();
    await expect(
      service.enroll('user-1', {
        type: BiometricType.FACE,
        sampleBase64: 'AAAA',
        consentId: 'consent-1',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed for a provider with no adapter instead of using the mock scorer', async () => {
    process.env.NODE_ENV = 'development';
    process.env.BIOMETRIC_PROVIDER = 'acme';
    const { service } = setup();
    await expect(service.verify(verifyDto, 'payment' as any)).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('locks a customer out after repeated denials without scoring the sample', async () => {
    process.env.NODE_ENV = 'development';
    const { service, enrollments } = setup({ denials: 5 });
    const result = await service.verify(verifyDto, 'payment' as any);
    expect(result.decision).toBe(AttemptResult.DENIED);
    expect(result.reason).toBe('Too many failed attempts');
    expect(enrollments.find).not.toHaveBeenCalled();
  });
});

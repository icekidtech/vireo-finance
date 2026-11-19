import { ForbiddenException } from '@nestjs/common';
import { BiometricsController } from './biometrics.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

function setup(isMerchant: boolean) {
  const biometrics = {
    identifyByFace: jest.fn(async () => ({
      decision: 'APPROVED',
      userId: 'secret-user-id',
      scores: { matchScore: 97, livenessScore: 99, spoofScore: 1, qualityScore: 90 },
      reason: undefined,
    })),
  };
  const merchants = { findOne: jest.fn(async () => (isMerchant ? { id: 'm1' } : null)) };
  const controller = new BiometricsController(biometrics as never, merchants as never);
  return { controller, biometrics, merchants };
}

describe('POST /biometrics/identify', () => {
  it('requires a signed-in user', () => {
    const guards = Reflect.getMetadata('__guards__', BiometricsController.prototype.identifyByFace);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('refuses a signed-in user who is not a merchant, without touching the face search', async () => {
    const { controller, biometrics } = setup(false);
    await expect(
      controller.identifyByFace(
        { userId: 'u1' } as never,
        { sampleBase64: 'x'.repeat(120) } as never,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(biometrics.identifyByFace).not.toHaveBeenCalled();
  });

  it('lets a merchant search, and never reveals which customer matched', async () => {
    const { controller, biometrics } = setup(true);
    const result = await controller.identifyByFace(
      { userId: 'u1' } as never,
      { sampleBase64: 'x'.repeat(120), amountMinor: 500000 } as never,
    );
    expect(biometrics.identifyByFace).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe('APPROVED');
    expect(JSON.stringify(result)).not.toContain('secret-user-id');
    expect(result).not.toHaveProperty('userId');
  });
});

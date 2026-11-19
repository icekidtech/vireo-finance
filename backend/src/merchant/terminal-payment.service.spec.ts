import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttemptResult } from '../biometrics/biometric-attempt.entity';
import { BiometricType } from '../biometrics/biometric-enrollment.entity';
import { MerchantOrderStatus } from '../common/enums';
import { TerminalPaymentService } from './terminal-payment.service';

const MERCHANT_OWNER = 'owner-1';
const CUSTOMER = 'customer-1';

function makeMerchant(overrides: Record<string, unknown> = {}) {
  return { id: 'merchant-1', ownerUserId: MERCHANT_OWNER, kybStatus: 'verified', ...overrides };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    merchantId: 'merchant-1',
    reference: 'ord_abc',
    amount: '250000',
    status: MerchantOrderStatus.OPEN,
    expiresAt: new Date(Date.now() + 300_000),
    ...overrides,
  };
}

/** `userId: null` models a verifier that could not resolve a customer. */
function fusion(decision: AttemptResult, userId: string | null = CUSTOMER) {
  return {
    decision,
    userId: userId ?? undefined,
    scores: { matchScore: 90, livenessScore: 90, spoofScore: 1, qualityScore: 90 },
  };
}

type FaceOnlyConfig = {
  enabled?: boolean;
  allowSandbox?: boolean;
  maxAmountMinor?: number;
  minMatchScore?: number;
};

function setup(
  opts: {
    merchant?: any;
    order?: any;
    verify?: jest.Mock;
    identify?: jest.Mock;
    faceOnly?: FaceOnlyConfig;
    keyType?: string;
  } = {},
) {
  const orders = {
    findOne: jest.fn(async () => (opts.order === undefined ? makeOrder() : opts.order)),
  };
  const merchants = { getByOwner: jest.fn(async () => opts.merchant ?? makeMerchant()) };
  const verify = opts.verify ?? jest.fn(async () => fusion(AttemptResult.APPROVED));
  const identify = opts.identify ?? jest.fn(async () => fusion(AttemptResult.APPROVED));
  const biometrics = { verify, identifyByFace: identify };
  const config = {
    get: jest.fn((key: string) =>
      key === 'biometrics.faceOnly'
        ? (opts.faceOnly ?? { enabled: true, allowSandbox: false })
        : key === 'biometrics.didit.keyType'
          ? (opts.keyType ?? 'live')
          : undefined,
    ),
  };
  const transfers = {
    payOrderWithBiometric: jest.fn(async () => ({ transfer: { id: 't-1', status: 'completed' } })),
  };
  const service = new TerminalPaymentService(
    orders as any,
    merchants as any,
    biometrics as any,
    transfers as any,
    config as any,
  );
  return { service, orders, merchants, verify, identify, transfers };
}

const dto = (overrides: Record<string, unknown> = {}) => ({
  orderReference: 'ord_abc',
  customerIdentifier: '+2348012345678',
  biometricType: BiometricType.FACE,
  biometricSample: 'AAAA',
  ...overrides,
});

describe('TerminalPaymentService', () => {
  it('refuses merchants whose KYB is not verified, before touching biometrics', async () => {
    const { service, verify } = setup({ merchant: makeMerchant({ kybStatus: 'pending' }) });
    await expect(service.pay(MERCHANT_OWNER, dto())).rejects.toThrow(ForbiddenException);
    expect(verify).not.toHaveBeenCalled();
  });

  it("only pays the calling merchant's own orders", async () => {
    const { service, orders, verify } = setup({ order: null });
    await expect(service.pay(MERCHANT_OWNER, dto())).rejects.toThrow(NotFoundException);
    expect(orders.findOne).toHaveBeenCalledWith({
      where: { reference: 'ord_abc', merchantId: 'merchant-1' },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects orders that are not open', async () => {
    const { service } = setup({ order: makeOrder({ status: MerchantOrderStatus.PAID }) });
    await expect(service.pay(MERCHANT_OWNER, dto())).rejects.toThrow(BadRequestException);
  });

  it('rejects expired orders', async () => {
    const { service } = setup({ order: makeOrder({ expiresAt: new Date(Date.now() - 1000) }) });
    await expect(service.pay(MERCHANT_OWNER, dto())).rejects.toThrow(BadRequestException);
  });

  it('requires the second biometric type to accompany a second sample', async () => {
    const { service } = setup();
    await expect(
      service.pay(MERCHANT_OWNER, dto({ secondBiometricSample: 'BBBB' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects two biometrics of the same type', async () => {
    const { service } = setup();
    await expect(
      service.pay(
        MERCHANT_OWNER,
        dto({ secondBiometricSample: 'BBBB', secondBiometricType: BiometricType.FACE }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('verifies against the order amount, never a client-supplied one', async () => {
    const { service, verify } = setup();
    await service.pay(MERCHANT_OWNER, dto());
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 250000, identifier: '+2348012345678' }),
      'payment',
    );
  });

  it('pays the verified customer when the biometric approves', async () => {
    const { service, transfers } = setup();
    const result = await service.pay(MERCHANT_OWNER, dto());
    expect(result.status).toBe('paid');
    expect(transfers.payOrderWithBiometric).toHaveBeenCalledWith({
      customerUserId: CUSTOMER,
      merchantId: 'merchant-1',
      orderReference: 'ord_abc',
      biometricTypes: ['face'],
    });
  });

  it('denies without moving money and without revealing why', async () => {
    const verify = jest.fn(async () => fusion(AttemptResult.DENIED));
    const { service, transfers } = setup({ verify });
    const result = await service.pay(MERCHANT_OWNER, dto());
    expect(result).toEqual({ status: 'denied', message: 'Biometric verification failed' });
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('turns a step-up into a request to approve on the phone, moving no money', async () => {
    const verify = jest.fn(async () => fusion(AttemptResult.STEP_UP));
    const { service, transfers } = setup({ verify });
    const result = await service.pay(MERCHANT_OWNER, dto());
    expect(result.status).toBe('step_up_required');
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('denies when two biometrics resolve to different customers', async () => {
    const verify = jest
      .fn()
      .mockResolvedValueOnce(fusion(AttemptResult.APPROVED, 'customer-1'))
      .mockResolvedValueOnce(fusion(AttemptResult.APPROVED, 'customer-2'));
    const { service, transfers } = setup({ verify });
    const result = await service.pay(
      MERCHANT_OWNER,
      dto({ secondBiometricSample: 'BBBB', secondBiometricType: BiometricType.VOICE }),
    );
    expect(result.status).toBe('denied');
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('requires every biometric to approve', async () => {
    const verify = jest
      .fn()
      .mockResolvedValueOnce(fusion(AttemptResult.APPROVED))
      .mockResolvedValueOnce(fusion(AttemptResult.DENIED));
    const { service, transfers } = setup({ verify });
    const result = await service.pay(
      MERCHANT_OWNER,
      dto({ secondBiometricSample: 'BBBB', secondBiometricType: BiometricType.VOICE }),
    );
    expect(result.status).toBe('denied');
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('never lets a merchant owner pay their own order from their own wallet', async () => {
    const verify = jest.fn(async () => fusion(AttemptResult.APPROVED, MERCHANT_OWNER));
    const { service, transfers } = setup({ verify });
    const result = await service.pay(MERCHANT_OWNER, dto());
    expect(result.status).toBe('denied');
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('denies when the verifier cannot resolve a customer', async () => {
    const verify = jest.fn(async () => fusion(AttemptResult.APPROVED, null));
    const { service, transfers } = setup({ verify });
    const result = await service.pay(MERCHANT_OWNER, dto());
    expect(result.status).toBe('denied');
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });
});

describe('TerminalPaymentService.payByFace (a face and nothing else)', () => {
  const faceDto = (o: Record<string, unknown> = {}) => ({
    orderReference: 'ord_abc',
    sampleBase64: 'AAAA',
    ...o,
  });
  const strongMatch = (userId: string | null = CUSTOMER) => ({
    decision: AttemptResult.APPROVED,
    userId: userId ?? undefined,
    scores: { matchScore: 98, livenessScore: 95, spoofScore: 1, qualityScore: 90 },
  });

  it('is off unless an operator switches it on, and searches no face while off', async () => {
    const { service, identify, transfers } = setup({ faceOnly: { enabled: false } });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toThrow('not switched on');
    expect(identify).not.toHaveBeenCalled();
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('refuses while the face checker is in vendor test mode (it approves everything)', async () => {
    const { service, identify } = setup({ keyType: 'sandbox' });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toThrow('test mode');
    expect(identify).not.toHaveBeenCalled();
  });

  it('works in test mode only when that was allowed on purpose', async () => {
    const identify = jest.fn(async () => strongMatch());
    const { service, transfers } = setup({
      keyType: 'sandbox',
      faceOnly: { enabled: true, allowSandbox: true },
      identify,
    });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toMatchObject({
      status: 'paid',
    });
    expect(transfers.payOrderWithBiometric).toHaveBeenCalledTimes(1);
  });

  it('charges the customer the SERVER found, for the order amount, never the request', async () => {
    const identify = jest.fn(async () => strongMatch('someone-the-server-found'));
    const { service, transfers } = setup({ identify });
    const result = await service.payByFace(MERCHANT_OWNER, faceDto({ customerUserId: 'attacker' }));
    expect(result).toMatchObject({ status: 'paid' });
    expect(transfers.payOrderWithBiometric).toHaveBeenCalledWith({
      customerUserId: 'someone-the-server-found',
      merchantId: 'merchant-1',
      orderReference: 'ord_abc',
      biometricTypes: ['face'],
    });
    expect(identify).toHaveBeenCalledWith('AAAA', expect.anything(), 250000);
  });

  it('refuses an unverified business before any face is processed', async () => {
    const { service, identify } = setup({ merchant: makeMerchant({ kybStatus: 'pending' }) });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toThrow(ForbiddenException);
    expect(identify).not.toHaveBeenCalled();
  });

  it("only pays the calling business's own open orders", async () => {
    const { service, identify } = setup({ order: null });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toThrow(NotFoundException);
    const closed = setup({ order: makeOrder({ status: MerchantOrderStatus.PAID }) });
    await expect(closed.service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toThrow(
      BadRequestException,
    );
    const expired = setup({ order: makeOrder({ expiresAt: new Date(Date.now() - 1000) }) });
    await expect(expired.service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toThrow('expired');
    expect(identify).not.toHaveBeenCalled();
  });

  it('sends a large order to the phone, without processing the face or taking money', async () => {
    const { service, identify, transfers } = setup({
      order: makeOrder({ amount: '2500000' }),
      faceOnly: { enabled: true, maxAmountMinor: 2000000 },
    });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toMatchObject({
      status: 'step_up_required',
    });
    expect(identify).not.toHaveBeenCalled();
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('pays an order exactly at the limit', async () => {
    const { service } = setup({
      order: makeOrder({ amount: '2000000' }),
      faceOnly: { enabled: true, maxAmountMinor: 2000000 },
      identify: jest.fn(async () => strongMatch()),
    });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toMatchObject({
      status: 'paid',
    });
  });

  it('denies a face that does not clear the stricter score, even if the checker approved it', async () => {
    const identify = jest.fn(async () => ({
      ...strongMatch(),
      scores: { matchScore: 90, livenessScore: 95, spoofScore: 1, qualityScore: 90 },
    }));
    const { service, transfers } = setup({ identify });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toEqual({
      status: 'denied',
      message: 'Biometric verification failed',
    });
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it.each([
    ['not recognised', { decision: AttemptResult.DENIED, userId: undefined }],
    ['an error', { decision: AttemptResult.ERROR, userId: undefined }],
    ['approved but no customer resolved', { decision: AttemptResult.APPROVED, userId: undefined }],
  ])('denies the same way when the result is %s', async (_label, partial) => {
    const identify = jest.fn(async () => ({
      ...strongMatch(),
      ...partial,
    }));
    const { service, transfers } = setup({ identify });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toEqual({
      status: 'denied',
      message: 'Biometric verification failed',
    });
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('never lets a business pay itself with its own face', async () => {
    const identify = jest.fn(async () => strongMatch(MERCHANT_OWNER));
    const { service, transfers } = setup({ identify });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toMatchObject({
      status: 'denied',
    });
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('does not take money when the checker wants a second factor', async () => {
    const identify = jest.fn(async () => ({ ...strongMatch(), decision: AttemptResult.STEP_UP }));
    const { service, transfers } = setup({ identify });
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).resolves.toMatchObject({
      status: 'step_up_required',
    });
    expect(transfers.payOrderWithBiometric).not.toHaveBeenCalled();
  });

  it('limits face searches per business per minute', async () => {
    const { service, identify } = setup();
    for (let i = 0; i < 10; i += 1) {
      await service.payByFace(MERCHANT_OWNER, faceDto());
    }
    await expect(service.payByFace(MERCHANT_OWNER, faceDto())).rejects.toMatchObject({
      status: 429,
    });
    expect(identify).toHaveBeenCalledTimes(10);
  });

  it('never reveals who the face matched in a denial', async () => {
    const identify = jest.fn(async () => ({
      decision: AttemptResult.DENIED,
      userId: 'secret-customer-id',
      scores: { matchScore: 50, livenessScore: 90, spoofScore: 1, qualityScore: 90 },
    }));
    const { service } = setup({ identify });
    const result = await service.payByFace(MERCHANT_OWNER, faceDto());
    expect(JSON.stringify(result)).not.toContain('secret-customer-id');
  });
});

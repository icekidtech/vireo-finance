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

function setup(opts: { merchant?: any; order?: any; verify?: jest.Mock } = {}) {
  const orders = {
    findOne: jest.fn(async () => (opts.order === undefined ? makeOrder() : opts.order)),
  };
  const merchants = { getByOwner: jest.fn(async () => opts.merchant ?? makeMerchant()) };
  const verify = opts.verify ?? jest.fn(async () => fusion(AttemptResult.APPROVED));
  const biometrics = { verify };
  const transfers = {
    payOrderWithBiometric: jest.fn(async () => ({ transfer: { id: 't-1', status: 'completed' } })),
  };
  const service = new TerminalPaymentService(
    orders as any,
    merchants as any,
    biometrics as any,
    transfers as any,
  );
  return { service, orders, merchants, verify, transfers };
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

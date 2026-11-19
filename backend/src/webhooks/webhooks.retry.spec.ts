import { PagaEventStatus } from '../common/enums';
import { parsePagaAmount, WebhooksService } from './webhooks.service';

/** The callback Paga's sandbox really sent for a bank-transfer deposit (secrets removed). */
const pagaCallback = {
  statusCode: '0',
  statusMessage: 'success',
  transactionReference: 'MPVAT-P_20261119145850832_4625757_1SDDL_s6sg7',
  fundingTransactionReference: 'DFB-U_20261119145850182_4625756_GXDCQ_s6sg7',
  fundingPaymentReference: 'SIM-A4F1D87A07A94F639A',
  accountNumber: '3594357288',
  accountName: 'Ubong Udoh',
  amount: '5,000.00',
  clearingFeeAmount: '50.00',
  payerDetails: { paymentMethod: 'BANK_TRANSFER', payerBankName: 'Access Bank' },
  hash: 'x',
};

const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

function setup(existing?: { status: PagaEventStatus }) {
  const events = {
    create: jest.fn((v: Record<string, unknown>) => ({ ...v })),
    // A repeat delivery hits the unique key on the Paga reference.
    save: jest.fn(async (v: Record<string, unknown>) => {
      if (existing && v.status === PagaEventStatus.RECEIVED && !v.id) throw uniqueViolation;
      return v;
    }),
    findOne: jest.fn(async () => (existing ? { id: 'ev-1', ...existing } : null)),
  };
  const virtualAccounts = { findOne: jest.fn(async () => ({ accountId: 'acc-1', userId: 'u1' })) };
  const ledger = {
    runInTransaction: jest.fn(async (work: (m: unknown) => unknown) => work({})),
    post: jest.fn(),
  };
  const notifications = { creditReceived: jest.fn(), send: jest.fn() };
  const service = new WebhooksService(
    events as never,
    virtualAccounts as never,
    ledger as never,
    { verifyCallback: jest.fn(() => true) } as never,
    notifications as never,
    {} as never,
    {} as never,
    { reconcile: jest.fn(async () => 0n) } as never,
    { walletOwner: jest.fn(async () => 'u1') } as never,
  );
  return { service, events, ledger, notifications };
}

describe('parsePagaAmount', () => {
  it.each([
    ['5,000.00', 500000n],
    ['1,234,567.89', 123456789n],
    ['50.00', 5000n],
    ['5000.00', 500000n],
    ['999', 99900n],
    [5000, 500000n],
  ])('reads %p', (input, minor) => {
    expect(parsePagaAmount(input)).toBe(minor);
  });

  it.each(['5,00.00', '5,0000.00', ',500.00', '5,000,.00', 'abc', '', '-5,000.00', '5.000,00'])(
    'refuses the malformed amount %p',
    (input) => {
      expect(() => parsePagaAmount(input)).toThrow();
    },
  );
});

describe('Paga deposit callback', () => {
  it('credits a deposit whose amount has a thousands separator', async () => {
    const { service, ledger, notifications } = setup();
    await expect(
      service.handle({}, JSON.stringify(pagaCallback), pagaCallback),
    ).resolves.toMatchObject({
      status: 'SUCCESS',
      credited: true,
    });
    const posted = ledger.post.mock.calls[0][1];
    expect(posted.legs.map((l: { amount: bigint }) => l.amount)).toEqual([500000n, 500000n]);
    expect(posted.idempotencyKey).toBe(`paga-event:${pagaCallback.transactionReference}`);
    expect(notifications.creditReceived).toHaveBeenCalledWith('u1', 500000n, { scope: 'personal' });
  });

  it('processes a callback that failed earlier when it is sent again', async () => {
    const { service, ledger, events } = setup({ status: PagaEventStatus.FAILED });
    await expect(
      service.handle({}, JSON.stringify(pagaCallback), pagaCallback),
    ).resolves.toMatchObject({
      status: 'SUCCESS',
      credited: true,
    });
    expect(ledger.post).toHaveBeenCalledTimes(1);
    const last = events.save.mock.calls.at(-1)?.[0] as { status: string };
    expect(last.status).toBe(PagaEventStatus.PROCESSED);
  });

  it.each([PagaEventStatus.PROCESSED, PagaEventStatus.IGNORED])(
    'does nothing for a repeat of a %s callback',
    async (status) => {
      const { service, ledger, notifications } = setup({ status });
      await expect(service.handle({}, JSON.stringify(pagaCallback), pagaCallback)).resolves.toEqual(
        {
          status: 'SUCCESS',
          duplicate: true,
        },
      );
      expect(ledger.post).not.toHaveBeenCalled();
      expect(notifications.creditReceived).not.toHaveBeenCalled();
    },
  );

  it('still marks a callback with a bad amount as failed, so it can be retried', async () => {
    const { service, events } = setup();
    const bad = { ...pagaCallback, amount: 'five thousand' };
    await expect(service.handle({}, JSON.stringify(bad), bad)).rejects.toThrow('Invalid amount');
    const last = events.save.mock.calls.at(-1)?.[0] as { status: string };
    expect(last.status).toBe(PagaEventStatus.FAILED);
  });
});

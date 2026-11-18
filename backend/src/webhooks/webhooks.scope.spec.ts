import { WebhooksService } from './webhooks.service';

function setup(walletOwner: string | null) {
  const events = {
    create: jest.fn((v: Record<string, unknown>) => ({ ...v })),
    save: jest.fn(async (v: Record<string, unknown>) => v),
  };
  const virtualAccounts = { findOne: jest.fn(async () => ({ accountId: 'acc-1', userId: 'u1' })) };
  const ledger = {
    runInTransaction: jest.fn(async (work: (m: unknown) => unknown) => work({})),
    post: jest.fn(),
  };
  const paga = { verifyCallback: jest.fn(() => true) };
  const notifications = { creditReceived: jest.fn(), send: jest.fn() };
  const caps = { reconcile: jest.fn(async () => 0n) };
  const accounts = { walletOwner: jest.fn(async () => walletOwner) };
  const service = new WebhooksService(
    events as never,
    virtualAccounts as never,
    ledger as never,
    paga as never,
    notifications as never,
    {} as never,
    {} as never,
    caps as never,
    accounts as never,
  );
  return { service, notifications, caps };
}

const callback = {
  statusCode: '0',
  accountNumber: '2996370866',
  amount: '50000.00',
  transactionReference: 'ref-1',
  hash: 'x',
};

describe('inbound credit notifications', () => {
  it('tags a credit to a personal wallet as personal and applies the balance cap', async () => {
    const { service, notifications, caps } = setup('u1');
    await service.handle({}, JSON.stringify(callback), callback);
    expect(notifications.creditReceived).toHaveBeenCalledWith('u1', 5000000n, {
      scope: 'personal',
    });
    expect(caps.reconcile).toHaveBeenCalledWith('u1');
  });

  it('tags a credit to a merchant balance as merchant and leaves the personal wallet alone', async () => {
    const { service, notifications, caps } = setup(null);
    await service.handle({}, JSON.stringify({ ...callback, transactionReference: 'ref-2' }), {
      ...callback,
      transactionReference: 'ref-2',
    });
    expect(notifications.creditReceived).toHaveBeenCalledWith('u1', 5000000n, {
      scope: 'merchant',
    });
    expect(caps.reconcile).not.toHaveBeenCalled();
  });
});

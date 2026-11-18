import { BalanceCapService } from './balance-cap.service';

function setup(o: {
  tier?: number;
  balance: bigint;
  held?: bigint;
  existing?: { id: string; amount: string }[];
  cap?: bigint;
}) {
  const caps: Record<number, bigint> = {
    0: 5_000_000n,
    1: o.cap ?? 30_000_000n,
    2: 50_000_000n,
    3: 0n,
  };
  const created: { amount: bigint; reference: string }[] = [];
  const released: string[] = [];
  const existing = o.existing ?? [];
  const existingSum = existing.reduce((s, h) => s + BigInt(h.amount), 0n);
  const manager = { getRepository: () => ({ find: jest.fn(async () => existing) }) };
  const ledger = {
    runInTransaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)),
    releaseHold: jest.fn(async (_m: unknown, id: string) => void released.push(id)),
    getBalance: jest.fn(async () => {
      const held = (o.held ?? 0n) + existingSum;
      return { balance: o.balance, held, available: o.balance - held };
    }),
    createHold: jest.fn(
      async (_m: unknown, h: { amount: bigint; reference: string }) => void created.push(h),
    ),
  };
  const users = { findOne: jest.fn(async () => ({ id: 'u1', kycTier: o.tier ?? 1 })) };
  const accounts = { getWallet: jest.fn(async () => ({ id: 'w1' })), restrictedFor: jest.fn() };
  const config = { get: jest.fn(() => caps) };
  const service = new BalanceCapService(
    users as never,
    {} as never,
    accounts as never,
    ledger as never,
    config as never,
  );
  return { service, created, released };
}

describe('BalanceCapService.reconcile', () => {
  it('restricts only the part of the balance above the tier cap', async () => {
    const { service, created } = setup({ balance: 40_000_000n });
    await expect(service.reconcile('u1')).resolves.toBe(10_000_000n);
    expect(created[0].amount).toBe(10_000_000n);
    expect(created[0].reference.startsWith('kyc-cap:')).toBe(true);
  });

  it('restricts nothing at or below the cap', async () => {
    const { service, created } = setup({ balance: 30_000_000n });
    await expect(service.reconcile('u1')).resolves.toBe(0n);
    expect(created).toHaveLength(0);
  });

  it('releases the old restriction first, so a higher tier frees the money', async () => {
    const { service, created, released } = setup({
      tier: 2,
      balance: 40_000_000n,
      existing: [{ id: 'h1', amount: '10000000' }],
    });
    await expect(service.reconcile('u1')).resolves.toBe(0n);
    expect(released).toEqual(['h1']);
    expect(created).toHaveLength(0);
  });

  it('is idempotent: the same balance gives one restriction of the same size', async () => {
    const { service, created, released } = setup({
      balance: 40_000_000n,
      existing: [{ id: 'h1', amount: '10000000' }],
    });
    await service.reconcile('u1');
    expect(released).toEqual(['h1']);
    expect(created.map((c) => c.amount)).toEqual([10_000_000n]);
  });

  it('never restricts more than is free, e.g. when part of the balance is already held for a transfer', async () => {
    const { service, created } = setup({ balance: 40_000_000n, held: 35_000_000n });
    await service.reconcile('u1');
    expect(created[0].amount).toBe(5_000_000n);
  });

  it('applies no cap at the top tier', async () => {
    const { service, created } = setup({ tier: 3, balance: 900_000_000n });
    await expect(service.reconcile('u1')).resolves.toBe(0n);
    expect(created).toHaveLength(0);
  });
});

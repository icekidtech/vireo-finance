import { BadRequestException, HttpException } from '@nestjs/common';
import { PinService, isWeakPin } from './pin.service';

const PEPPER = 'p'.repeat(40);

function setup(pepper = PEPPER) {
  let row: Record<string, any> | null = null;
  const pins = {
    findOne: jest.fn(async () => row),
    create: jest.fn((v: Record<string, unknown>) => ({ ...v })),
    save: jest.fn(async (v: Record<string, unknown>) => {
      row = v;
      return v;
    }),
  };
  const service = new PinService(pins as never, { get: jest.fn(() => pepper) } as never);
  return { service, getRow: () => row };
}

describe('isWeakPin', () => {
  it.each(['0000', '1111', '1234', '4321', '2580', '1212'])('flags %s', (p) =>
    expect(isWeakPin(p)).toBe(true),
  );
  it.each(['4827', '9031', '1357'])('allows %s', (p) => expect(isWeakPin(p)).toBe(false));
});

describe('PinService', () => {
  it('stores a salted hash, never the PIN', async () => {
    const { service, getRow } = setup();
    await service.set('u1', '4827');
    const row = getRow()!;
    expect(JSON.stringify(row)).not.toContain('4827');
    expect(row.pinHash).toHaveLength(128);
    expect(row.salt).toHaveLength(32);
    await expect(service.status('u1')).resolves.toMatchObject({ set: true, locked: false });
  });

  it('verifies the right PIN and rejects a wrong one with the attempts left', async () => {
    const { service } = setup();
    await service.set('u1', '4827');
    await expect(service.verify('u1', '4827')).resolves.toBeUndefined();
    await expect(service.verify('u1', '1111')).rejects.toThrow('4 attempts left');
    await expect(service.verify('u1', '1111')).rejects.toThrow('3 attempts left');
  });

  it('locks for 15 minutes after five wrong tries, even for the right PIN', async () => {
    const { service } = setup();
    await service.set('u1', '4827');
    for (let i = 0; i < 4; i++) await service.verify('u1', '0001').catch(() => undefined);
    const err = await service.verify('u1', '0001').catch((e: HttpException) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    await expect(service.verify('u1', '4827')).rejects.toThrow(/locked/);
    await expect(service.status('u1')).resolves.toMatchObject({ locked: true });
  });

  it('a correct PIN clears the failure count', async () => {
    const { service, getRow } = setup();
    await service.set('u1', '4827');
    await service.verify('u1', '0001').catch(() => undefined);
    await service.verify('u1', '4827');
    expect(getRow()!.failedAttempts).toBe(0);
  });

  it('changing needs the current PIN, and the new one works', async () => {
    const { service } = setup();
    await service.set('u1', '4827');
    await expect(service.set('u1', '9031')).rejects.toThrow(/current PIN/);
    await expect(service.set('u1', '9031', '1357')).rejects.toThrow(/Wrong PIN/);
    await service.set('u1', '9031', '4827');
    await expect(service.verify('u1', '9031')).resolves.toBeUndefined();
    await expect(service.verify('u1', '4827')).rejects.toThrow(BadRequestException);
  });

  it('rejects weak and malformed PINs', async () => {
    const { service } = setup();
    await expect(service.set('u1', '1234')).rejects.toThrow(/easy to guess/);
    await expect(service.set('u1', '12')).rejects.toThrow(/4 digits/);
    await expect(service.set('u1', 'abcd')).rejects.toThrow(/4 digits/);
  });

  it('a reset replaces a forgotten PIN and clears any lock', async () => {
    const { service } = setup();
    await service.set('u1', '4827');
    for (let i = 0; i < 5; i++) await service.verify('u1', '0001').catch(() => undefined);
    await service.resetAfterOtp('u1', '9031');
    await expect(service.verify('u1', '9031')).resolves.toBeUndefined();
  });

  it('is keyed per user and per server secret', async () => {
    const a = setup();
    const b = setup('q'.repeat(40));
    await a.service.set('u1', '4827');
    await b.service.set('u1', '4827');
    const hashA = a.getRow()!.pinHash;
    const hashB = b.getRow()!.pinHash;
    expect(hashA).not.toBe(hashB);
  });

  it('refuses to work without a strong pepper', async () => {
    await expect(setup('short').service.set('u1', '4827')).rejects.toThrow(/not available/);
  });
});

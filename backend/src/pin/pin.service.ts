import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPin } from './user-pin.entity';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const PIN_PATTERN = /^\d{4}$/;

function scryptAsync(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** 0000, 1111, 1234, 4321, 2580 and similar guessable PINs. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((v, i) => i === 0 || v - d[i - 1] === step))
    return true;
  return ['2580', '1212', '2020', '1010'].includes(pin);
}

/**
 * The transaction PIN, a fallback way to approve a payment when the phone's
 * biometrics are not available. A 4-digit PIN has only 10,000 values, so the
 * hash alone would not survive a database leak: it is also keyed with a server
 * secret (PIN_PEPPER) that never lives in the database, and wrong guesses lock
 * the PIN for 15 minutes after 5 tries.
 */
@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name);

  constructor(
    @InjectRepository(UserPin) private readonly pins: Repository<UserPin>,
    private readonly config: ConfigService,
  ) {}

  private async hash(userId: string, pin: string, salt: Buffer): Promise<string> {
    const pepper = this.config.get<string>('pin.pepper') ?? '';
    if (pepper.length < 32) throw new ForbiddenException('PIN is not available on this server');
    const keyed = createHmac('sha256', pepper).update(`${userId}:${pin}`).digest('hex');
    return (await scryptAsync(keyed, salt)).toString('hex');
  }

  async status(userId: string) {
    const row = await this.pins.findOne({ where: { userId } });
    const locked = !!row?.lockedUntil && row.lockedUntil.getTime() > Date.now();
    return { set: !!row, locked, lockedUntil: locked ? row!.lockedUntil : null };
  }

  /** First-time set, or change (which needs the current PIN). Forgotten PINs use resetWithOtp. */
  async set(userId: string, pin: string, currentPin?: string): Promise<void> {
    this.assertFormat(pin);
    if (isWeakPin(pin)) {
      throw new BadRequestException(
        'Choose a PIN that is not easy to guess (no 1234, 1111, 0000…)',
      );
    }
    const existing = await this.pins.findOne({ where: { userId } });
    if (existing) {
      if (!currentPin) throw new BadRequestException('Enter your current PIN to change it');
      await this.verify(userId, currentPin);
    }
    await this.write(userId, pin, existing ?? null);
  }

  /** Replaces a forgotten PIN. The caller must already have proven phone ownership (a fresh one-time code). */
  async resetAfterOtp(userId: string, pin: string): Promise<void> {
    this.assertFormat(pin);
    if (isWeakPin(pin)) {
      throw new BadRequestException(
        'Choose a PIN that is not easy to guess (no 1234, 1111, 0000…)',
      );
    }
    await this.write(userId, pin, await this.pins.findOne({ where: { userId } }));
  }

  /** Throws unless the PIN is right. Counts failures and locks after too many. */
  async verify(userId: string, pin: string): Promise<void> {
    const row = await this.pins.findOne({ where: { userId } });
    if (!row) throw new BadRequestException('Set a PIN first');
    if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        'PIN is locked. Try again in a few minutes or reset it.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!PIN_PATTERN.test(pin)) throw new BadRequestException('Enter your 4-digit PIN');

    const expected = Buffer.from(row.pinHash, 'hex');
    const actual = Buffer.from(await this.hash(userId, pin, Buffer.from(row.salt, 'hex')), 'hex');
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      if (row.failedAttempts > 0 || row.lockedUntil) {
        row.failedAttempts = 0;
        row.lockedUntil = null;
        await this.pins.save(row);
      }
      return;
    }

    row.failedAttempts += 1;
    if (row.failedAttempts >= MAX_ATTEMPTS) {
      row.lockedUntil = new Date(Date.now() + LOCK_MS);
      row.failedAttempts = 0;
      await this.pins.save(row);
      this.logger.warn(`PIN locked for user ${userId} after repeated wrong attempts`);
      throw new HttpException(
        'Too many wrong PINs. It is locked for 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.pins.save(row);
    throw new BadRequestException(`Wrong PIN. ${MAX_ATTEMPTS - row.failedAttempts} attempts left.`);
  }

  private assertFormat(pin: string): void {
    if (!PIN_PATTERN.test(pin)) throw new BadRequestException('PIN must be exactly 4 digits');
  }

  private async write(userId: string, pin: string, existing: UserPin | null): Promise<void> {
    const salt = randomBytes(16);
    const row =
      existing ??
      this.pins.create({ userId, pinHash: '', salt: '', failedAttempts: 0, lockedUntil: null });
    row.salt = salt.toString('hex');
    row.pinHash = await this.hash(userId, pin, salt);
    row.failedAttempts = 0;
    row.lockedUntil = null;
    await this.pins.save(row);
  }
}

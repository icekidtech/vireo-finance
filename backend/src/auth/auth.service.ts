import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { PagaService } from '../paga/paga.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hmacSha256Hex } from '../common/crypto';
import {
  DevicePlatform,
  DeviceStatus,
  SignatureAlgorithm,
  UserRole,
  UserStatus,
} from '../common/enums';
import { User } from '../users/user.entity';
import { Device } from './device.entity';
import { PhoneOtp } from './phone-otp.entity';
import { LoginDto, RegisterDeviceDto, RegisterDto } from './dto/auth.dto';
import { AppleAttestService } from './attestation/apple-attest.service';
import { GooglePlayIntegrityService } from './attestation/google-play-integrity.service';

const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(PhoneOtp) private readonly otps: Repository<PhoneOtp>,
    private readonly accounts: AccountsService,
    private readonly paga: PagaService,
    private readonly notifications: NotificationsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly appleAttest: AppleAttestService,
    private readonly googlePlayIntegrity: GooglePlayIntegrityService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Register: a phone number (one-time-code login), email + password,   */
  /* or both                                                              */
  /* ------------------------------------------------------------------ */

  async register(dto: RegisterDto) {
    const email = dto.email?.trim().toLowerCase() || undefined;
    const phone = dto.phone ? normalizePhone(dto.phone) : '';
    if (!phone && !email) {
      throw new BadRequestException('Provide a phone number, or an email and password');
    }
    if (email && !dto.password) {
      throw new BadRequestException('A password is required when registering with an email');
    }
    if (dto.password && !email) {
      throw new BadRequestException('An email is required when a password is set');
    }

    const existing =
      (email ? await this.users.findOne({ where: { email } }) : null) ??
      (phone ? await this.users.findOne({ where: { phone } }) : null);
    if (existing) {
      return { user: toPublicUser(existing), created: false };
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : null;

    const { user, walletId } = await this.dataSource.transaction(async (manager) => {
      const savedUser = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          phone,
          name: dto.name.trim(),
          handle: dto.handle?.toLowerCase() ?? null,
          email: email ?? null,
          passwordHash,
          dateOfBirth: dto.dateOfBirth?.trim() ?? null,
          kycTier: 0,
          role: this.isAdminPhone(phone) ? UserRole.ADMIN : UserRole.USER,
        }),
      );
      const account = await this.accounts.createWallet(savedUser.id, manager);
      return { user: savedUser, walletId: account.id };
    });

    // Register with Paga (best-effort)
    const nameParts = splitFullName(user.name);
    try {
      await this.paga.registerCustomer({
        referenceNumber: `reg_${user.id}`,
        customerFirstName: nameParts.firstName,
        customerLastName: nameParts.lastName,
        customerPhoneNumber: user.phone,
        customerEmail: user.email ?? undefined,
        customerDateOfBirth: user.dateOfBirth ?? undefined,
      });
    } catch (error) {
      this.logger.warn(`Paga customer registration failed for ${user.id}: ${String(error)}`);
    }

    // Provision virtual account (best-effort)
    try {
      const virtual = await this.paga.createVirtualAccount({
        userId: user.id,
        name: user.name,
        phone: user.phone,
      });
      await this.accounts.createVirtualAccount(user.id, walletId, virtual);
    } catch (error) {
      this.logger.warn(`Virtual account provisioning failed for ${user.id}: ${String(error)}`);
    }

    // Send welcome email (best-effort, only when there is an email)
    if (user.email) {
      try {
        await this.notifications.sendWelcome(user);
      } catch (error) {
        this.logger.warn(`Welcome email failed for ${user.id}: ${String(error)}`);
      }
    }

    return { user: toPublicUser(user), created: true };
  }

  /* ------------------------------------------------------------------ */
  /* Login with email + password                                          */
  /* ------------------------------------------------------------------ */

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    return { accessToken: this.issueToken(user.id), user: toPublicUser(user) };
  }

  /* ------------------------------------------------------------------ */
  /* Login with a one-time code sent to the phone                         */
  /* ------------------------------------------------------------------ */

  async requestOtp(phoneInput: string) {
    const phone = normalizePhone(phoneInput);
    const user = await this.users.findOne({ where: { phone } });
    if (!user) {
      throw new NotFoundException('User is not registered');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active');
    }

    const code = randomInt(100000, 1000000).toString();
    const ttl = this.config.get<number>('otp.ttlSeconds') ?? 300;
    await this.otps.save(
      this.otps.create({
        phone,
        codeHash: this.hashOtp(phone, code),
        expiresAt: new Date(Date.now() + ttl * 1000),
      }),
    );

    // Until an SMS gateway exists the code is written to the server log, only
    // when OTP_LOG_CODE is set. It is never returned in the API response.
    if (this.config.get<boolean>('otp.logCode')) {
      this.logger.warn(`OTP for ${phone}: ${code} (expires in ${ttl}s)`);
    }
    return { expiresIn: ttl };
  }

  /** Proves the signed-in user owns their phone right now (a fresh one-time code), for sensitive changes such as resetting the PIN. */
  async consumeOtpForUser(userId: string, code: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.consumeOtp(user.phone, code);
  }

  private async consumeOtp(phone: string, code: string): Promise<void> {
    const otp = await this.otps.findOne({
      where: { phone, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!otp || otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP is invalid or expired');
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many OTP attempts');
    }
    if (otp.codeHash !== this.hashOtp(phone, code)) {
      otp.attempts += 1;
      await this.otps.save(otp);
      throw new BadRequestException('OTP is invalid or expired');
    }
    otp.consumedAt = new Date();
    await this.otps.save(otp);
  }

  async verifyOtp(phoneInput: string, code: string) {
    const phone = normalizePhone(phoneInput);
    await this.consumeOtp(phone, code);

    const user = await this.users.findOne({ where: { phone } });
    if (!user) {
      throw new NotFoundException('User is not registered');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    return { accessToken: this.issueToken(user.id), user: toPublicUser(user) };
  }

  /* ------------------------------------------------------------------ */
  /* Device management (with attestation verification)                    */
  /* ------------------------------------------------------------------ */

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    let attestationState = 'unverified';

    if (dto.attestationToken) {
      if (dto.platform === DevicePlatform.IOS) {
        const result = await this.appleAttest.verify(dto.attestationToken, userId);
        attestationState = result.verified ? 'verified' : 'failed';
        if (!result.verified) {
          this.logger.warn(`Apple attestation failed for user ${userId}: ${result.error}`);
        }
      } else if (dto.platform === DevicePlatform.ANDROID) {
        const result = await this.googlePlayIntegrity.verify(dto.attestationToken);
        attestationState = result.verified ? 'verified' : 'failed';
        if (!result.verified) {
          this.logger.warn(`Play Integrity failed for user ${userId}: ${result.error}`);
        }
      } else {
        attestationState = 'provided';
      }
    }

    const device = await this.devices.save(
      this.devices.create({
        userId,
        publicKey: dto.publicKey,
        platform: dto.platform,
        algorithm: dto.algorithm ?? SignatureAlgorithm.ED25519,
        attestationState,
        status: DeviceStatus.ACTIVE,
      }),
    );
    return toPublicDevice(device);
  }

  async listDevices(userId: string) {
    const devices = await this.devices.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return devices.map(toPublicDevice);
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.devices.findOne({ where: { id: deviceId, userId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    device.status = DeviceStatus.REVOKED;
    device.revokedAt = new Date();
    await this.devices.save(device);
    return toPublicDevice(device);
  }

  /* ------------------------------------------------------------------ */
  /* Profile                                                              */
  /* ------------------------------------------------------------------ */

  async getProfile(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  private hashOtp(phone: string, code: string): string {
    const secret = this.config.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT secret is not configured');
    }
    return hmacSha256Hex(secret, `${phone}:${code}`);
  }

  /** Staff bootstrap: phones listed in ADMIN_PHONES register with the admin role. */
  private isAdminPhone(phone: string): boolean {
    if (!phone) return false;
    const adminPhones = (this.config.get<string[]>('admin.phones') ?? []).map(normalizePhone);
    return adminPhones.includes(phone);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '');
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    phone: user.phone,
    handle: user.handle,
    name: user.name,
    email: user.email,
    dateOfBirth: user.dateOfBirth,
    kycTier: user.kycTier,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: 'Vireo', lastName: 'Customer' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function toPublicDevice(device: Device) {
  return {
    id: device.id,
    platform: device.platform,
    algorithm: device.algorithm,
    attestationState: device.attestationState,
    status: device.status,
    createdAt: device.createdAt,
  };
}

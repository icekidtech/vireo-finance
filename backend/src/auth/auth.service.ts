import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
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
import { EmailNotificationProvider } from '../notifications/providers/email.provider';
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
import { EmailOtp } from './email-otp.entity';
import { LoginDto, RegisterDeviceDto, RegisterDto } from './dto/auth.dto';
import { AppleAttestService } from './attestation/apple-attest.service';
import { GooglePlayIntegrityService } from './attestation/google-play-integrity.service';

const MAX_OTP_ATTEMPTS = 5;
const EMAIL_OTP_COOLDOWN_MS = 30_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(EmailOtp) private readonly emailOtps: Repository<EmailOtp>,
    private readonly accounts: AccountsService,
    private readonly paga: PagaService,
    private readonly notifications: NotificationsService,
    private readonly emailProvider: EmailNotificationProvider,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly appleAttest: AppleAttestService,
    private readonly googlePlayIntegrity: GooglePlayIntegrityService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Register with an email and a phone number. Sign-in is by a one-time  */
  /* code sent to the email (a password is optional).                     */
  /* ------------------------------------------------------------------ */

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = normalizePhone(dto.phone);

    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      return { user: toPublicUser(existing), created: false };
    }
    if (await this.users.findOne({ where: { phone } })) {
      throw new ConflictException('This phone number is already registered to another account');
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : null;

    const { user, walletId } = await this.dataSource.transaction(async (manager) => {
      const savedUser = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          phone,
          name: dto.name.trim(),
          handle: dto.handle?.toLowerCase() ?? null,
          email,
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

  /** Sends the signed-in user a fresh one-time code by email, for sensitive changes such as resetting the PIN. */
  async sendCodeToUser(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.email) {
      throw new BadRequestException('Add an email address to your account to receive a code');
    }
    return this.requestEmailOtp(user.email);
  }

  /** Proves the signed-in user owns their email right now (a fresh one-time code). */
  async consumeOtpForUser(userId: string, code: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.email) throw new BadRequestException('Verification code is invalid or expired');
    await this.consumeEmailOtp(user.email, code);
  }

  /* ------------------------------------------------------------------ */
  /* Email OTP: Passwordless login via email verification code            */
  /* ------------------------------------------------------------------ */

  async requestEmailOtp(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account found with this email');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // One code per half minute per email: stops anyone using this endpoint to spam an inbox.
    const latest = await this.emailOtps.findOne({ where: { email }, order: { createdAt: 'DESC' } });
    if (latest?.createdAt && Date.now() - latest.createdAt.getTime() < EMAIL_OTP_COOLDOWN_MS) {
      throw new HttpException(
        'Please wait a moment before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 1000000).toString();
    const ttl = this.config.get<number>('otp.ttlSeconds') ?? 300;
    const saved = await this.emailOtps.save(
      this.emailOtps.create({
        email,
        codeHash: this.hashEmailOtp(email, code),
        expiresAt: new Date(Date.now() + ttl * 1000),
      }),
    );

    // Send via Resend
    try {
      await this.emailProvider.sendVerificationCode(email, code);
    } catch (error) {
      this.logger.error(`Failed to send email OTP to ${email}: ${String(error)}`);
      // Nothing was delivered, so drop the code: it would only block an immediate retry.
      try {
        await this.emailOtps.delete({ id: saved.id });
      } catch {
        // Best effort: the cooldown only delays a retry by a few seconds.
      }
      throw new BadRequestException('Could not send verification email');
    }

    // Log code in development
    if (this.config.get<boolean>('otp.logCode')) {
      this.logger.warn(`📧 Email OTP for ${email}: ${code} (expires in ${ttl}s)`);
    }

    return { expiresIn: ttl };
  }

  async verifyEmailOtp(emailInput: string, code: string) {
    const email = emailInput.trim().toLowerCase();
    await this.consumeEmailOtp(email, code);

    const user = await this.users.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account found with this email');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    return { accessToken: this.issueToken(user.id), user: toPublicUser(user) };
  }

  private async consumeEmailOtp(email: string, code: string): Promise<void> {
    const otp = await this.emailOtps.findOne({
      where: { email, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!otp || otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code is invalid or expired');
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many attempts. Request a new code.');
    }
    if (otp.codeHash !== this.hashEmailOtp(email, code)) {
      otp.attempts += 1;
      await this.emailOtps.save(otp);
      throw new BadRequestException('Verification code is invalid or expired');
    }
    otp.consumedAt = new Date();
    await this.emailOtps.save(otp);
  }

  private hashEmailOtp(email: string, code: string): string {
    return hmacSha256Hex(this.config.get<string>('jwt.secret') ?? '', `email-otp:${email}:${code}`);
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

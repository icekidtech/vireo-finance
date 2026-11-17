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
import { randomInt } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { PagaService } from '../paga/paga.service';
import { hmacSha256Hex } from '../common/crypto';
import { DeviceStatus, SignatureAlgorithm, UserRole, UserStatus } from '../common/enums';
import { User } from '../users/user.entity';
import { Device } from './device.entity';
import { PhoneOtp } from './phone-otp.entity';
import { RegisterDeviceDto, RegisterDto } from './dto/auth.dto';

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
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const phone = normalizePhone(dto.phone);
    const existing = await this.users.findOne({ where: { phone } });
    if (existing) {
      return { user: toPublicUser(existing), created: false };
    }

    const { user, walletId } = await this.dataSource.transaction(async (manager) => {
      const savedUser = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          phone,
          name: dto.name.trim(),
          handle: dto.handle?.toLowerCase() ?? null,
          kycTier: 0,
          role: this.isAdminPhone(phone) ? UserRole.ADMIN : UserRole.USER,
        }),
      );
      const account = await this.accounts.createWallet(savedUser.id, manager);
      return { user: savedUser, walletId: account.id };
    });

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

    return { user: toPublicUser(user), created: true };
  }

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

    // The code is echoed only when explicitly enabled for local development
    // (OTP_ECHO_CODE); startup validation forbids it in production.
    return {
      expiresIn: ttl,
      ...(this.config.get<boolean>('otp.echoCode') ? { devCode: code } : {}),
    };
  }

  async verifyOtp(phoneInput: string, code: string) {
    const phone = normalizePhone(phoneInput);
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

    const user = await this.users.findOne({ where: { phone } });
    if (!user) {
      throw new NotFoundException('User is not registered');
    }

    return { accessToken: this.issueToken(user.id), user: toPublicUser(user) };
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const device = await this.devices.save(
      this.devices.create({
        userId,
        publicKey: dto.publicKey,
        platform: dto.platform,
        algorithm: dto.algorithm ?? SignatureAlgorithm.ED25519,
        // No attestation verifier exists yet, so the state is never anything but unverified.
        attestationState: 'unverified',
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
    const adminPhones = (this.config.get<string[]>('admin.phones') ?? []).map(normalizePhone);
    return adminPhones.includes(phone);
  }
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
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
    kycTier: user.kycTier,
    status: user.status,
    role: user.role,
    createdAt: user.createdAt,
  };
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

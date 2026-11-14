import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { PagaService } from '../paga/paga.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DevicePlatform, DeviceStatus, SignatureAlgorithm, UserStatus } from '../common/enums';
import { User } from '../users/user.entity';
import { Device } from './device.entity';
import { LoginDto, RegisterDeviceDto, RegisterDto } from './dto/auth.dto';
import { AppleAttestService } from './attestation/apple-attest.service';
import { GooglePlayIntegrityService } from './attestation/google-play-integrity.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly accounts: AccountsService,
    private readonly paga: PagaService,
    private readonly notifications: NotificationsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly appleAttest: AppleAttestService,
    private readonly googlePlayIntegrity: GooglePlayIntegrityService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Register (email + password)                                        */
  /* ------------------------------------------------------------------ */

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      return { user: toPublicUser(existing), created: false };
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const phone = dto.phone ? normalizePhone(dto.phone) : '';

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

    // Send welcome email (best-effort)
    try {
      await this.notifications.sendWelcome(user);
    } catch (error) {
      this.logger.warn(`Welcome email failed for ${user.id}: ${String(error)}`);
    }

    return { user: toPublicUser(user), created: true };
  }

  /* ------------------------------------------------------------------ */
  /* Login (email + password)                                           */
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
  /* Device management (with attestation verification)                  */
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
      throw new UnauthorizedException('Device not found');
    }
    device.status = DeviceStatus.REVOKED;
    device.revokedAt = new Date();
    await this.devices.save(device);
    return toPublicDevice(device);
  }

  /* ------------------------------------------------------------------ */
  /* Profile                                                            */
  /* ------------------------------------------------------------------ */

  async getProfile(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return toPublicUser(user);
  }

  issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
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

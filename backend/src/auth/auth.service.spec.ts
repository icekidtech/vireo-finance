import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { Device } from './device.entity';
import { EmailOtp } from './email-otp.entity';
import { EmailNotificationProvider } from '../notifications/providers/email.provider';
import { AccountsService } from '../accounts/accounts.service';
import { PagaService } from '../paga/paga.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppleAttestService } from './attestation/apple-attest.service';
import { GooglePlayIntegrityService } from './attestation/google-play-integrity.service';
import { hmacSha256Hex } from '../common/crypto';
import {
  DevicePlatform,
  DeviceStatus,
  SignatureAlgorithm,
  UserRole,
  UserStatus,
} from '../common/enums';

const mockUser: User = {
  id: 'user-1',
  phone: '+2348012345678',
  handle: 'alice',
  name: 'Alice',
  email: null,
  passwordHash: null,
  dateOfBirth: null,
  kycTier: 0,
  status: UserStatus.ACTIVE,
  role: UserRole.USER,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDevice: Device = {
  id: 'device-1',
  userId: 'user-1',
  publicKey: 'base64pubkey',
  platform: DevicePlatform.IOS,
  algorithm: SignatureAlgorithm.ED25519,
  attestationState: 'provided',
  status: DeviceStatus.ACTIVE,
  revokedAt: null,
  createdAt: new Date(),
};

function mockRepository<T extends object>(_entity: T) {
  return {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto: any) => dto),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

function mockDataSource(transactionResult: any) {
  return {
    transaction: jest.fn(async (work: any) => work(transactionResult)),
    getRepository: jest.fn(),
  } as unknown as jest.Mocked<DataSource>;
}

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: any;
  let devicesRepo: any;
  let emailOtpsRepo: any;
  let emailProvider: any;
  let dataSource: any;
  let accountsService: any;
  let pagaService: any;
  let jwtService: any;
  let configService: any;

  beforeEach(async () => {
    usersRepo = mockRepository(mockUser);
    devicesRepo = mockRepository(mockDevice);
    emailOtpsRepo = mockRepository({});
    emailProvider = { sendVerificationCode: jest.fn(async () => undefined) };
    dataSource = mockDataSource(mockUser);
    accountsService = {
      createWallet: jest.fn(async () => ({ id: 'wallet-1' })),
      createVirtualAccount: jest.fn(),
    };
    pagaService = {
      registerCustomer: jest.fn(async () => ({})),
      createVirtualAccount: jest.fn(async () => ({
        accountNumber: '1234567890',
        bankName: 'Paga',
        providerReference: 'va_ref',
      })),
    };
    jwtService = { sign: jest.fn(() => 'token-123') };
    configService = {
      get: jest.fn((key: string) => {
        const map: any = {
          'jwt.secret': 'test-secret',
          'otp.ttlSeconds': 300,
          env: 'development',
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Device), useValue: devicesRepo },
        { provide: getRepositoryToken(EmailOtp), useValue: emailOtpsRepo },
        { provide: EmailNotificationProvider, useValue: emailProvider },
        { provide: AccountsService, useValue: accountsService },
        { provide: PagaService, useValue: pagaService },
        { provide: NotificationsService, useValue: { sendWelcome: jest.fn() } },
        { provide: AppleAttestService, useValue: { verify: jest.fn() } },
        { provide: GooglePlayIntegrityService, useValue: { verify: jest.fn() } },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    const txn = () => {
      let saved: any;
      dataSource.transaction.mockImplementation(async (work: any) =>
        work({
          getRepository: jest.fn(() => ({
            save: jest.fn(async (dto: any) => (saved = dto)),
            create: jest.fn((dto: any) => dto),
          })),
        }),
      );
      return () => saved;
    };

    it('creates the account with an email and a phone, and no password', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      const saved = txn();
      const result = await service.register({
        email: ' Alice@Example.com ',
        phone: '+2348012345678',
        name: 'Alice Doe',
      });
      expect(result.created).toBe(true);
      expect(saved().email).toBe('alice@example.com');
      expect(saved().phone).toBe('+2348012345678');
      expect(saved().passwordHash).toBeNull();
    });

    it('still hashes a password when one is given', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      const saved = txn();
      await service.register({
        email: 'alice@example.com',
        phone: '+2348012345678',
        password: 'correct horse',
        name: 'Alice Doe',
      });
      expect(saved().passwordHash).toMatch(/^\$2[aby]\$/);
      expect(saved().passwordHash).not.toContain('correct horse');
    });

    it('returns the existing user, without creating one, when the email is taken', async () => {
      usersRepo.findOne.mockResolvedValue({ ...mockUser, email: 'alice@example.com' });
      const result = await service.register({
        email: 'alice@example.com',
        phone: '+2348012345678',
        name: 'Alice',
      });
      expect(result.created).toBe(false);
      expect(result.user.id).toBe('user-1');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses a phone number that belongs to a different account', async () => {
      usersRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.phone ? mockUser : null,
      );
      await expect(
        service.register({ email: 'new@example.com', phone: '+2348012345678', name: 'Bob' }),
      ).rejects.toThrow('already registered');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  it('has no phone one-time-code login', () => {
    expect((service as any).requestOtp).toBeUndefined();
    expect((service as any).verifyOtp).toBeUndefined();
  });

  describe('email one-time code', () => {
    const email = 'alice@example.com';
    const emailUser = { ...mockUser, email };

    it('sends the code by email and never returns it', async () => {
      usersRepo.findOne.mockResolvedValue(emailUser);
      const result = await service.requestEmailOtp(' Alice@Example.com ');
      expect(result).toEqual({ expiresIn: 300 });
      expect(JSON.stringify(result)).not.toMatch(/\d{6}/);
      expect(emailProvider.sendVerificationCode).toHaveBeenCalledTimes(1);
      const [to, code] = emailProvider.sendVerificationCode.mock.calls[0];
      expect(to).toBe(email);
      expect(code).toMatch(/^\d{6}$/);
      // Only a hash of the code is stored.
      const saved = emailOtpsRepo.save.mock.calls[0][0];
      expect(saved.codeHash).toBe(hmacSha256Hex('test-secret', `email-otp:${email}:${code}`));
      expect(saved.codeHash).not.toContain(code);
    });

    it('waits between codes so an inbox cannot be spammed', async () => {
      usersRepo.findOne.mockResolvedValue(emailUser);
      emailOtpsRepo.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) });
      await expect(service.requestEmailOtp(email)).rejects.toMatchObject({ status: 429 });
      expect(emailProvider.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('emails a PIN-reset code to the signed-in user only', async () => {
      usersRepo.findOne.mockResolvedValue(emailUser);
      await service.sendCodeToUser('user-1');
      expect(emailProvider.sendVerificationCode).toHaveBeenCalledWith(email, expect.any(String));
    });

    it('cannot send a PIN-reset code to a user with no email', async () => {
      usersRepo.findOne.mockResolvedValue({ ...mockUser, email: null });
      await expect(service.sendCodeToUser('user-1')).rejects.toThrow('Add an email');
      expect(emailProvider.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('does not send a code to an unknown email', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      await expect(service.requestEmailOtp('nobody@example.com')).rejects.toThrow(
        'No account found',
      );
      expect(emailProvider.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('fails when the email cannot be sent', async () => {
      usersRepo.findOne.mockResolvedValue(emailUser);
      emailProvider.sendVerificationCode.mockRejectedValue(new Error('resend down'));
      await expect(service.requestEmailOtp(email)).rejects.toThrow(
        'Could not send verification email',
      );
    });

    it('issues a token for a valid code and consumes it', async () => {
      const code = '123456';
      const otp = {
        email,
        codeHash: hmacSha256Hex('test-secret', `email-otp:${email}:${code}`),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        consumedAt: null,
      };
      emailOtpsRepo.findOne.mockResolvedValue(otp);
      usersRepo.findOne.mockResolvedValue(emailUser);
      const result = await service.verifyEmailOtp(email, code);
      expect(result.accessToken).toBe('token-123');
      expect(otp.consumedAt).toBeInstanceOf(Date);
    });

    it('counts a wrong code and rejects it', async () => {
      const otp = {
        email,
        codeHash: hmacSha256Hex('test-secret', `email-otp:${email}:123456`),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        consumedAt: null,
      };
      emailOtpsRepo.findOne.mockResolvedValue(otp);
      await expect(service.verifyEmailOtp(email, '000000')).rejects.toThrow('invalid or expired');
      expect(otp.attempts).toBe(1);
      expect(otp.consumedAt).toBeNull();
    });

    it('locks a code after too many wrong attempts, even with the right code', async () => {
      const code = '123456';
      emailOtpsRepo.findOne.mockResolvedValue({
        email,
        codeHash: hmacSha256Hex('test-secret', `email-otp:${email}:${code}`),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 5,
        consumedAt: null,
      });
      await expect(service.verifyEmailOtp(email, code)).rejects.toThrow('Too many attempts');
    });

    it('rejects an expired code', async () => {
      emailOtpsRepo.findOne.mockResolvedValue({
        email,
        codeHash: 'x',
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
        consumedAt: null,
      });
      await expect(service.verifyEmailOtp(email, '123456')).rejects.toThrow('invalid or expired');
    });
  });

  describe('registerDevice', () => {
    it('saves a device and returns it', async () => {
      devicesRepo.save.mockResolvedValue(mockDevice);

      const result = await service.registerDevice('user-1', {
        publicKey: 'base64pubkey',
        platform: DevicePlatform.IOS,
      });

      expect(result.id).toBe('device-1');
      expect(devicesRepo.save).toHaveBeenCalled();
    });
  });

  describe('revokeDevice', () => {
    it('revokes a device belonging to the user', async () => {
      const device = { ...mockDevice, save: jest.fn() };
      devicesRepo.findOne.mockResolvedValue(device);
      devicesRepo.save.mockResolvedValue(device);

      await service.revokeDevice('user-1', 'device-1');

      expect(device.status).toBe(DeviceStatus.REVOKED);
      expect(device.revokedAt).toBeDefined();
      expect(devicesRepo.save).toHaveBeenCalledWith(device);
    });

    it('throws when device not found', async () => {
      devicesRepo.findOne.mockResolvedValue(null);

      await expect(service.revokeDevice('user-1', 'missing')).rejects.toThrow('Device not found');
    });
  });
});

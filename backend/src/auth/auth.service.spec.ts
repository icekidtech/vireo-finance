import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { Device } from './device.entity';
import { PhoneOtp } from './phone-otp.entity';
import { AccountsService } from '../accounts/accounts.service';
import { PagaService } from '../paga/paga.service';
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
  let otpsRepo: any;
  let dataSource: any;
  let accountsService: any;
  let pagaService: any;
  let jwtService: any;
  let configService: any;

  beforeEach(async () => {
    usersRepo = mockRepository(mockUser);
    devicesRepo = mockRepository(mockDevice);
    otpsRepo = mockRepository({});
    dataSource = mockDataSource(mockUser);
    accountsService = {
      createWallet: jest.fn(async () => ({ id: 'wallet-1' })),
      createVirtualAccount: jest.fn(),
    };
    pagaService = {
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
        { provide: getRepositoryToken(PhoneOtp), useValue: otpsRepo },
        { provide: AccountsService, useValue: accountsService },
        { provide: PagaService, useValue: pagaService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('creates a user and wallet when phone is new', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      dataSource.transaction.mockImplementation(async (work: any) => {
        const manager = {
          getRepository: jest.fn(() => ({
            save: jest.fn(async (dto: any) => dto),
            create: jest.fn((dto: any) => dto),
          })),
        };
        return work(manager);
      });

      const result = await service.register({
        phone: '+2348012345678',
        name: 'Alice',
      });

      expect(result.created).toBe(true);
      expect(result.user.phone).toBe('+2348012345678');
    });

    it('returns existing user without creating when phone exists', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.register({
        phone: '+2348012345678',
        name: 'Alice',
      });

      expect(result.created).toBe(false);
      expect(result.user.id).toBe('user-1');
    });
  });

  describe('requestOtp', () => {
    it('never returns the code unless OTP echo is explicitly enabled', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      otpsRepo.findOne.mockResolvedValue(null);

      const result = await service.requestOtp('+2348012345678');

      expect(result.expiresIn).toBe(300);
      expect(result.devCode).toBeUndefined();
    });

    it('returns the code only when OTP echo is enabled for local development', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      otpsRepo.findOne.mockResolvedValue(null);
      const base = configService.get;
      configService.get = jest.fn((key: string) => (key === 'otp.echoCode' ? true : base(key)));

      const result = await service.requestOtp('+2348012345678');

      expect(result.devCode).toHaveLength(6);
    });

    it('throws when user not registered', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.requestOtp('+2348012345678')).rejects.toThrow('User is not registered');
    });
  });

  describe('verifyOtp', () => {
    it('issues a token on valid OTP', async () => {
      const otp = {
        phone: '+2348012345678',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: new Date(Date.now() + 100000),
        consumedAt: null,
        save: jest.fn(),
      };
      usersRepo.findOne.mockResolvedValue(mockUser);
      otpsRepo.findOne.mockResolvedValue(otp);

      const code = '123456';
      otp.codeHash = hmacSha256Hex('test-secret', `+2348012345678:${code}`);

      const result = await service.verifyOtp('+2348012345678', code);

      expect(result.accessToken).toBe('token-123');
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1' });
    });

    it('throws on invalid OTP', async () => {
      const otp = {
        phone: '+2348012345678',
        codeHash: 'wronghash',
        attempts: 0,
        expiresAt: new Date(Date.now() + 100000),
        consumedAt: null,
        save: jest.fn(),
      };
      usersRepo.findOne.mockResolvedValue(mockUser);
      otpsRepo.findOne.mockResolvedValue(otp);

      await expect(service.verifyOtp('+2348012345678', '000000')).rejects.toThrow(
        'OTP is invalid or expired',
      );
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

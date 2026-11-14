import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycRecord } from './kyc-record.entity';
import { User } from '../users/user.entity';
import { PagaService } from '../paga/paga.service';
import { KycStatus, UserStatus } from '../common/enums';

describe('KycService', () => {
  let service: KycService;
  let mockKycRecordsRepo: any;
  let mockUsersRepo: any;
  let mockPagaService: any;
  let mockConfigService: any;

  const mockUser: User = {
    id: 'user-uuid-1234',
    phone: '+2348012345678',
    name: 'Amina Bello',
    handle: 'aminabello',
    email: 'amina@example.com',
    dateOfBirth: '1995-05-15',
    kycTier: 0,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockKycRecordsRepo = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'rec-1', ...dto, createdAt: new Date() })),
      save: jest.fn().mockImplementation((rec) => Promise.resolve(rec)),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockUsersRepo = {
      findOne: jest.fn().mockResolvedValue({ ...mockUser }),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };

    mockPagaService = {
      registerCustomerIdentification: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue({
        tierDailyLimits: {
          0: 2000000n, // 20,000 NGN
          1: 5000000n, // 50,000 NGN
          2: 20000000n, // 200,000 NGN
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: getRepositoryToken(KycRecord), useValue: mockKycRecordsRepo },
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: PagaService, useValue: mockPagaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  it('should submit identification and upgrade user tier upon Paga success', async () => {
    mockPagaService.registerCustomerIdentification.mockResolvedValue({
      responseCode: '0',
      message: 'Identification verified',
      referenceNumber: 'kyc_test_ref',
      raw: {},
    });

    const result = await service.submitIdentification('user-uuid-1234', {
      idType: 'NATIONAL_ID',
      idNumber: '12345678901',
      expirationDate: '2030-01-01',
      idPhoto: 'data:image/jpeg;base64,...',
      targetTier: 2,
    });

    expect(result.status).toBe(KycStatus.VERIFIED);
    expect(result.userTier).toBe(2);
    expect(result.dailyLimit).toBe('200000.00');
    expect(mockUsersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ kycTier: 2 }),
    );
  });

  it('should return pending status if Paga reports asynchronous processing', async () => {
    mockPagaService.registerCustomerIdentification.mockResolvedValue({
      responseCode: '1',
      message: 'Pending manual compliance check',
      referenceNumber: 'kyc_test_ref',
      raw: {},
    });

    const result = await service.submitIdentification('user-uuid-1234', {
      idType: 'VOTERS_CARD',
      idNumber: '90ABC123XYZ',
      targetTier: 1,
    });

    expect(result.status).toBe(KycStatus.PENDING);
    expect(result.userTier).toBe(0); // remains 0 until verified
  });

  it('should return current KYC status and tier limits', async () => {
    mockKycRecordsRepo.findOne.mockResolvedValue({
      id: 'rec-1',
      tier: 1,
      provider: 'paga',
      status: KycStatus.VERIFIED,
      verifiedAt: new Date(),
      createdAt: new Date(),
    });

    const status = await service.getKycStatus('user-uuid-1234');
    expect(status.userId).toBe('user-uuid-1234');
    expect(status.kycTier).toBe(0);
    expect(status.dailyLimit).toBe('20000.00');
    expect(status.tierLimits.tier0).toBe('20000.00');
    expect(status.tierLimits.tier1).toBe('50000.00');
    expect(status.tierLimits.tier2).toBe('200000.00');
    expect(status.latestVerification?.status).toBe(KycStatus.VERIFIED);
  });
});

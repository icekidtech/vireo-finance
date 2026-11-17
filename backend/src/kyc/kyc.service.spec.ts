import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KycService } from './kyc.service';
import { KycStatus, UserStatus } from '../common/enums';

function mockRepo(_entity: any) {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (dto: any) => dto),
    create: jest.fn((dto: any) => dto),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<any>;
}

describe('KycService', () => {
  let service: KycService;
  let kycRecordsRepo: any;
  let usersRepo: any;

  beforeEach(() => {
    kycRecordsRepo = mockRepo(null);
    usersRepo = mockRepo(null);
    service = new KycService(
      kycRecordsRepo,
      usersRepo,
      mockRepo(null),
      { get: jest.fn() } as any,
      null,
    );
  });

  describe('submitKyc', () => {
    it('creates a pending KYC record', async () => {
      kycRecordsRepo.findOne.mockResolvedValue(null);
      kycRecordsRepo.save.mockImplementation(async (dto: any) => dto);

      const result = await service.submitKyc('user-1', {
        provider: 'smileid',
        payload: '{}',
      });

      expect(result.provider).toBe('smileid');
      expect(result.status).toBe(KycStatus.PENDING);
      expect(result.tier).toBe(0);
      expect(kycRecordsRepo.save).toHaveBeenCalled();
    });

    it('rejects when a pending KYC already exists', async () => {
      kycRecordsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        status: KycStatus.PENDING,
      });

      await expect(service.submitKyc('user-1', { provider: 'smileid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows resubmission when previous KYC was rejected', async () => {
      kycRecordsRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        status: KycStatus.REJECTED,
      });
      kycRecordsRepo.save.mockImplementation(async (dto: any) => dto);

      await service.submitKyc('user-1', { provider: 'smileid' });
      expect(kycRecordsRepo.save).toHaveBeenCalled();
    });
  });

  describe('verifyKyc', () => {
    it('verifies a pending KYC and sets kycTier on the user', async () => {
      const record = {
        id: 'kyc-1',
        userId: 'user-1',
        tier: 0,
        status: KycStatus.PENDING,
        verifiedAt: null,
        save: jest.fn(async (dto: any) => dto),
      };
      const user = {
        id: 'user-1',
        kycTier: 0,
        status: UserStatus.ACTIVE,
        save: jest.fn(async (dto: any) => dto),
      };
      kycRecordsRepo.findOne.mockResolvedValue(record);
      usersRepo.findOne.mockResolvedValue(user);

      const result = await service.verifyKyc('kyc-1', {
        status: KycStatus.VERIFIED,
        tier: '2',
      });

      expect(result.status).toBe(KycStatus.VERIFIED);
      expect(result.tier).toBe(2);
      expect(user.kycTier).toBe(2);
      expect(usersRepo.save).toHaveBeenCalledWith(user);
    });

    it('rejects a non-pending KYC record', async () => {
      kycRecordsRepo.findOne.mockResolvedValue({
        id: 'kyc-1',
        status: KycStatus.VERIFIED,
      });

      await expect(
        service.verifyKyc('kyc-1', { status: KycStatus.VERIFIED, tier: '1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when KYC record not found', async () => {
      kycRecordsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyKyc('missing', { status: KycStatus.VERIFIED, tier: '1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects invalid tier', async () => {
      kycRecordsRepo.findOne.mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
        status: KycStatus.PENDING,
        save: jest.fn(),
      });
      usersRepo.findOne.mockResolvedValue({ id: 'user-1', save: jest.fn() });

      await expect(
        service.verifyKyc('kyc-1', { status: KycStatus.VERIFIED, tier: '9' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('suspends user when KYC is rejected', async () => {
      const record = {
        id: 'kyc-1',
        userId: 'user-1',
        tier: 0,
        status: KycStatus.PENDING,
        verifiedAt: null,
        save: jest.fn(async (dto: any) => dto),
      };
      const user = {
        id: 'user-1',
        kycTier: 0,
        status: UserStatus.ACTIVE,
        save: jest.fn(async (dto: any) => dto),
      };
      kycRecordsRepo.findOne.mockResolvedValue(record);
      usersRepo.findOne.mockResolvedValue(user);

      await service.verifyKyc('kyc-1', {
        status: KycStatus.REJECTED,
        reason: 'Document unclear',
      });

      expect(user.status).toBe(UserStatus.SUSPENDED);
      expect(usersRepo.save).toHaveBeenCalledWith(user);
    });
  });

  describe('getUserKycStatus', () => {
    it('returns default pending status when no KYC record exists', async () => {
      const user = { id: 'user-1', kycTier: 0 };
      usersRepo.findOne.mockResolvedValue(user);
      kycRecordsRepo.findOne.mockResolvedValue(null);

      const result = await service.getUserKycStatus('user-1');

      expect(result.kycTier).toBe(0);
      expect(result.status).toBe(KycStatus.PENDING);
    });

    it('throws when user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      await expect(service.getUserKycStatus('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPendingKyc', () => {
    it('returns pending KYC records ordered by createdAt asc', async () => {
      const records = [
        { id: 'kyc-1', status: KycStatus.PENDING, createdAt: new Date('2026-01-01') },
        { id: 'kyc-2', status: KycStatus.PENDING, createdAt: new Date('2026-01-02') },
      ];
      kycRecordsRepo.find.mockResolvedValue(records);

      const result = await service.listPendingKyc();

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('kyc-1');
    });
  });
});

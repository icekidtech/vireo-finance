import { ReconciliationService } from './reconciliation.service';
import { TransferStatus, TransferType, PagaEventStatus, SettlementStatus } from '../common/enums';

function mockRepo(_entity: any) {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (dto: any) => dto),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<any>;
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let transfersRepo: any;
  let eventsRepo: any;
  let settlementsRepo: any;
  let pagaService: any;
  let transfersService: any;
  let merchantsService: any;

  beforeEach(() => {
    transfersRepo = mockRepo(null);
    eventsRepo = mockRepo(null);
    settlementsRepo = mockRepo(null);
    settlementsRepo.find.mockResolvedValue([]);
    pagaService = { getOperationStatus: jest.fn() };
    transfersService = {
      completeBankTransfer: jest.fn(),
      failBankTransfer: jest.fn(),
    };
    merchantsService = {
      expireOverdueOrders: jest.fn(async () => 0),
      completeSettlementById: jest.fn(),
      failSettlementById: jest.fn(),
    };
    service = new ReconciliationService(
      transfersRepo,
      eventsRepo,
      settlementsRepo,
      pagaService,
      transfersService,
      merchantsService,
    );
  });

  describe('run', () => {
    it('completes pending bank transfers when Paga reports completed', async () => {
      const transfer = {
        id: 'transfer-1',
        pagaReference: 'paga_transfer_1',
        status: TransferStatus.PENDING,
        type: TransferType.BANK,
      };
      transfersRepo.find.mockResolvedValue([transfer]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'completed',
        providerReference: 'paga_ref_1',
      });
      transfersService.completeBankTransfer.mockResolvedValue(transfer);
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.pendingChecked).toBe(1);
      expect(result.results.length).toBe(1);
      expect(result.results[0].providerStatus).toBe('completed');
      expect(transfersService.completeBankTransfer).toHaveBeenCalledWith(
        'transfer-1',
        'paga_ref_1',
      );
    });

    it('fails pending bank transfers when Paga reports failed', async () => {
      const transfer = {
        id: 'transfer-2',
        pagaReference: 'paga_transfer_2',
        status: TransferStatus.PENDING,
        type: TransferType.BANK,
      };
      transfersRepo.find.mockResolvedValue([transfer]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'failed',
        providerReference: 'paga_ref_2',
      });
      transfersService.failBankTransfer.mockResolvedValue(transfer);
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.pendingChecked).toBe(1);
      expect(transfersService.failBankTransfer).toHaveBeenCalledWith(
        'transfer-2',
        'Reconciliation: Paga reported failure',
      );
    });

    it('skips transfers without a pagaReference', async () => {
      const transfer = {
        id: 'transfer-3',
        pagaReference: null,
        status: TransferStatus.PENDING,
        type: TransferType.BANK,
      };
      transfersRepo.find.mockResolvedValue([transfer]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'completed',
        providerReference: 'ref',
      });
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.pendingChecked).toBe(1);
      expect(result.results.length).toBe(0);
      expect(pagaService.getOperationStatus).not.toHaveBeenCalled();
    });

    it('returns failed events count', async () => {
      transfersRepo.find.mockResolvedValue([]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'pending',
        providerReference: 'ref',
      });
      eventsRepo.count.mockResolvedValue(5);

      const result = await service.run();

      expect(result.failedEvents).toBe(5);
    });

    it('continues the sweep when one transfer lookup fails', async () => {
      const bad = {
        id: 'bad',
        pagaReference: 'ref-bad',
        status: TransferStatus.PENDING,
        type: TransferType.BANK,
      };
      const good = {
        id: 'good',
        pagaReference: 'ref-good',
        status: TransferStatus.PENDING,
        type: TransferType.BANK,
      };
      transfersRepo.find.mockResolvedValue([bad, good]);
      pagaService.getOperationStatus
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce({ status: 'completed', providerReference: 'paga_ref' });
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.results).toEqual([{ id: 'good', providerStatus: 'completed' }]);
      expect(transfersService.completeBankTransfer).toHaveBeenCalledWith('good', 'paga_ref');
    });
  });

  describe('settlement reconciliation', () => {
    it('completes an ambiguous PENDING settlement when Paga reports success', async () => {
      const settlement = {
        id: 'settle-1',
        status: SettlementStatus.PENDING,
        pagaReference: 'settlement:settle-1',
      };
      transfersRepo.find.mockResolvedValue([]);
      settlementsRepo.find.mockResolvedValueOnce([settlement]).mockResolvedValueOnce([]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'completed',
        providerReference: 'paga_ref',
      });
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.settlementsChecked).toBe(1);
      expect(result.settlementResults).toEqual([{ id: 'settle-1', providerStatus: 'completed' }]);
      expect(merchantsService.completeSettlementById).toHaveBeenCalledWith('settle-1', 'paga_ref');
    });

    it('fails a PROCESSING settlement when Paga reports failure', async () => {
      const settlement = {
        id: 'settle-2',
        status: SettlementStatus.PROCESSING,
        pagaReference: 'settlement:settle-2',
      };
      transfersRepo.find.mockResolvedValue([]);
      settlementsRepo.find.mockResolvedValueOnce([settlement]).mockResolvedValueOnce([]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'failed',
        providerReference: 'paga_ref',
      });
      eventsRepo.count.mockResolvedValue(0);

      await service.run();

      expect(merchantsService.failSettlementById).toHaveBeenCalledWith(
        'settle-2',
        'Reconciliation: Paga reported failure',
      );
    });

    it('leaves a settlement untouched while Paga still reports pending', async () => {
      const settlement = {
        id: 'settle-3',
        status: SettlementStatus.PROCESSING,
        pagaReference: 'settlement:settle-3',
      };
      transfersRepo.find.mockResolvedValue([]);
      settlementsRepo.find.mockResolvedValueOnce([settlement]).mockResolvedValueOnce([]);
      pagaService.getOperationStatus.mockResolvedValue({
        status: 'pending',
        providerReference: 'settlement:settle-3',
      });
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.settlementResults).toEqual([{ id: 'settle-3', providerStatus: 'pending' }]);
      expect(merchantsService.completeSettlementById).not.toHaveBeenCalled();
      expect(merchantsService.failSettlementById).not.toHaveBeenCalled();
    });

    it('expires stale drafts to release their holds', async () => {
      const draft = { id: 'settle-old', status: SettlementStatus.DRAFT, pagaReference: null };
      transfersRepo.find.mockResolvedValue([]);
      settlementsRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([draft]);
      eventsRepo.count.mockResolvedValue(0);

      const result = await service.run();

      expect(result.expiredDrafts).toBe(1);
      expect(merchantsService.failSettlementById).toHaveBeenCalledWith(
        'settle-old',
        'Settlement draft expired',
      );
    });

    it('expires overdue orders on every run', async () => {
      transfersRepo.find.mockResolvedValue([]);
      eventsRepo.count.mockResolvedValue(0);
      merchantsService.expireOverdueOrders.mockResolvedValue(3);

      const result = await service.run();

      expect(result.expiredOrders).toBe(3);
      expect(merchantsService.expireOverdueOrders).toHaveBeenCalled();
    });
  });
});

describe('PagaEventStatus enum', () => {
  it('has expected statuses', () => {
    expect(PagaEventStatus.RECEIVED).toBe('received');
    expect(PagaEventStatus.PROCESSED).toBe('processed');
    expect(PagaEventStatus.FAILED).toBe('failed');
    expect(PagaEventStatus.IGNORED).toBe('ignored');
  });
});

describe('TransferStatus enum', () => {
  it('has expected statuses', () => {
    expect(TransferStatus.PENDING).toBe('pending');
    expect(TransferStatus.COMPLETED).toBe('completed');
    expect(TransferStatus.FAILED).toBe('failed');
    expect(TransferStatus.DRAFT).toBe('draft');
  });
});

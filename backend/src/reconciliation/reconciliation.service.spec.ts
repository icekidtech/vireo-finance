import { ReconciliationService } from './reconciliation.service';
import { TransferStatus, TransferType, PagaEventStatus } from '../common/enums';

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
  let pagaService: any;
  let transfersService: any;

  beforeEach(() => {
    transfersRepo = mockRepo(null);
    eventsRepo = mockRepo(null);
    pagaService = { getOperationStatus: jest.fn() };
    transfersService = {
      completeBankTransfer: jest.fn(),
      failBankTransfer: jest.fn(),
    };
    service = new ReconciliationService(transfersRepo, eventsRepo, pagaService, transfersService);
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

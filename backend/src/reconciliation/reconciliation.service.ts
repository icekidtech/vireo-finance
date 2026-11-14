import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PagaEventStatus, TransferStatus, TransferType } from '../common/enums';
import { PagaService } from '../paga/paga.service';
import { TransfersService } from '../transfers/transfers.service';
import { Transfer } from '../transfers/transfer.entity';
import { PagaEvent } from '../webhooks/paga-event.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Transfer) private readonly transfers: Repository<Transfer>,
    @InjectRepository(PagaEvent) private readonly events: Repository<PagaEvent>,
    private readonly paga: PagaService,
    private readonly transfersService: TransfersService,
  ) {}

  async run() {
    const pending = await this.transfers.find({
      where: { status: TransferStatus.PENDING, type: TransferType.BANK },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    const results: Array<{ id: string; providerStatus: string }> = [];
    for (const transfer of pending) {
      if (!transfer.pagaReference) continue;
      const providerStatus = await this.paga.getOperationStatus(transfer.pagaReference);
      if (providerStatus.status === 'completed') {
        await this.transfersService.completeBankTransfer(
          transfer.id,
          providerStatus.providerReference,
        );
      } else if (providerStatus.status === 'failed') {
        await this.transfersService.failBankTransfer(
          transfer.id,
          'Reconciliation: Paga reported failure',
        );
      }
      results.push({ id: transfer.id, providerStatus: providerStatus.status });
    }

    const failedEvents = await this.events.count({
      where: { status: PagaEventStatus.FAILED },
    });

    return { pendingChecked: pending.length, results, failedEvents };
  }
}

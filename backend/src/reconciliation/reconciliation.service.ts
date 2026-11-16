import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  PagaEventStatus,
  SettlementStatus,
  TransferStatus,
  TransferType,
} from '../common/enums';
import { MerchantService } from '../merchant/merchant.service';
import { Settlement } from '../merchant/settlement.entity';
import { PagaService } from '../paga/paga.service';
import { TransfersService } from '../transfers/transfers.service';
import { Transfer } from '../transfers/transfer.entity';
import { PagaEvent } from '../webhooks/paga-event.entity';

const STALE_DRAFT_MS = 15 * 60 * 1000;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Transfer) private readonly transfers: Repository<Transfer>,
    @InjectRepository(PagaEvent) private readonly events: Repository<PagaEvent>,
    @InjectRepository(Settlement) private readonly settlements: Repository<Settlement>,
    private readonly paga: PagaService,
    private readonly transfersService: TransfersService,
    private readonly merchantsService: MerchantService,
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
      try {
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
      } catch (error) {
        this.logger.error(
          `Reconciliation failed for transfer=${transfer.id}: ${String(error)}`,
        );
      }
    }

    // Clean up open orders whose TTL elapsed without a payment.
    const expiredOrders = await this.merchantsService.expireOverdueOrders();

    // Resolve settlements whose Paga outcome was ambiguous or still processing.
    const openSettlements = await this.settlements.find({
      where: { status: In([SettlementStatus.PENDING, SettlementStatus.PROCESSING]) },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    const settlementResults: Array<{ id: string; providerStatus: string }> = [];
    for (const settlement of openSettlements) {
      if (!settlement.pagaReference) continue;
      try {
        const providerStatus = await this.paga.getOperationStatus(settlement.pagaReference);
        if (providerStatus.status === 'completed') {
          await this.merchantsService.completeSettlementById(
            settlement.id,
            providerStatus.providerReference,
          );
        } else if (providerStatus.status === 'failed') {
          await this.merchantsService.failSettlementById(
            settlement.id,
            'Reconciliation: Paga reported failure',
          );
        }
        settlementResults.push({ id: settlement.id, providerStatus: providerStatus.status });
      } catch (error) {
        this.logger.error(
          `Reconciliation failed for settlement=${settlement.id}: ${String(error)}`,
        );
      }
    }

    // Release funds held by drafts that were never submitted.
    const staleDrafts = await this.settlements.find({
      where: {
        status: SettlementStatus.DRAFT,
        createdAt: LessThan(new Date(Date.now() - STALE_DRAFT_MS)),
      },
      take: 100,
    });
    let expiredDrafts = 0;
    for (const draft of staleDrafts) {
      try {
        await this.merchantsService.failSettlementById(draft.id, 'Settlement draft expired');
        expiredDrafts += 1;
      } catch (error) {
        this.logger.error(`Failed to expire settlement draft=${draft.id}: ${String(error)}`);
      }
    }

    const failedEvents = await this.events.count({
      where: { status: PagaEventStatus.FAILED },
    });

    return {
      pendingChecked: pending.length,
      results,
      failedEvents,
      expiredOrders,
      settlementsChecked: openSettlements.length,
      settlementResults,
      expiredDrafts,
    };
  }
}
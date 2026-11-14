import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RECONCILIATION_QUEUE } from '../queues/queues.constants';
import { ReconciliationService } from './reconciliation.service';

@Processor(RECONCILIATION_QUEUE)
export class ReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(private readonly reconciliation: ReconciliationService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Running reconciliation job ${job.id}`);
    return this.reconciliation.run();
  }
}

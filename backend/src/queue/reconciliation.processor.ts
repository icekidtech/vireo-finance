import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { WorkerHost } from '@nestjs/bullmq';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

@Injectable()
@Processor('reconciliation')
export class ReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    @InjectQueue('reconciliation') private readonly queue: Queue,
    private readonly reconciliation: ReconciliationService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'run',
      {},
      {
        repeat: {
          every: 5 * 60 * 1000,
        },
        jobId: 'reconciliation:periodic',
      },
    );
    this.logger.log('Reconciliation queue initialized (runs every 5 minutes)');
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Running reconciliation job ${job.id}`);
    const result = await this.reconciliation.run();
    this.logger.log(
      `Reconciliation complete: checked ${result.pendingChecked} pending transfers, ${result.results.length} updated`,
    );
    return result;
  }
}

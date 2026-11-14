import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WEBHOOK_QUEUE } from '../queues/queues.constants';
import { WebhooksService } from './webhooks.service';

export interface WebhookJobData {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  body: Record<string, unknown>;
}

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly webhooks: WebhooksService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<unknown> {
    this.logger.log(`Processing webhook job ${job.id} type=${job.name}`);
    return this.webhooks.handle(job.data.headers, job.data.rawBody, job.data.body);
  }
}

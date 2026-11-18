import { Controller, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Request } from 'express';
import { WEBHOOK_QUEUE } from '../queues/queues.constants';

@Controller('webhooks')
export class WebhooksController {
  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue) {}

  @Post('paga')
  @HttpCode(200)
  async paga(@Req() request: RawBodyRequest<Request>) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key] = value;
    }
    const job = await this.webhookQueue.add('paga', {
      headers,
      rawBody,
      body: (request.body ?? {}) as Record<string, unknown>,
    });
    return { status: 'queued', jobId: job.id };
  }
}

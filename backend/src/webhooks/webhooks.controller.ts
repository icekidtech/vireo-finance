import { Controller, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('paga')
  @HttpCode(200)
  paga(@Req() request: RawBodyRequest<Request>) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    return this.webhooks.handle(
      request.headers,
      rawBody,
      (request.body ?? {}) as Record<string, unknown>,
    );
  }
}

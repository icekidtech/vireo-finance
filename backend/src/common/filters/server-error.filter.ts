import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/** Statuses whose message describes our/our vendors' internals, not the caller's mistake. */
const MASKED: Record<number, string> = {
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Something went wrong on our side. Please try again.',
  [HttpStatus.BAD_GATEWAY]:
    'This service is temporarily unavailable. Please try again in a few minutes.',
  [HttpStatus.GATEWAY_TIMEOUT]:
    'This is taking longer than expected. Please try again in a few minutes.',
};

/**
 * Callers never see vendor or internal error text (Paga bodies, stack-derived
 * messages). The real detail is logged here; 4xx and deliberate 503 messages
 * (e.g. "biometrics not configured") pass through unchanged.
 */
@Catch()
export class ServerErrorFilter extends BaseExceptionFilter {
  private readonly log = new Logger('ServerError');

  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const masked = MASKED[status];
    if (!masked) {
      return super.catch(exception, host);
    }

    const req = host.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
    const detail = exception instanceof Error ? exception.message : String(exception);
    this.log.error(
      `${req.method} ${req.originalUrl} -> ${status}: ${detail}`,
      exception instanceof Error && !(exception instanceof HttpException)
        ? exception.stack
        : undefined,
    );

    host
      .switchToHttp()
      .getResponse<{ status: (c: number) => { json: (b: unknown) => void } }>()
      .status(status)
      .json({ statusCode: status, message: masked, error: HttpStatus[status] });
  }
}

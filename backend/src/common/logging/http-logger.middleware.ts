import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { redactForLog, redactUrl } from './redact';

export interface HttpLoggerOptions {
  /** Also log (redacted) request bodies. Off by default; they can contain personal data. */
  logBodies?: boolean;
}

const logger = new Logger('HTTP');

/**
 * One log line per request: method, path, status, duration, caller and, for
 * failures, the error message the API returned. Runs before guards, so it also
 * records 401/403 rejections. Authorization headers and request bodies are not
 * logged unless bodies are explicitly enabled, and then they are redacted.
 */
export function httpLogger(options: HttpLoggerOptions = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    let failureMessage: string | undefined;

    // Capture the error text Nest sends so a 4xx/5xx line says WHY.
    const originalSend = res.send.bind(res);
    res.send = ((body?: unknown) => {
      if (res.statusCode >= 400 && body !== undefined) {
        try {
          const parsed = typeof body === 'string' ? JSON.parse(body) : body;
          const message = (parsed as { message?: unknown })?.message;
          failureMessage = Array.isArray(message) ? message.join('; ') : String(message ?? '');
        } catch {
          failureMessage = undefined;
        }
      }
      return originalSend(body as never);
    }) as Response['send'];

    // A request the client gives up on (a timeout, a closed tab) never reaches 'finish', so it
    // used to leave no log line at all, which made a slow upload look like "nothing happened".
    let finished = false;
    res.on('close', () => {
      if (finished) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const user = (req as Request & { user?: { userId?: string } }).user?.userId;
      logger.warn(
        `${req.method} ${redactUrl(req.originalUrl)} -> ABORTED client closed the connection before the reply, after ${ms.toFixed(0)}ms ${user ? `user=${user}` : 'user=anon'} ip=${req.ip}`,
      );
    });

    res.on('finish', () => {
      finished = true;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const user = (req as Request & { user?: { userId?: string } }).user?.userId;
      const parts = [
        `${req.method} ${redactUrl(req.originalUrl)} -> ${res.statusCode}`,
        `${ms.toFixed(0)}ms`,
        user ? `user=${user}` : 'user=anon',
        `ip=${req.ip}`,
      ];
      // Big uploads (photos) are what makes a request slow on a weak connection: show the size.
      const bytes = Number(req.headers?.['content-length']);
      if (Number.isFinite(bytes) && bytes >= 20_000)
        parts.push(`size=${Math.round(bytes / 1024)}KB`);
      if (failureMessage) parts.push(`error="${failureMessage.slice(0, 300)}"`);
      if (options.logBodies && req.body && Object.keys(req.body).length > 0) {
        parts.push(`body=${JSON.stringify(redactForLog(req.body))}`);
      }
      const line = parts.join(' ');
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.log(line);
    });

    next();
  };
}

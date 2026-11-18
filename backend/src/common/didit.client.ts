import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface DiditClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Thin HTTP client for Didit's standalone APIs. Logs status and timing only
 * (requests carry identity numbers and images), never request or response bodies.
 * Vendor failures surface as a generic "not available" error; a 400 is the
 * caller's data being unusable.
 */
export class DiditClient {
  private readonly logger = new Logger('Didit');

  constructor(private readonly cfg: DiditClientConfig) {}

  postForm<T = unknown>(path: string, body: FormData): Promise<T> {
    return this.request<T>(path, body);
  }

  postJson<T = unknown>(path: string, payload: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, JSON.stringify(payload), { 'Content-Type': 'application/json' });
  }

  private async request<T>(
    path: string,
    body: BodyInit,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.cfg.baseUrl}/${path}/`, {
        method: 'POST',
        headers: { 'x-api-key': this.cfg.apiKey, ...headers },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (error) {
      this.logger.error(`${path} network error after ${Date.now() - started}ms: ${String(error)}`);
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    this.logger.log(`${path} -> ${response.status} ${Date.now() - started}ms`);
    if (!response.ok) {
      const reason = await response
        .json()
        .then((b: { detail?: unknown }) => String(b?.detail ?? '').slice(0, 200))
        .catch(() => '');
      this.logger.error(`${path} failed: ${response.status} ${reason}`.trim());
      if (response.status === 400) {
        throw new BadRequestException(
          'We could not read that. Check the details or image and try again.',
        );
      }
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    return (await response.json()) as T;
  }
}

/** A Blob for FormData from raw bytes. */
export function imageBlob(bytes: Buffer, type = 'image/jpeg'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

import { createHash } from 'crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ObjectStorage, StoredObject } from './object-storage';

export interface B2Config {
  keyId: string;
  applicationKey: string;
  bucketId: string;
  bucketName: string;
  timeoutMs: number;
}

interface Auth {
  token: string;
  apiUrl: string;
  downloadUrl: string;
  at: number;
}

const API = 'b2api/v4';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000; // tokens last up to 24h; refresh well before

/**
 * Backblaze B2 through its native API. The bucket must be private; the
 * application key should be restricted to that one bucket.
 */
export class B2Storage implements ObjectStorage {
  private readonly logger = new Logger(B2Storage.name);
  private auth: Auth | null = null;

  constructor(private readonly cfg: B2Config) {}

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const sha1 = createHash('sha1').update(data).digest('hex'); // B2 integrity check, not a security use
    for (let attempt = 0; attempt < 2; attempt++) {
      const auth = await this.authorize(attempt > 0);
      const slot = await this.json<{ uploadUrl: string; authorizationToken: string }>(
        `${auth.apiUrl}/${API}/b2_get_upload_url`,
        {
          method: 'POST',
          headers: { Authorization: auth.token },
          body: JSON.stringify({ bucketId: this.cfg.bucketId }),
        },
        'get_upload_url',
      );
      const res = await this.fetchWithTimeout(slot.uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: slot.authorizationToken,
          'X-Bz-File-Name': encodeKey(key),
          'Content-Type': contentType,
          'Content-Length': String(data.length),
          'X-Bz-Content-Sha1': sha1,
        },
        body: new Uint8Array(data),
      });
      if (res.ok) {
        const out = (await res.json()) as { fileId?: string };
        if (!out.fileId) throw this.unavailable('upload returned no file id');
        return { fileId: out.fileId };
      }
      this.logger.warn(`B2 upload -> ${res.status}`);
      if (res.status !== 401 && res.status !== 503) throw this.unavailable(`upload ${res.status}`);
      // Expired token or a busy pod: retry once with a fresh authorization and upload URL.
    }
    throw this.unavailable('upload failed after retry');
  }

  async get(key: string): Promise<Buffer> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const auth = await this.authorize(attempt > 0);
      const res = await this.fetchWithTimeout(
        `${auth.downloadUrl}/file/${this.cfg.bucketName}/${encodeKey(key)}`,
        { headers: { Authorization: auth.token } },
      );
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status !== 401) throw this.unavailable(`download ${res.status}`);
    }
    throw this.unavailable('download failed after retry');
  }

  async delete(key: string, fileId: string): Promise<void> {
    const auth = await this.authorize();
    const res = await this.fetchWithTimeout(`${auth.apiUrl}/${API}/b2_delete_file_version`, {
      method: 'POST',
      headers: { Authorization: auth.token },
      body: JSON.stringify({ fileName: key, fileId }),
    });
    // 400 "file_not_present" means it is already gone, which is the goal.
    if (!res.ok && res.status !== 400) throw this.unavailable(`delete ${res.status}`);
  }

  private async authorize(force = false): Promise<Auth> {
    if (!force && this.auth && Date.now() - this.auth.at < AUTH_TTL_MS) return this.auth;
    const basic = Buffer.from(`${this.cfg.keyId}:${this.cfg.applicationKey}`).toString('base64');
    const res = await this.json<{
      authorizationToken: string;
      apiInfo: { storageApi: { apiUrl: string; downloadUrl: string } };
    }>(
      `https://api.backblazeb2.com/${API}/b2_authorize_account`,
      { headers: { Authorization: `Basic ${basic}` } },
      'authorize_account',
    );
    this.auth = {
      token: res.authorizationToken,
      apiUrl: res.apiInfo.storageApi.apiUrl,
      downloadUrl: res.apiInfo.storageApi.downloadUrl,
      at: Date.now(),
    };
    return this.auth;
  }

  private async json<T>(url: string, init: RequestInit, label: string): Promise<T> {
    const res = await this.fetchWithTimeout(url, init);
    if (!res.ok) throw this.unavailable(`${label} ${res.status}`);
    return (await res.json()) as T;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    } catch (error) {
      throw this.unavailable(`network error: ${String(error)}`);
    }
  }

  /** Detail goes to the logs only; callers see a generic "not available". */
  private unavailable(detail: string): ServiceUnavailableException {
    this.logger.error(`Backblaze B2 ${detail}`);
    return new ServiceUnavailableException('Document storage is not available right now');
  }
}

/** Percent-encode each path segment, keeping the `/` separators. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

export interface GooglePlayIntegrityResult {
  verified: boolean;
  verdict?: string;
  error?: string;
}

@Injectable()
export class GooglePlayIntegrityService {
  private readonly logger = new Logger(GooglePlayIntegrityService.name);
  private readonly apiKey: string;
  private readonly packageName: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('googlePlay.integrityApiKey') ?? '';
    this.packageName = 'com.vireofinance.app';
  }

  async verify(integrityToken: string, requestHash?: string): Promise<GooglePlayIntegrityResult> {
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_PLAY_INTEGRITY_API_KEY not configured — skipping verification');
      return { verified: false, error: 'Google Play Integrity API key not configured' };
    }

    try {
      const result = await this.decodeIntegrityToken(integrityToken);

      const appIntegrity = result['appIntegrity'] as Record<string, unknown> | undefined;
      const verdict = appIntegrity?.['appRecognitionVerdict'] as string | undefined;

      if (verdict !== 'PLAY_RECOGNIZED') {
        this.logger.warn(`Play Integrity: app not recognized, verdict=${verdict}`);
        return { verified: false, verdict, error: `App not recognized: ${verdict}` };
      }

      // Optionally verify request hash
      if (requestHash) {
        const reqDetails = result['requestDetails'] as Record<string, unknown> | undefined;
        const receivedHash = reqDetails?.['requestHash'] as string | undefined;
        if (receivedHash && receivedHash !== requestHash) {
          return { verified: false, error: 'Request hash mismatch' };
        }
      }

      this.logger.log(`Google Play Integrity verified, verdict=${verdict}`);
      return { verified: true, verdict };
    } catch (error) {
      this.logger.error(`Google Play Integrity error: ${String(error)}`);
      return { verified: false, error: String(error) };
    }
  }

  private decodeIntegrityToken(token: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const encodedPackage = encodeURIComponent(this.packageName);
      const url = `https://playintegrity.googleapis.com/v1/${encodedPackage}:decodeIntegrityToken?key=${this.apiKey}`;
      const body = JSON.stringify({ integrity_token: token });

      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Play Integrity API ${res.statusCode}: ${data}`));
              } else {
                resolve(parsed);
              }
            } catch {
              reject(new Error(`Failed to parse Play Integrity response: ${data}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

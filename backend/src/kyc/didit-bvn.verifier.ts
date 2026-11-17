import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { BvnCheckInput, BvnVerifier } from './bvn-verifier';

export interface DiditBvnConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

interface DatabaseValidationResponse {
  status?: string;
  match_type?: string;
  validations?: { outcome_code?: string; service_id?: string }[];
}

/**
 * BVN check through Didit's database-validation API (Nigerian banking
 * database). Only the verdict is used: the record's own data (names, birth
 * date) that Didit echoes back is never stored or returned to the client.
 */
export class DiditBvnVerifier implements BvnVerifier {
  readonly name = 'didit';
  private readonly logger = new Logger(DiditBvnVerifier.name);

  constructor(private readonly cfg: DiditBvnConfig) {}

  async verify(input: BvnCheckInput): Promise<boolean> {
    const body = new FormData();
    body.append('issuing_state', 'NGA');
    body.append('services', 'nga_bank_verification_number');
    body.append('first_name', input.firstName);
    body.append('last_name', input.lastName);
    body.append('bvn', input.bvn);
    body.append('date_of_birth', input.dateOfBirth);

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.cfg.baseUrl}/database-validation/`, {
        method: 'POST',
        headers: { 'x-api-key': this.cfg.apiKey },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `Didit BVN check network error after ${Date.now() - started}ms: ${String(error)}`,
      );
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    // Status and timing only: the request carries a BVN.
    this.logger.log(`Didit BVN check -> ${response.status} ${Date.now() - started}ms`);

    if (!response.ok) {
      const reason = await response
        .json()
        .then((b: { detail?: unknown }) => String(b?.detail ?? '').slice(0, 200))
        .catch(() => '');
      this.logger.error(`Didit BVN check failed: ${response.status} ${reason}`.trim());
      // A 4xx about the BVN itself (unknown / malformed) is a non-match, not an outage.
      if (response.status === 400 || response.status === 404 || response.status === 422) {
        return false;
      }
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }

    const result = (await response.json()) as DatabaseValidationResponse;
    const outcomes = (result.validations ?? []).filter(
      (v) => v.service_id === 'nga_bank_verification_number',
    );
    return (
      result.status === 'Approved' &&
      result.match_type === 'full_match' &&
      outcomes.length > 0 &&
      outcomes.every((v) => v.outcome_code === 'MATCH')
    );
  }
}

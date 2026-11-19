import { ServiceUnavailableException } from '@nestjs/common';
import { DiditClient, DiditClientConfig, imageBlob } from '../common/didit.client';
import { CompanyCandidate, IdDocumentResult, IdentityVerifier } from './identity-verifier';

interface DatabaseValidationResponse {
  database_validation?: { validations?: unknown; services_used?: unknown };
}
interface LivenessResponse {
  liveness?: { status?: string; warnings?: { risk?: string }[] };
}
interface FaceMatchResponse {
  face_match?: { score?: number | null };
}
interface IdVerificationResponse {
  id_verification?: {
    status?: string;
    first_name?: string | null;
    last_name?: string | null;
    date_of_birth?: string | null;
    portrait_image?: string | null;
  };
}
interface PoaResponse {
  poa?: { status?: string };
}
interface KybSearchResponse {
  kyb_registry?: {
    companies?: { name?: string; registration_number?: string; status?: string }[];
  };
}

/**
 * Didit adapter for every KYC check. Biometric and identity-number checks use
 * Didit's standalone APIs; images are sent for the check only (no copy kept by
 * Didit, except for database validation, which Didit records as a session so
 * the per-service outcome is returned).
 */
export class DiditIdentityVerifier implements IdentityVerifier {
  readonly name = 'didit';
  private readonly client: DiditClient;

  constructor(cfg: DiditClientConfig) {
    this.client = new DiditClient(cfg);
  }

  async isLive(selfie: Buffer): Promise<boolean> {
    const body = new FormData();
    body.append('user_image', imageBlob(selfie), 'selfie.jpg');
    body.append('save_api_request', 'false');
    const res = await this.client.postForm<LivenessResponse>('passive-liveness', body);
    const l = res.liveness;
    if (!l || typeof l.status !== 'string') {
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    const risks = (l.warnings ?? []).map((w) => w.risk ?? '');
    return (
      l.status === 'Approved' &&
      !risks.includes('LIVENESS_FACE_ATTACK') &&
      !risks.includes('MULTIPLE_FACES_DETECTED')
    );
  }

  async verifyBvn(input: {
    bvn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    selfie: Buffer;
    userId?: string; // NEW: Pass user ID to Didit for 1:N face search
  }): Promise<boolean> {
    const body = new FormData();
    body.append('issuing_state', 'NGA');
    body.append('services', 'nga_bank_verification_number');
    body.append('bvn', input.bvn);
    body.append('first_name', input.firstName);
    body.append('last_name', input.lastName);
    body.append('date_of_birth', input.dateOfBirth);
    body.append('selfie', imageBlob(input.selfie), 'selfie.jpg');

    // Store user ID for deviceless payments (1:N face search)
    if (input.userId) {
      body.append('vendor_data', input.userId);
      body.append('vendor_user_id', input.userId);
    }

    return this.matched(
      await this.client.postForm<DatabaseValidationResponse>('database-validation', body),
      'nga_bank_verification_number',
      ['identification_number', 'full_name', 'date_of_birth'],
    );
  }

  async verifyNin(input: {
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<boolean> {
    const body = new FormData();
    body.append('issuing_state', 'NGA');
    body.append('services', 'nga_national_id');
    body.append('national_id', input.nin);
    body.append('first_name', input.firstName);
    body.append('last_name', input.lastName);
    body.append('date_of_birth', input.dateOfBirth);
    return this.matched(
      await this.client.postForm<DatabaseValidationResponse>('database-validation', body),
      'nga_national_id',
      ['identification_number', 'full_name', 'date_of_birth'],
    );
  }

  /**
   * A pass needs EVERY compared field to be a full match. Didit's overall
   * `match_type` is "full_match" as soon as any one field matches, so it is not
   * used on its own. Didit answers with per-field results (an object such as
   * { identification_number, full_name, date_of_birth }) or, in the catalogue
   * form, a list of per-service outcome codes; both are handled.
   */
  private matched(
    res: DatabaseValidationResponse,
    serviceId: string,
    requiredFields: string[],
  ): boolean {
    const validation = res.database_validation;
    const validations = validation?.validations;
    if (!validation || validations === undefined || validations === null) {
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }

    if (Array.isArray(validations)) {
      const result = (validations as { service_id?: string; outcome_code?: string }[]).find(
        (v) => v.service_id === serviceId,
      );
      return result?.outcome_code === 'MATCH';
    }

    const fields = validations as Record<string, unknown>;
    const usedService = validation.services_used;
    if (Array.isArray(usedService) && !usedService.includes(serviceId)) return false;
    return requiredFields.every((f) => fields[f] === 'full_match');
  }

  async readIdDocument(front: Buffer, back?: Buffer): Promise<IdDocumentResult> {
    const body = new FormData();
    body.append('front_image', imageBlob(front), 'front.jpg');
    if (back) body.append('back_image', imageBlob(back), 'back.jpg');
    body.append('save_api_request', 'false');
    const res = await this.client.postForm<IdVerificationResponse>('id-verification', body);
    const d = res.id_verification;
    if (!d)
      throw new ServiceUnavailableException('Identity verification is not available right now');
    return {
      approved: d.status === 'Approved',
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      dateOfBirth: d.date_of_birth ?? '',
      portrait: decodeInlineImage(d.portrait_image),
    };
  }

  async faceMatchScore(a: Buffer, b: Buffer): Promise<number> {
    const body = new FormData();
    body.append('user_image', imageBlob(a), 'live.jpg');
    body.append('ref_image', imageBlob(b), 'ref.jpg');
    // Raw score only: our own threshold decides.
    body.append('face_match_score_decline_threshold', '0');
    body.append('save_api_request', 'false');
    const res = await this.client.postForm<FaceMatchResponse>('face-match', body);
    const score = res.face_match?.score;
    return typeof score === 'number' ? Math.max(0, Math.min(100, score)) : 0;
  }

  async verifyProofOfAddress(input: {
    document: Buffer;
    mime: string;
    address: string;
    firstName: string;
    lastName: string;
  }): Promise<boolean> {
    const body = new FormData();
    body.append('document', imageBlob(input.document, input.mime), 'proof');
    body.append('expected_address', input.address);
    body.append('expected_country', 'NGA');
    body.append('expected_first_name', input.firstName);
    body.append('expected_last_name', input.lastName);
    body.append('save_api_request', 'false');
    const res = await this.client.postForm<PoaResponse>('poa', body);
    if (!res.poa || typeof res.poa.status !== 'string') {
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    return res.poa.status === 'Approved';
  }

  async searchCompany(registrationNumber: string): Promise<CompanyCandidate[]> {
    const res = await this.client.postJson<KybSearchResponse>('kyb/search', {
      country_code: 'NG',
      registration_number: registrationNumber,
    });
    return (res.kyb_registry?.companies ?? []).map((c) => ({
      name: c.name ?? '',
      registrationNumber: c.registration_number ?? '',
      status: (c.status ?? '').toLowerCase(),
    }));
  }
}

/** Inline base64 (optionally a data URL). A media URL is not fetched: that would send a request outside our control. */
function decodeInlineImage(value: string | null | undefined): Buffer | null {
  if (!value || /^https?:/i.test(value)) return null;
  const raw = value.replace(/^data:image\/[a-z+]+;base64,/i, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const bytes = Buffer.from(raw, 'base64');
  return bytes.length > 0 ? bytes : null;
}

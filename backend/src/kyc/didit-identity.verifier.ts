import { ServiceUnavailableException } from '@nestjs/common';
import { DiditClient, DiditClientConfig, imageBlob } from '../common/didit.client';
import { CompanyCandidate, IdDocumentResult, IdentityVerifier } from './identity-verifier';

interface DatabaseValidationResponse {
  database_validation?: { validations?: unknown };
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
    
    // DEBUG: Log liveness response
    console.log('=== DIDIT LIVENESS RESPONSE ===');
    console.log('Full response:', JSON.stringify(res, null, 2));
    console.log('================================');
    
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
  }): Promise<boolean> {
    const body = new FormData();
    body.append('issuing_state', 'NGA');
    body.append('services', 'nga_bank_verification_number');
    body.append('bvn', input.bvn);
    body.append('first_name', input.firstName);
    body.append('last_name', input.lastName);
    body.append('date_of_birth', input.dateOfBirth);
    body.append('selfie', imageBlob(input.selfie), 'selfie.jpg');
    return this.matched(
      await this.client.postForm<DatabaseValidationResponse>('database-validation', body),
      'nga_bank_verification_number',
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
    );
  }

  /** A pass needs this service to answer MATCH (an identity, name and date of birth match). */
  private matched(res: DatabaseValidationResponse, serviceId: string): boolean {
    // DEBUG: Log the full response to understand what Didit is returning
    console.log('=== DIDIT DATABASE VALIDATION RESPONSE ===');
    console.log('Full response:', JSON.stringify(res, null, 2));
    console.log('Service ID looking for:', serviceId);
    
    // NEW API FORMAT: Check if validations is an object (new format)
    const validation = res.database_validation;
    if (!validation) {
      console.log('ERROR: database_validation is missing');
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    
    // Check if the requested service was used
    const servicesUsed = (validation as any).services_used;
    if (Array.isArray(servicesUsed) && servicesUsed.includes(serviceId)) {
      const matchType = (validation as any).match_type;
      console.log('Match type:', matchType);
      console.log('Match result:', matchType === 'full_match');
      console.log('==========================================');
      return matchType === 'full_match';
    }
    
    // OLD API FORMAT: Fall back to array-based validation
    const validations = validation.validations;
    console.log('Validations:', JSON.stringify(validations, null, 2));
    
    if (!Array.isArray(validations)) {
      console.log('ERROR: validations is not an array (trying new format above)');
      throw new ServiceUnavailableException('Identity verification is not available right now');
    }
    
    const result = (validations as { service_id?: string; outcome_code?: string }[]).find(
      (v) => v.service_id === serviceId,
    );
    
    console.log('Found result:', JSON.stringify(result, null, 2));
    console.log('Outcome code:', result?.outcome_code);
    console.log('Match result:', result?.outcome_code === 'MATCH');
    console.log('==========================================');
    
    return result?.outcome_code === 'MATCH';
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

import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BiometricType } from './biometric-enrollment.entity';
import {
  BiometricProvider,
  ProviderEnrollment,
  ProviderVerification,
  FaceSearchResult,
} from './biometric-provider';

export interface DiditConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEMPLATES = 5;

interface LivenessResponse {
  liveness?: {
    status?: string;
    score?: number | null;
    face_quality?: number | null;
    warnings?: { risk?: string; tag?: string }[];
  };
}

interface FaceMatchResponse {
  face_match?: { status?: string; score?: number | null };
}

/**
 * Face adapter for Didit's standalone APIs (passive liveness + 1:1 face match).
 *
 * - Every call sets save_api_request=false, so Didit keeps no copy of the
 *   customer's images. The only stored copy is ours, AES-GCM encrypted.
 * - The "template" is the enrolled selfie (Didit's face match has no stored
 *   template); it is only ever decrypted in memory to be sent for matching.
 * - Any vendor failure throws; nothing here can return passing scores on error.
 */

interface FaceSearchResponse {
  face_search?: {
    status?: string;
    total_matches?: number;
    matches?: Array<{
      session_id?: string;
      vendor_user_id?: string;
      vendor_data?: string;
      similarity_percentage?: number;
      user_details?: {
        full_name?: string;
        document_type?: string;
        document_number?: string;
      };
    }>;
  };
}

export class DiditProvider implements BiometricProvider {
  readonly name = 'didit';
  private readonly logger = new Logger(DiditProvider.name);

  constructor(private readonly cfg: DiditConfig) {}

  async enroll(type: BiometricType, sampleBase64: string): Promise<ProviderEnrollment> {
    this.assertFace(type);
    const image = this.decode(sampleBase64);
    const liveness = await this.checkLiveness(image);
    if (liveness.declined) {
      throw new BadRequestException(
        'We could not confirm a live face. Face the camera in good light and try again.',
      );
    }
    return { template: image.toString('base64'), qualityScore: liveness.quality };
  }

  async verify(
    type: BiometricType,
    sampleBase64: string,
    templates: string[],
  ): Promise<ProviderVerification> {
    this.assertFace(type);
    const image = this.decode(sampleBase64);
    const liveness = await this.checkLiveness(image);

    // Skip matching entirely when the sample is not a live, single face.
    if (liveness.attack || liveness.multipleFaces || liveness.declined) {
      return {
        matchScore: 0,
        livenessScore: liveness.score,
        spoofScore: liveness.attack ? 100 : 100 - liveness.score,
        qualityScore: liveness.multipleFaces ? 0 : liveness.quality,
      };
    }

    let best = 0;
    let bestIndex: number | undefined;
    const candidates = templates.slice(0, MAX_TEMPLATES);
    for (let i = 0; i < candidates.length; i++) {
      const score = await this.matchFaces(image, Buffer.from(candidates[i], 'base64'));
      if (score > best) {
        best = score;
        bestIndex = i;
      }
    }

    return {
      matchScore: best,
      livenessScore: liveness.score,
      spoofScore: 100 - liveness.score,
      qualityScore: liveness.quality,
      matchedTemplateIndex: bestIndex,
    };
  }

  private async checkLiveness(image: Buffer) {
    const body = this.form(image, 'user_image');
    body.append('save_api_request', 'false');
    const res = (await this.post('passive-liveness', body)) as LivenessResponse;
    const l = res.liveness;
    if (!l || typeof l.status !== 'string') {
      throw new ServiceUnavailableException('Biometric verification is not available');
    }
    const risks = (l.warnings ?? []).map((w) => w.risk ?? w.tag ?? '');
    const score = clamp(l.score ?? 0);
    return {
      declined: l.status !== 'Approved',
      attack: risks.includes('LIVENESS_FACE_ATTACK'),
      multipleFaces: risks.includes('MULTIPLE_FACES_DETECTED'),
      score,
      quality: clamp(l.face_quality ?? score),
    };
  }

  private async matchFaces(live: Buffer, reference: Buffer): Promise<number> {
    const body = this.form(live, 'user_image');
    body.append(
      'ref_image',
      new Blob([new Uint8Array(reference)], { type: 'image/jpeg' }),
      'ref.jpg',
    );
    // Raw score only: our own thresholds decide, not Didit's default of 30.
    body.append('face_match_score_decline_threshold', '0');
    body.append('save_api_request', 'false');
    const res = (await this.post('face-match', body)) as FaceMatchResponse;
    const score = res.face_match?.score;
    return typeof score === 'number' ? clamp(score) : 0;
  }

  private form(image: Buffer, field: string): FormData {
    const body = new FormData();
    body.append(field, new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'face.jpg');
    return body;
  }

  private async post(path: string, body: FormData): Promise<unknown> {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.cfg.baseUrl}/${path}/`, {
        method: 'POST',
        headers: { 'x-api-key': this.cfg.apiKey },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `Didit ${path} network error after ${Date.now() - started}ms: ${String(error)}`,
      );
      throw new ServiceUnavailableException('Biometric verification is not available');
    }
    // Status and timing only; bodies describe a person's face.
    this.logger.log(`Didit ${path} -> ${response.status} ${Date.now() - started}ms`);
    if (!response.ok) {
      // Error bodies carry a short reason ("no write access to sessions"), not
      // image data, so a trimmed copy is safe and makes setup problems obvious.
      const reason = await response
        .json()
        .then((b: { detail?: unknown }) => String(b?.detail ?? '').slice(0, 200))
        .catch(() => '');
      this.logger.error(`Didit ${path} failed: ${response.status} ${reason}`.trim());
      if (response.status === 400) {
        throw new BadRequestException('That image could not be used. Please try again.');
      }
      throw new ServiceUnavailableException('Biometric verification is not available');
    }
    return response.json();
  }

  private decode(sampleBase64: string): Buffer {
    const raw = sampleBase64.replace(/^data:image\/[a-z+]+;base64,/i, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
      throw new BadRequestException('Invalid image data');
    }
    const image = Buffer.from(raw, 'base64');
    if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image is empty or larger than 5 MB');
    }
    return image;
  }

  private assertFace(type: BiometricType): void {
    if (type !== BiometricType.FACE) {
      throw new BadRequestException('Only face biometrics are supported');
    }
  }

  /**
   * Search for a face across all enrolled users (1:N identification).
   * Returns matching users sorted by confidence.
   */
  async searchFace(sampleBase64: string): Promise<FaceSearchResult[]> {
    const image = this.decode(sampleBase64);
    const body = this.form(image, 'user_image');
    body.append('save_api_request', 'false');

    const res = (await this.post('face-search', body)) as FaceSearchResponse;
    const search = res.face_search;

    if (!search) {
      throw new ServiceUnavailableException('Face search is not available');
    }

    // Convert Didit matches to FaceSearchResult format
    const matches: FaceSearchResult[] = (search.matches ?? [])
      .map((m) => ({
        userId: m.vendor_user_id,
        vendorData: m.vendor_data,
        similarityScore: m.similarity_percentage ?? 0,
        userDetails: m.user_details
          ? {
              fullName: m.user_details.full_name,
              documentType: m.user_details.document_type,
              documentNumber: m.user_details.document_number,
            }
          : undefined,
      }))
      .sort((a, b) => b.similarityScore - a.similarityScore);

    return matches;
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

import { BiometricType } from './biometric-enrollment.entity';

/** Injection token for the configured biometric vendor adapter (null when biometrics are disabled). */
export const BIOMETRIC_PROVIDER = Symbol('BIOMETRIC_PROVIDER');

export interface ProviderEnrollment {
  /** Opaque vendor template/reference. Encrypted by the service before it is stored. */
  template: string;
  /** 0-100 capture quality; the service rejects enrollments below its minimum. */
  qualityScore: number;
  /**
   * Set when the vendor also saved the face in ITS search index (needed to find a customer by face
   * alone). It is the vendor's id for that saved face, kept so it can be deleted on revocation.
   */
  searchRef?: string;
}

export interface ProviderVerification {
  matchScore: number;
  livenessScore: number;
  /** Presentation-attack likelihood, 0-100 (higher = more likely fake). */
  spoofScore: number;
  qualityScore: number;
  /** Index into the `templates` argument of the best match, if any. */
  matchedTemplateIndex?: number;
}

export interface FaceSearchResult {
  userId?: string;
  vendorData?: string;
  similarityScore: number;
  userDetails?: {
    fullName?: string;
    documentType?: string;
    documentNumber?: string;
  };
}

/**
 * Contract a real biometric vendor adapter must satisfy. Implementations must
 * perform genuine liveness / presentation-attack detection and matching, and
 * must throw (never return passing scores) when the vendor call fails.
 */
export interface BiometricProvider {
  readonly name: string;
  /** `context.userId` is only used to label a face saved in the vendor's search index. */
  enroll(
    type: BiometricType,
    sampleBase64: string,
    context?: { userId: string },
  ): Promise<ProviderEnrollment>;
  verify(
    type: BiometricType,
    sampleBase64: string,
    templates: string[],
  ): Promise<ProviderVerification>;
  /**
   * Search for a face across all enrolled users (1:N identification).
   * Optional - not all providers support this.
   */
  searchFace?(sampleBase64: string): Promise<FaceSearchResult[]>;
  /** Deletes a face the vendor saved in its search index (the `searchRef` from enrollment). */
  forgetFace?(searchRef: string): Promise<void>;
}

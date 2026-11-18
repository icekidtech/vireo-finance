import { BiometricType } from './biometric-enrollment.entity';

/** Injection token for the configured biometric vendor adapter (null when biometrics are disabled). */
export const BIOMETRIC_PROVIDER = Symbol('BIOMETRIC_PROVIDER');

export interface ProviderEnrollment {
  /** Opaque vendor template/reference. Encrypted by the service before it is stored. */
  template: string;
  /** 0-100 capture quality; the service rejects enrollments below its minimum. */
  qualityScore: number;
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

/**
 * Contract a real biometric vendor adapter must satisfy. Implementations must
 * perform genuine liveness / presentation-attack detection and matching, and
 * must throw (never return passing scores) when the vendor call fails.
 */
export interface BiometricProvider {
  readonly name: string;
  enroll(type: BiometricType, sampleBase64: string): Promise<ProviderEnrollment>;
  verify(
    type: BiometricType,
    sampleBase64: string,
    templates: string[],
  ): Promise<ProviderVerification>;
}

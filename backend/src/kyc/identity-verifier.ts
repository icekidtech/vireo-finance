/** Injection token for the configured identity-verification vendor (null when KYC automation is off). */
export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

export interface IdDocumentResult {
  approved: boolean;
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD, or '' when not read. */
  dateOfBirth: string;
  /** The portrait cropped from the document, when the vendor returned one. */
  portrait: Buffer | null;
}

export interface CompanyCandidate {
  name: string;
  registrationNumber: string;
  /** Normalised registry status, e.g. "active". */
  status: string;
}

/**
 * Everything the KYC tiers need from a verification vendor. Implementations
 * must throw (never return a pass) when the vendor call fails.
 */
export interface IdentityVerifier {
  readonly name: string;
  /** True only for a single, live (not photographed or replayed) face. */
  isLive(selfie: Buffer): Promise<boolean>;
  /** Tier 1: BVN record matches the name and date of birth and the selfie matches the BVN photo. */
  verifyBvn(input: {
    bvn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    selfie: Buffer;
  }): Promise<boolean>;
  /** Tier 2: NIN record matches the name and date of birth. */
  verifyNin(input: {
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<boolean>;
  readIdDocument(front: Buffer, back?: Buffer): Promise<IdDocumentResult>;
  /** 0-100 similarity between two faces. */
  faceMatchScore(a: Buffer, b: Buffer): Promise<number>;
  /** Tier 3: a recent utility bill / bank statement showing this person at this address. */
  verifyProofOfAddress(input: {
    document: Buffer;
    mime: string;
    address: string;
    firstName: string;
    lastName: string;
  }): Promise<boolean>;
  /** Business level 2: looks a company up in the registry by registration number. */
  searchCompany(registrationNumber: string): Promise<CompanyCandidate[]>;
}

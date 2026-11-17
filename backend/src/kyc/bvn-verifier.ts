/** Injection token for the configured BVN verification vendor (null when KYC automation is off). */
export const BVN_VERIFIER = Symbol('BVN_VERIFIER');

export interface BvnCheckInput {
  bvn: string;
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
}

/**
 * Checks a person's details against the banking-industry BVN record. Must
 * throw (never return `true`) when the vendor call fails.
 */
export interface BvnVerifier {
  readonly name: string;
  /** True only on a full match of name and date of birth. */
  verify(input: BvnCheckInput): Promise<boolean>;
}

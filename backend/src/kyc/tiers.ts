/**
 * KYC tiers, modelled on Nigeria's CBN tiered framework as used by consumer
 * wallets: more verification, higher limits. Limits are configurable (env) and
 * must be confirmed against current CBN rules and your licence before launch.
 *
 * Individuals have tiers 0-3; businesses have levels 0-2 (tiered KYC is an
 * individual framework, so business levels follow business onboarding practice).
 */

export type RequirementKey =
  'phone' | 'bvn' | 'nin_id' | 'address' | 'bvn_owner' | 'own_name_account' | 'cac';

export interface Requirement {
  key: RequirementKey;
  label: string;
}

export interface PersonalTierDef {
  tier: 0 | 1 | 2 | 3;
  name: string;
  requirements: Requirement[];
}

export const PERSONAL_TIERS: PersonalTierDef[] = [
  { tier: 0, name: 'Basic', requirements: [{ key: 'phone', label: 'Phone number' }] },
  {
    tier: 1,
    name: 'Standard',
    requirements: [{ key: 'bvn', label: 'BVN, name and date of birth' }],
  },
  {
    tier: 2,
    name: 'Enhanced',
    requirements: [{ key: 'nin_id', label: 'NIN and a valid government ID' }],
  },
  { tier: 3, name: 'Premium', requirements: [{ key: 'address', label: 'Verified home address' }] },
];

export interface BusinessLevelDef {
  level: 0 | 1 | 2;
  name: string;
  requirements: Requirement[];
}

export const BUSINESS_LEVELS: BusinessLevelDef[] = [
  { level: 0, name: 'New', requirements: [] },
  {
    level: 1,
    name: 'Starter',
    requirements: [{ key: 'bvn_owner', label: 'Owner identity verified with BVN' }],
  },
  {
    level: 2,
    name: 'Registered business',
    requirements: [{ key: 'cac', label: 'CAC registration number (and TIN), reviewed by us' }],
  },
];

/** Requirements we can verify automatically today. The rest are shown as "not available yet". */
export const BUSINESS_LEVEL_FOR = (
  kybVerified: boolean,
  registrationVerified: boolean,
): 0 | 1 | 2 => (kybVerified ? (registrationVerified ? 2 : 1) : 0);

export const DEFAULT_CASHOUT_LIMITS: Record<number, bigint> = {
  1: 20_000_000n,
  2: 500_000_000n,
};

/** Nigerian business registration numbers: RC (companies), BN (business names), IT (incorporated trustees). */
export const CAC_NUMBER_PATTERN = /^(RC|BN|IT)\d{5,8}$/;
export const TIN_PATTERN = /^\d{8,14}(-\d{4})?$/;

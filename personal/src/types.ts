/** Response shapes, mirroring backend presenters. */

export type TransferType = 'internal' | 'bank' | 'merchant' | 'paga_wallet';
export type TransferStatus = 'draft' | 'pending' | 'completed' | 'failed' | 'reversed';
export type KycStatus = 'pending' | 'verified' | 'rejected';

export interface PublicUser {
  id: string;
  phone: string;
  email?: string | null;
  handle: string | null;
  name: string;
  kycTier: number;
  status?: string;
  role?: 'user' | 'admin';
}

export interface MyAccount {
  accountId: string;
  currency: string;
  balance: string;
  held: string;
  available: string;
  /** Part of the balance held back until more identity verification is done. */
  restricted: string;
  virtualAccount: { accountNumber: string; bankName: string; status: string } | null;
}

export interface Transfer {
  id: string;
  type: TransferType;
  status: TransferStatus;
  amount: string;
  fee: string;
  currency: string;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientBankCode: string | null;
  recipientAccountNumber: string | null;
  pagaReference: string | null;
  failureReason: string | null;
  challengeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Challenge {
  id: string;
  type: string;
  nonce: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  expiresAt: string;
}

export interface TransferDraft {
  transfer: Transfer;
  challenge: Challenge | null;
}

export interface ActivityItem {
  id: string;
  type: string;
  direction: 'in' | 'out';
  amount: string;
  currency: string;
  counterparty: string;
  transferId: string | null;
  reference: string;
  createdAt: string;
}

export interface MerchantOrder {
  id: string;
  reference: string;
  merchantHandle: string;
  merchantName: string;
  amount: string;
  currency: string;
  status: 'open' | 'paid' | 'expired' | 'cancelled';
  note: string | null;
  expiresAt: string | null;
  qrPayload: string;
  createdAt: string;
}

export interface Device {
  id: string;
  platform: string;
  algorithm: string;
  status: string;
  attestationState?: string;
  createdAt: string;
}

export interface TierRequirement {
  key: string;
  label: string;
  /** True only when we can really verify this today. */
  available: boolean;
}

export interface KycTier {
  tier: number;
  name: string;
  dailyLimit: string;
  state: 'completed' | 'next' | 'locked';
  requirements: TierRequirement[];
}

export interface KycTiers {
  currentTier: number;
  tiers: KycTier[];
}

export interface KycState {
  userId: string;
  kycTier: number;
  status: KycStatus | 'not_started';
  /** Whether automatic BVN verification is configured on the server. */
  bvnAvailable: boolean;
  bvnLast4: string | null;
}

export interface BiometricEnrollment {
  id: string;
  type: 'face';
  status: string;
  qualityScore: number | null;
  modelVersion?: string;
  /** Saved so the face can be recognised without a phone number. Older enrolments are not. */
  faceOnlyReady?: boolean;
  createdAt: string;
  revokedAt?: string | null;
}

export interface BiometricAttempt {
  id: string;
  type: string;
  result: string;
  context: string;
  matchScore: number | null;
  livenessScore: number | null;
  createdAt: string;
}

export interface OtpRequestResult {
  expiresIn: number;
}

export interface VerifyOtpResult {
  accessToken: string;
  user: PublicUser;
}

export interface ChatDraft {
  transferId: string;
  amount: string;
  fee: string;
  recipientName: string | null;
  /** Set for bank transfers: the bank the money goes to. */
  bank?: string | null;
  challenge: Challenge;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  toolsExecuted: string[];
  drafts: ChatDraft[];
  /** Things the assistant wants shown rather than described, e.g. the user's deposit account. */
  cards?: ChatCard[];
}

export interface ChatCard {
  type: 'deposit_account';
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface KycRecord {
  id: string;
  userId: string;
  tier: number;
  provider: string;
  status: KycStatus;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminMerchant {
  id: string;
  handle: string;
  businessName: string;
  kybStatus: string;
  registrationStatus?: string;
  cacNumber?: string | null;
  cacDocumentId?: string | null;
  status: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

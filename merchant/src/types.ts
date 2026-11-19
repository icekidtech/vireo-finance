/** Response shapes, mirroring backend presenters (merchant.service.ts, auth.service.ts). */

export type OrderStatus = 'open' | 'paid' | 'expired' | 'cancelled';
export type SettlementStatus = 'draft' | 'pending' | 'processing' | 'completed' | 'failed';
export type KybStatus = 'pending' | 'verified' | 'rejected';

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

export interface Merchant {
  id: string;
  handle: string;
  businessName: string;
  kybStatus: KybStatus | string;
  registrationStatus?: 'none' | 'pending' | 'verified' | 'rejected' | string;
  cacNumber?: string | null;
  status: string;
  settlementBankCode: string | null;
  settlementAccountNumber: string | null;
  settlementAccountName: string | null;
  createdAt: string;
}

export interface KycState {
  userId: string;
  kycTier: number;
  status: 'not_started' | 'pending' | 'verified' | 'rejected';
  bvnAvailable: boolean;
  bvnLast4: string | null;
}

export type VerificationReason = 'verified' | 'rejected' | 'identity_required' | 'bank_required' | 'name_mismatch';

export interface VerificationOutcome {
  kybStatus: string;
  reason: VerificationReason;
  kycTier: number;
}

export interface BusinessLevel {
  level: number;
  name: string;
  /** Daily cash-out cap, or null for a level that cannot cash out. */
  cashoutDailyLimit: string | null;
  state: 'completed' | 'next' | 'locked';
  requirements: { key: string; label: string }[];
}

export interface BusinessLevels {
  currentLevel: number;
  registrationStatus: 'none' | 'pending' | 'verified' | 'rejected' | string;
  cacNumber: string | null;
  tin: string | null;
  levels: BusinessLevel[];
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface MerchantOrder {
  id: string;
  reference: string;
  merchantHandle: string;
  merchantName: string;
  amount: string;
  currency: string;
  status: OrderStatus;
  note: string | null;
  expiresAt: string | null;
  qrPayload: string;
  createdAt: string;
}

export interface Settlement {
  id: string;
  amount: string;
  status: SettlementStatus;
  pagaReference: string | null;
  failureReason: string | null;
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

export interface SettlementDraft {
  settlement: Settlement;
  challenge: Challenge;
}

/** One settled movement of money on the business balance. */
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

export interface MerchantDashboard {
  merchant: Merchant;
  balance: { available: string; held: string; currency: string };
  salesToday: { amount: string; count: number };
  recentOrders: MerchantOrder[];
}

export interface Device {
  id: string;
  platform: string;
  algorithm: string;
  status: string;
  attestationState?: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface OtpRequestResult {
  expiresIn: number;
}

export interface VerifyOtpResult {
  accessToken: string;
  user: PublicUser;
}

export type TerminalPaymentResult =
  | { status: 'paid'; transfer: { id: string; amount: string; currency: string; status: string } }
  | { status: 'step_up_required'; message: string; orderReference: string }
  | { status: 'denied'; message: string }
  /** The face matched an enrolled customer, but nothing was charged: face identification does not take payment. */
  | { status: 'identified'; message: string };

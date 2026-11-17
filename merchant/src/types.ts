/** Response shapes, mirroring backend presenters (merchant.service.ts, auth.service.ts). */

export type OrderStatus = 'open' | 'paid' | 'expired' | 'cancelled';
export type SettlementStatus = 'draft' | 'pending' | 'processing' | 'completed' | 'failed';
export type KybStatus = 'pending' | 'verified' | 'rejected';

export interface PublicUser {
  id: string;
  phone: string;
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
  status: string;
  settlementBankCode: string | null;
  settlementAccountNumber: string | null;
  settlementAccountName: string | null;
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
  devCode?: string;
}

export interface VerifyOtpResult {
  accessToken: string;
  user: PublicUser;
}

export type TerminalPaymentResult =
  | { status: 'paid'; transfer: { id: string; amount: string; currency: string; status: string } }
  | { status: 'step_up_required'; message: string; orderReference: string }
  | { status: 'denied'; message: string };

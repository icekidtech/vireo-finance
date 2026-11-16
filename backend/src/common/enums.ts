export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum KycStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
}

export enum DeviceStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

export enum SignatureAlgorithm {
  ED25519 = 'ed25519',
  ES256 = 'es256',
}

export enum AccountOwnerType {
  USER = 'user',
  MERCHANT = 'merchant',
  SYSTEM = 'system',
}

export enum AccountType {
  WALLET = 'wallet',
  MERCHANT_BALANCE = 'merchant_balance',
  PAGA_POOL = 'paga_pool',
  FEE_INCOME = 'fee_income',
}

export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed',
}

export enum LedgerDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

export enum LedgerTransactionType {
  INTERNAL_TRANSFER = 'internal_transfer',
  BANK_TRANSFER = 'bank_transfer',
  MERCHANT_PAYMENT = 'merchant_payment',
  INBOUND_CREDIT = 'inbound_credit',
  SETTLEMENT = 'settlement',
  FEE = 'fee',
  REFUND = 'refund',
  REVERSAL = 'reversal',
}

export enum HoldStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
  CAPTURED = 'captured',
}

export enum ChallengeType {
  TRANSFER = 'transfer',
  MERCHANT_PAYMENT = 'merchant_payment',
  SETTLEMENT = 'settlement',
}

export enum ChallengeStatus {
  PENDING = 'pending',
  USED = 'used',
  EXPIRED = 'expired',
}

export enum TransferType {
  INTERNAL = 'internal',
  BANK = 'bank',
  MERCHANT = 'merchant',
  PAGA_WALLET = 'paga_wallet',
}

export enum TransferStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

export enum MerchantOrderStatus {
  OPEN = 'open',
  PAID = 'paid',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum SettlementStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum PagaEventStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  FAILED = 'failed',
  IGNORED = 'ignored',
}

export enum AgentToolCallStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

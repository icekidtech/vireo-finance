export interface CreateVirtualAccountInput {
  userId: string;
  name: string;
  phone: string;
}

export interface VirtualAccountResult {
  accountNumber: string;
  bankName: string;
  providerReference: string;
}

export interface ValidateBankAccountInput {
  bankCode: string;
  accountNumber: string;
  amountMinor: bigint;
  reference: string;
}

export interface ValidateBankAccountResult {
  accountName: string;
  bankCode: string;
  accountNumber: string;
  bankUuid: string;
}

export interface DepositToBankInput {
  amountMinor: bigint;
  reference: string;
  bankCode?: string;
  bankUuid?: string;
  accountNumber: string;
  accountName?: string;
  narration?: string;
  callbackUrl?: string;
}

export type PagaTransferStatus = 'pending' | 'completed' | 'failed';

export interface PagaTransferResult {
  status: PagaTransferStatus;
  providerReference: string;
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface PagaBank {
  name: string;
  uuid: string;
  sortCode?: string;
  ussdCode?: string;
}

export interface PaymentRequestInput {
  reference: string;
  amountMinor: bigint;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  callbackUrl?: string;
  paymentMethods?: string[];
}

export interface PaymentRequestResult {
  referenceNumber: string;
  statusCode: string;
  statusMessage: string;
  paymentMethods: unknown[];
  raw: Record<string, unknown>;
}

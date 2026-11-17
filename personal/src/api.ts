import axios, { AxiosInstance } from 'axios';
import type {
  ActivityItem,
  BiometricAttempt,
  BiometricEnrollment,
  Device,
  KycState,
  MerchantOrder,
  MyAccount,
  OtpRequestResult,
  PublicUser,
  Transfer,
  TransferDraft,
  TransferType,
  VerifyOtpResult,
} from './types';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3050/api/v1';

export interface TransferDraftInput {
  type: Extract<TransferType, 'internal' | 'bank' | 'merchant'>;
  amount: string;
  idempotencyKey: string;
  deviceId: string;
  recipientPhone?: string;
  recipientHandle?: string;
  recipientUserId?: string;
  bankCode?: string;
  accountNumber?: string;
  orderReference?: string;
}

export class VireoApi {
  private client: AxiosInstance;
  private onUnauthorized: (() => void) | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 20_000,
      headers: { 'Content-Type': 'application/json' },
    });
    // An expired or revoked token drops the user back to sign-in.
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 && this.client.defaults.headers.common['Authorization']) {
          this.onUnauthorized?.();
        }
        return Promise.reject(error);
      },
    );
  }

  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler;
  }

  setToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearToken() {
    delete this.client.defaults.headers.common['Authorization'];
  }

  /* ── Auth ── */

  async register(phone: string, name: string, handle?: string) {
    const { data } = await this.client.post('/auth/register', { phone, name, handle });
    return data as { user: PublicUser; created: boolean };
  }

  async requestOtp(phone: string) {
    const { data } = await this.client.post<OtpRequestResult>('/auth/otp/request', { phone });
    return data;
  }

  async verifyOtp(phone: string, code: string) {
    const { data } = await this.client.post<VerifyOtpResult>('/auth/otp/verify', { phone, code });
    return data;
  }

  async getProfile() {
    const { data } = await this.client.get<PublicUser>('/auth/me');
    return data;
  }

  async registerDevice(publicKey: string, platform: string, algorithm?: string, attestationToken?: string) {
    const { data } = await this.client.post<Device>('/auth/devices', {
      publicKey,
      platform,
      algorithm,
      attestationToken,
    });
    return data;
  }

  async listDevices() {
    const { data } = await this.client.get<Device[]>('/auth/devices');
    return data;
  }

  async revokeDevice(deviceId: string) {
    const { data } = await this.client.post<Device>(`/auth/devices/${deviceId}/revoke`);
    return data;
  }

  /* ── Wallet ── */

  /** Wallet id, balance and dedicated virtual account number for the caller. */
  async getMyAccount() {
    const { data } = await this.client.get<MyAccount>('/accounts/me');
    return data;
  }

  /** Settled wallet movements, in and out, with counterparties resolved. */
  async getActivity(limit = 50) {
    const { data } = await this.client.get<ActivityItem[]>('/ledger/activity', { params: { limit } });
    return data;
  }

  /* ── Transfers ── */

  async listTransfers(limit = 50) {
    const { data } = await this.client.get<Transfer[]>('/transfers', { params: { limit } });
    return data;
  }

  async getTransfer(id: string) {
    const { data } = await this.client.get<Transfer>(`/transfers/${id}`);
    return data;
  }

  /** Look up a merchant payment order by reference before paying it. */
  async getMerchantOrder(reference: string) {
    const { data } = await this.client.get<MerchantOrder>(`/merchant-orders/${reference}`);
    return data;
  }

  async createTransferDraft(payload: TransferDraftInput) {
    const { data } = await this.client.post<TransferDraft>('/transfers/drafts', payload);
    return data;
  }

  async submitTransfer(transferId: string, signature: string) {
    const { data } = await this.client.post<{ transfer: Transfer }>(`/transfers/${transferId}/submit`, {
      signature,
    });
    return data;
  }

  /* ── KYC ── */

  async submitKyc(provider: string, payload?: string) {
    const { data } = await this.client.post('/kyc/submit', { provider, payload });
    return data;
  }

  async getKycStatus() {
    const { data } = await this.client.get<KycState>('/kyc/me');
    return data;
  }

  /* ── Biometrics ── */

  async listBiometricEnrollments() {
    const { data } = await this.client.get<{ enrollments: BiometricEnrollment[] }>('/biometrics/enrollments');
    return data.enrollments;
  }

  async listBiometricAttempts() {
    const { data } = await this.client.get<{ attempts: BiometricAttempt[] }>('/biometrics/attempts');
    return data.attempts;
  }

  async grantBiometricConsent(consentVersion: string, deviceId?: string) {
    const { data } = await this.client.post<{ id: string; status: string; consentVersion: string }>(
      '/biometrics/consent',
      { consentVersion, metadata: deviceId ? { deviceId } : undefined },
    );
    return data;
  }

  async revokeBiometricConsent() {
    await this.client.delete('/biometrics/consent');
  }

  async enrollBiometric(type: 'face' | 'voice', sampleBase64: string, consentId: string) {
    const { data } = await this.client.post<BiometricEnrollment>('/biometrics/enroll', {
      type,
      sampleBase64,
      consentId,
    });
    return data;
  }

  async revokeBiometricEnrollment(type: 'face' | 'voice', reason?: string) {
    await this.client.delete('/biometrics/enrollments', { data: { type, reason } });
  }
}

export const api = new VireoApi();

import axios, { AxiosInstance } from 'axios';
import type { PickedFile } from './lib/documents';
import type {
  ActivityItem,
  AppNotification,
  AdminMerchant,
  ChatResponse,
  KycRecord,
  BiometricAttempt,
  BiometricEnrollment,
  Device,
  KycState,
  KycTiers,
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

  /** Creates the account. Sign-in codes go to the email; the phone is only saved on the profile. */
  async register(input: { email: string; phone: string; name: string; handle?: string }) {
    const { data } = await this.client.post('/auth/register', input);
    return data as { user: PublicUser; created: boolean };
  }

  /** Forgotten PIN: emails a one-time code to the signed-in user. */
  async requestPinResetCode() {
    const { data } = await this.client.post<OtpRequestResult>('/pin/reset/code');
    return data;
  }

  async requestEmailOtp(email: string) {
    const { data } = await this.client.post<OtpRequestResult>('/auth/email-otp/request', { email });
    return data;
  }

  async verifyEmailOtp(email: string, code: string) {
    const { data } = await this.client.post<VerifyOtpResult>('/auth/email-otp/verify', { email, code });
    return data;
  }

  /** Corrects the number on the account (it must be a valid Nigerian mobile number). */
  async updatePhone(phone: string) {
    const { data } = await this.client.patch<PublicUser>('/auth/me/phone', { phone });
    return data;
  }

  async getProfile() {
    const { data } = await this.client.get<PublicUser>('/auth/me');
    return data;
  }

  async registerDevice(publicKey: string, platform: string, algorithm?: string) {
    const { data } = await this.client.post<Device>('/auth/devices', {
      publicKey,
      platform,
      algorithm,
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

  async listBanks() {
    const { data } = await this.client.get<{ code: string; name: string }[]>('/transfers/banks');
    return data;
  }

  /** Resolves the holder's name. No amount: the server checks the account against a nominal ₦1. */
  async lookupBankAccount(payload: { bankCode: string; accountNumber: string }) {
    const { data } = await this.client.post<{ accountName: string; accountNumber: string; bankCode: string; internal: boolean }>(
      '/transfers/bank-lookup',
      payload,
    );
    return data;
  }

  async createTransferDraft(payload: TransferDraftInput) {
    const { data } = await this.client.post<TransferDraft>('/transfers/drafts', payload);
    return data;
  }

  /** `confirmation.pin` is sent only when the user approved with their PIN instead of biometrics. */
  async submitTransfer(
    transferId: string,
    signature: string,
    confirmation: { approval: 'biometric' | 'pin'; pin?: string } = { approval: 'biometric' },
  ) {
    const { data } = await this.client.post<{ transfer: Transfer }>(`/transfers/${transferId}/submit`, {
      signature,
      ...confirmation,
    });
    return data;
  }

  /* ── Notifications ── */

  async listUnreadNotifications() {
    const { data } = await this.client.get<AppNotification[]>('/notifications', {
      params: { unread: 'true', limit: 5, scope: 'personal' },
    });
    return data;
  }

  async markNotificationsRead(ids?: string[]) {
    // Only this app's own notifications: the same login may also own a business.
    await this.client.post('/notifications/read', ids ? { ids } : { scope: 'personal' });
  }

  /* ── Transaction PIN ── */

  async getPinStatus() {
    const { data } = await this.client.get<{ set: boolean; locked: boolean; lockedUntil: string | null }>('/pin/status');
    return data;
  }

  /** Sets a PIN, or changes it (then `currentPin` is required). */
  async setPin(pin: string, currentPin?: string) {
    await this.client.post('/pin', { pin, ...(currentPin ? { currentPin } : {}) });
  }

  /** Forgotten PIN: needs a fresh code emailed to you (request it with requestPinResetCode). */
  async resetPin(code: string, pin: string) {
    await this.client.post('/pin/reset', { code, pin });
  }

  /* ── KYC ── */

  /** Tier 2: NIN, government ID photo(s) and a live selfie. */
  async verifyNinAndId(input: { nin: string; idFrontDocumentId: string; idBackDocumentId?: string; selfie: string }) {
    const { data } = await this.client.post<KycState>('/kyc/nin', input, { timeout: 90_000 });
    return data;
  }

  /** Tier 3: home address and a proof-of-address document. */
  async verifyAddress(input: { address: string; proofDocumentId: string }) {
    const { data } = await this.client.post<KycState>('/kyc/address', input, { timeout: 90_000 });
    return data;
  }

  /** The account number to pay into. Created now if signup could not create it. */
  async getDepositAccount() {
    const { data } = await this.client.post<{ bankName: string; accountNumber: string; accountName: string }>(
      '/accounts/me/deposit-account',
    );
    return data;
  }

  async getKycTiers() {
    const { data } = await this.client.get<KycTiers>('/kyc/tiers');
    return data;
  }

  /* ── Documents (private storage, served only through the API) ── */

  /** Uploads one file; the server encrypts it and keeps it in private storage. */
  async uploadDocument(
    kind: 'id_front' | 'id_back' | 'proof_of_address' | 'cac_certificate',
    file: PickedFile,
  ) {
    const form = new FormData();
    form.append('kind', kind);
    if (file.file) {
      form.append('file', file.file, file.name); // web
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    }
    const { data } = await this.client.post<{ id: string; kind: string; mime: string; size: number }>(
      '/documents',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 },
    );
    return data;
  }

  /** Staff only (web): opens a stored document in a new tab. The file never has a public URL. */
  async viewDocument(documentId: string) {
    const { data } = await this.client.get<Blob>(`/documents/${documentId}/content`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Tier 1: checks name, date of birth and BVN against the bank record. */
  async verifyBvn(input: { bvn: string; firstName: string; lastName: string; dateOfBirth: string; selfie: string }) {
    const { data } = await this.client.post<KycState>('/kyc/bvn', input);
    return data;
  }

  async getKycStatus() {
    const { data } = await this.client.get<KycState>('/kyc/me');
    return data;
  }

  /* ── Biometrics ── */

  /** Whether this server has a biometric vendor configured. */
  async biometricStatus() {
    const { data } = await this.client.get<{ available: boolean; types: string[]; testMode: boolean; faceOnly: { available: boolean; maxAmount: string } }>('/biometrics/status');
    return data;
  }

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

  async enrollBiometric(type: 'face', sampleBase64: string, consentId: string) {
    const { data } = await this.client.post<BiometricEnrollment>('/biometrics/enroll', {
      type,
      sampleBase64,
      consentId,
    }, { timeout: 60_000 });
    return data;
  }

  async revokeBiometricEnrollment(type: 'face', reason?: string) {
    await this.client.delete('/biometrics/enrollments', { data: { type, reason } });
  }

  /* ── Assistant ── */

  /** deviceId lets the assistant prepare a transfer you can approve on this phone. */
  async chat(message: string, sessionId?: string, deviceId?: string) {
    const { data } = await this.client.post<ChatResponse>(
      '/agent/chat',
      { message, sessionId, deviceId },
      { timeout: 60_000 },
    );
    return data;
  }

  /* ── Admin (role = admin) ── */

  async listPendingKyc() {
    const { data } = await this.client.get<KycRecord[]>('/kyc/pending');
    return data;
  }

  async verifyKyc(id: string, status: 'verified' | 'rejected', tier?: string, reason?: string) {
    const { data } = await this.client.patch<KycRecord>(`/kyc/${id}/verify`, { status, tier, reason });
    return data;
  }

  async listMerchants() {
    const { data } = await this.client.get<AdminMerchant[]>('/merchants');
    return data;
  }

  /** Decide a merchant's submitted CAC registration (level 2). */
  async reviewRegistration(merchantId: string, status: 'verified' | 'rejected') {
    const { data } = await this.client.patch<AdminMerchant>(`/merchants/${merchantId}/registration`, { status });
    return data;
  }

  async verifyKyb(merchantId: string, status: 'verified' | 'rejected') {
    const { data } = await this.client.patch<AdminMerchant>(`/merchants/${merchantId}/kyb`, { status });
    return data;
  }
}

export const api = new VireoApi();

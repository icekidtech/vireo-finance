import axios, { AxiosInstance } from 'axios';
import type { PickedFile } from './lib/documents';
import type {
  ActivityItem,
  AppNotification,
  BusinessLevels,
  KycState,
  VerificationOutcome,
  Device,
  Merchant,
  MerchantDashboard,
  MerchantOrder,
  OtpRequestResult,
  PublicUser,
  Settlement,
  SettlementDraft,
  TerminalPaymentResult,
  VerifyOtpResult,
} from './types';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3050/api/v1';

export interface OnboardMerchantInput {
  businessName: string;
  handle: string;
  settlementBankCode?: string;
  settlementAccountNumber?: string;
}

export interface UpdateMerchantInput {
  businessName?: string;
  settlementBankCode?: string;
  settlementAccountNumber?: string;
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
    // An expired or revoked token must drop the user back to sign-in instead
    // of leaving every screen showing an opaque error.
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

  /* ── Merchant ── */

  async onboardMerchant(input: OnboardMerchantInput) {
    const { data } = await this.client.post<Merchant>('/merchants', input);
    return data;
  }

  async getMerchantProfile() {
    const { data } = await this.client.get<Merchant>('/merchants/me');
    return data;
  }

  async updateMerchant(input: UpdateMerchantInput) {
    const { data } = await this.client.patch<Merchant>('/merchants/me', input);
    return data;
  }

  /** Bank account customers can transfer to; credited to the merchant balance. */
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

  async getDepositAccount() {
    const { data } = await this.client.get<{ bankName: string; accountNumber: string; accountName: string }>(
      '/merchants/me/deposit-account',
    );
    return data;
  }

  /* ── Identity & verification ── */

  async getKycStatus() {
    const { data } = await this.client.get<KycState>('/kyc/me');
    return data;
  }

  /** Checks name, date of birth and BVN against the bank record. */
  async verifyBvn(input: { bvn: string; firstName: string; lastName: string; dateOfBirth: string; selfie: string }) {
    const { data } = await this.client.post<KycState>('/kyc/bvn', input);
    return data;
  }

  async getBusinessLevels() {
    const { data } = await this.client.get<BusinessLevels>('/merchants/me/levels');
    return data;
  }

  /** Level 2: submits the CAC number (and TIN) for review. */
  async submitRegistration(input: { cacNumber: string; tin?: string; certificateDocumentId: string }) {
    const { data } = await this.client.post<BusinessLevels>('/merchants/me/registration', input);
    return data;
  }

  /** Re-checks whether the merchant now qualifies for automatic verification. */
  async checkMerchantVerification() {
    const { data } = await this.client.post<VerificationOutcome>('/merchants/me/verification');
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

  /* ── Notifications ── */

  async listUnreadNotifications() {
    const { data } = await this.client.get<AppNotification[]>('/notifications', {
      params: { unread: 'true', limit: 5, scope: 'merchant' },
    });
    return data;
  }

  async markNotificationsRead(ids?: string[]) {
    // Only this app's own notifications: the same login may also have a personal wallet.
    await this.client.post('/notifications/read', ids ? { ids } : { scope: 'merchant' });
  }

  async listBanks() {
    const { data } = await this.client.get<{ code: string; name: string }[]>('/transfers/banks');
    return data;
  }

  /** Server-side account name resolution; the name is never typed by the user. */
  async lookupBankAccount(payload: { bankCode: string; accountNumber: string }) {
    const { data } = await this.client.post<{ accountName: string; accountNumber: string; bankCode: string; internal: boolean }>(
      '/transfers/bank-lookup',
      payload,
    );
    return data;
  }

  /** Money in and out of the business balance: transfers and deposits received, cash-outs sent. */
  async getMerchantActivity(limit = 50) {
    const { data } = await this.client.get<ActivityItem[]>('/merchants/me/activity', { params: { limit } });
    return data;
  }

  async getDashboard() {
    const { data } = await this.client.get<MerchantDashboard>('/merchants/dashboard');
    return data;
  }

  async createOrder(amount: string, note?: string, expiresInSeconds?: number) {
    const { data } = await this.client.post<MerchantOrder>('/merchants/orders', {
      amount,
      note,
      expiresInSeconds,
    });
    return data;
  }

  /** Order lookup by reference — also used to poll for payment. */
  async getOrder(reference: string) {
    const { data } = await this.client.get<MerchantOrder>(`/merchant-orders/${reference}`);
    return data;
  }

  async listOrders() {
    const { data } = await this.client.get<MerchantOrder[]>('/merchants/orders');
    return data;
  }

  async cancelOrder(reference: string) {
    const { data } = await this.client.post<MerchantOrder>(`/merchants/orders/${reference}/cancel`);
    return data;
  }

  /* ── Settlements ── */

  async createSettlementDraft(deviceId: string, amount?: string) {
    const { data } = await this.client.post<SettlementDraft>('/merchants/settlements/drafts', {
      amount,
      deviceId,
    });
    return data;
  }

  /** `confirmation.pin` is sent only when the owner approved with their PIN instead of biometrics. */
  async submitSettlement(
    settlementId: string,
    signature: string,
    confirmation: { approval: 'biometric' | 'pin'; pin?: string } = { approval: 'biometric' },
  ) {
    const { data } = await this.client.post<Settlement>(
      `/merchants/settlements/${settlementId}/submit`,
      { signature, ...confirmation },
    );
    return data;
  }

  async listSettlements() {
    const { data } = await this.client.get<Settlement[]>('/merchants/settlements');
    return data;
  }

  /* ── Biometrics (terminal payments) ── */

  async biometricStatus() {
    const { data } = await this.client.get<{ available: boolean; types: string[]; testMode: boolean }>('/biometrics/status');
    return data;
  }

  /**
   * Face payment at the till. Always resolves with a `status`; the
   * server never says why a biometric was denied.
   * 
   * LEGACY: Requires customer identifier (1:1 verification)
   */
  /**
   * Pay an order with just a face: no phone number. The server finds the customer and takes the
   * payment (when it is switched on and the order is small enough), so no customer id is sent.
   */
  async terminalPaymentByFace(input: { orderReference: string; sampleBase64: string }) {
    const { data } = await this.client.post<TerminalPaymentResult>(
      '/merchants/terminal-payment/face',
      input,
      { timeout: 45_000 },
    );
    return data;
  }

  async terminalPayment(input: {
    orderReference: string;
    customerIdentifier: string;
    biometricType: 'face';
    biometricSample: string;
  }) {
    const { data } = await this.client.post<TerminalPaymentResult>(
      '/merchants/terminal-payment',
      input,
      { timeout: 45_000 },
    );
    return data;
  }

  /**
   * TRUE DEVICELESS: Identify customer by face (1:N search).
   * No identifier needed - just capture face and system finds the customer.
   * 
   * Returns userId if identified, or denies if not found/enrolled.
   */
  async identifyByFace(input: {
    sampleBase64: string;
    amountMinor?: number;
    metadata?: Record<string, unknown>;
  }) {
    const { data } = await this.client.post<{
      decision: 'APPROVED' | 'DENIED' | 'STEP_UP';
      userId?: string;
      scores: {
        matchScore: number;
        livenessScore: number;
        spoofScore: number;
        qualityScore: number;
      };
      reason?: string;
    }>('/biometrics/identify', input, { timeout: 45_000 });
    return data;
  }
}

export const api = new VireoApi();

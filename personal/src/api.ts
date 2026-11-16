import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3050/api/v1';

export class VireoApi {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  setToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearToken() {
    delete this.client.defaults.headers.common['Authorization'];
  }

  async register(phone: string, name: string, handle?: string) {
    const { data } = await this.client.post('/auth/register', { phone, name, handle });
    return data;
  }

  async requestOtp(phone: string) {
    const { data } = await this.client.post('/auth/otp/request', { phone });
    return data;
  }

  async verifyOtp(phone: string, code: string) {
    const { data } = await this.client.post('/auth/otp/verify', { phone, code });
    return data;
  }

  async getProfile() {
    const { data } = await this.client.get('/auth/me');
    return data;
  }

  async registerDevice(publicKey: string, platform: string, algorithm?: string, attestationToken?: string) {
    const { data } = await this.client.post('/auth/devices', {
      publicKey,
      platform,
      algorithm,
      attestationToken,
    });
    return data;
  }

  async getWalletBalance() {
    const { data } = await this.client.get('/ledger/balance');
    return data;
  }

  /** Wallet id, balance and dedicated virtual account number for the caller. */
  async getMyAccount() {
    const { data } = await this.client.get('/accounts/me');
    return data;
  }

  async getTransactions(limit = 50) {
    const { data } = await this.client.get('/transfers', { params: { limit } });
    return data;
  }

  /** Look up a merchant payment order by reference before paying it. */
  async getMerchantOrder(reference: string) {
    const { data } = await this.client.get(`/merchant-orders/${reference}`);
    return data;
  }

  async createTransferDraft(payload: {
    type: 'internal' | 'bank' | 'merchant';
    amount: string;
    idempotencyKey: string;
    deviceId: string;
    recipientPhone?: string;
    recipientHandle?: string;
    recipientUserId?: string;
    bankCode?: string;
    accountNumber?: string;
    orderReference?: string;
  }) {
    const { data } = await this.client.post('/transfers/drafts', payload);
    return data;
  }

  async submitTransfer(transferId: string, signature: string) {
    const { data } = await this.client.post(`/transfers/${transferId}/submit`, {
      signature,
    });
    return data;
  }

  async submitKyc(provider: string, payload?: string) {
    const { data } = await this.client.post('/kyc/submit', { provider, payload });
    return data;
  }

  async getKycStatus() {
    const { data } = await this.client.get('/kyc/me');
    return data;
  }
}

export const api = new VireoApi();

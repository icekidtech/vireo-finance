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

  async onboardMerchant(businessName: string, handle: string, settlementBankCode?: string, settlementAccountNumber?: string, settlementAccountName?: string) {
    const { data } = await this.client.post('/merchants', {
      businessName,
      handle,
      settlementBankCode,
      settlementAccountNumber,
      settlementAccountName,
    });
    return data;
  }

  async getMerchantProfile() {
    const { data } = await this.client.get('/merchants/me');
    return data;
  }

  async getDashboard() {
    const { data } = await this.client.get('/merchants/dashboard');
    return data;
  }

  async createOrder(amount: string, note?: string) {
    const { data } = await this.client.post('/merchants/orders', { amount, note });
    return data;
  }

  /** Public order lookup by reference — also used to poll for payment. */
  async getOrder(reference: string) {
    const { data } = await this.client.get(`/merchant-orders/${reference}`);
    return data;
  }

  async listOrders() {
    const { data } = await this.client.get('/merchants/orders');
    return data;
  }

  async createSettlementDraft(deviceId: string, amount?: string) {
    const { data } = await this.client.post('/merchants/settlements/drafts', { amount, deviceId });
    return data;
  }

  async submitSettlement(settlementId: string, signature: string) {
    const { data } = await this.client.post(`/merchants/settlements/${settlementId}/submit`, { signature });
    return data;
  }

  async listSettlements() {
    const { data } = await this.client.get('/merchants/settlements');
    return data;
  }
}

export const api = new VireoApi();

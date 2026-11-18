export interface NotificationProvider {
  readonly name: string;
  send(userId: string, title: string, body: string, data?: Record<string, unknown>): Promise<void>;
}

export interface NotificationChannel {
  type: 'sms' | 'push' | 'email' | 'in_app';
  enabled: boolean;
}

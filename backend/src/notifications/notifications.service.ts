import { Injectable, Logger } from '@nestjs/common';
import { LoggerNotificationProvider } from './providers/logger.provider';
import { SmsNotificationProvider } from './providers/sms.provider';
import { PushNotificationProvider } from './providers/push.provider';
import { InAppNotificationProvider } from './providers/in-app.provider';
import { EmailNotificationProvider } from './providers/email.provider';
import { NotificationProvider, NotificationChannel } from './notification-provider.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providers: NotificationProvider[];

  constructor(
    loggerProvider: LoggerNotificationProvider,
    smsProvider: SmsNotificationProvider,
    pushProvider: PushNotificationProvider,
    emailProvider: EmailNotificationProvider,
    inAppProvider?: InAppNotificationProvider,
  ) {
    this.providers = [loggerProvider];
    if (inAppProvider) {
      this.providers.push(inAppProvider);
    }
    if (emailProvider.constructor.name === 'EmailNotificationProvider') {
      this.providers.push(emailProvider);
    }
    if (smsProvider.constructor.name === 'SmsNotificationProvider') {
      this.providers.push(smsProvider);
    }
    if (pushProvider.constructor.name === 'PushNotificationProvider') {
      this.providers.push(pushProvider);
    }
  }

  async send(
    userId: string,
    title: string,
    body: string,
    channels: NotificationChannel[] = [{ type: 'in_app', enabled: true }],
    data?: Record<string, unknown>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.providers.map((provider) => {
        const channel = channels.find((c) => c.type === provider.name);
        if (channel && !channel.enabled) {
          return Promise.resolve();
        }
        return provider.send(userId, title, body, data);
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Notification provider ${this.providers[index].name} failed for user=${userId}: ${String(result.reason)}`,
        );
      }
    });
  }

  async creditReceived(
    userId: string,
    amountMinor: bigint,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.send(
      userId,
      'Credit received',
      `You received NGN ${this.formatMinor(amountMinor)}.`,
      [
        { type: 'sms', enabled: true },
        { type: 'push', enabled: true },
        { type: 'in_app', enabled: true },
      ],
      data,
    );
  }

  /** First notification a new user sees in the app inbox. */
  async sendWelcome(user: { id: string; name: string }): Promise<void> {
    await this.send(
      user.id,
      'Welcome to Vireo',
      `Hi ${user.name.trim().split(/\s+/)[0]}, your account is ready. Share your account number to receive money.`,
      [{ type: 'in_app', enabled: true }],
      { scope: 'personal' },
    );
  }

  /**
   * Send developer API waitlist confirmation email
   */
  async sendDeveloperWaitlistEmail(waitlistEntry: {
    email: string;
    company: string | null;
    useCase: string | null;
  }): Promise<void> {
    const emailProvider = this.providers.find((p) => p.name === 'email');
    if (!emailProvider) {
      this.logger.warn('Email provider not available for waitlist confirmation');
      return;
    }

    const subject = 'Welcome to the Vireo API Waitlist';
    const html = this.getWaitlistEmailTemplate(waitlistEntry);

    try {
      await (emailProvider as any).sendCustomEmail(waitlistEntry.email, subject, html);
    } catch (error) {
      this.logger.error(`Failed to send waitlist email: ${String(error)}`);
      throw error;
    }
  }

  private getWaitlistEmailTemplate(entry: {
    email: string;
    company: string | null;
    useCase: string | null;
  }): string {
    const companyName = entry.company || 'your company';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Vireo API Waitlist</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #1a1a2e 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 48px 40px; text-align: center; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border-bottom: 1px solid rgba(255,255,255,0.1);">
              <div style="display: inline-block; padding: 12px 24px; background: rgba(99, 102, 241, 0.2); border-radius: 24px; margin-bottom: 24px;">
                <span style="font-size: 28px;">🚀</span>
              </div>
              <h1 style="margin: 0 0 12px 0; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                You're on the list!
              </h1>
              <p style="margin: 0; font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.5;">
                Welcome to the future of biometric payments
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9);">
                Hi there,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9);">
                Thank you for joining the <strong style="color: #6366f1;">Vireo API waitlist</strong>. We're excited to have ${companyName} as part of our developer community!
              </p>

              <!-- Feature Highlights -->
              <div style="margin: 32px 0; padding: 24px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #ffffff;">What you can build with Vireo</h2>
                
                <div style="margin-bottom: 16px;">
                  <div style="display: inline-block; width: 32px; height: 32px; background: rgba(99, 102, 241, 0.2); border-radius: 8px; text-align: center; line-height: 32px; vertical-align: middle;">
                    <span style="font-size: 16px;">🔐</span>
                  </div>
                  <div style="display: inline-block; vertical-align: middle; margin-left: 12px; width: calc(100% - 48px);">
                    <strong style="color: #ffffff; font-size: 15px;">Biometric enrollment</strong>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.6);">BVN verification + face capture with liveness detection</p>
                  </div>
                </div>

                <div style="margin-bottom: 16px;">
                  <div style="display: inline-block; width: 32px; height: 32px; background: rgba(99, 102, 241, 0.2); border-radius: 8px; text-align: center; line-height: 32px; vertical-align: middle;">
                    <span style="font-size: 16px;">⚡</span>
                  </div>
                  <div style="display: inline-block; vertical-align: middle; margin-left: 12px; width: calc(100% - 48px);">
                    <strong style="color: #ffffff; font-size: 15px;">Face-only identification</strong>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.6);">1:N search finds users without phone numbers</p>
                  </div>
                </div>

                <div>
                  <div style="display: inline-block; width: 32px; height: 32px; background: rgba(99, 102, 241, 0.2); border-radius: 8px; text-align: center; line-height: 32px; vertical-align: middle;">
                    <span style="font-size: 16px;">💰</span>
                  </div>
                  <div style="display: inline-block; vertical-align: middle; margin-left: 12px; width: calc(100% - 48px);">
                    <strong style="color: #ffffff; font-size: 15px;">Payment authorization</strong>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.6);">Secure transactions with biometric verification</p>
                  </div>
                </div>
              </div>

              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9);">
                We'll keep you updated on:
              </p>
              <ul style="margin: 0 0 24px 0; padding-left: 24px; font-size: 15px; line-height: 1.8; color: rgba(255,255,255,0.8);">
                <li>API launch timeline and early access opportunities</li>
                <li>Technical documentation and integration guides</li>
                <li>Pilot program details and pricing</li>
                <li>Developer community events</li>
              </ul>

              ${entry.useCase ? `
              <div style="margin: 32px 0; padding: 20px; background: rgba(139, 92, 246, 0.1); border-left: 4px solid #8b5cf6; border-radius: 8px;">
                <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.7);"><strong>Your use case:</strong></p>
                <p style="margin: 8px 0 0 0; font-size: 15px; color: rgba(255,255,255,0.9); font-style: italic;">"${entry.useCase}"</p>
              </div>
              ` : ''}

              <p style="margin: 32px 0 0 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9);">
                In the meantime, feel free to explore our <a href="https://vireofinance.com/developers" style="color: #6366f1; text-decoration: none; font-weight: 600;">developer page</a> to learn more about what you can build with Vireo.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 0 40px 40px 40px; text-align: center;">
              <a href="https://vireofinance.com/developers" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);">
                Explore the docs
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: rgba(255,255,255,0.5);">
                Questions? Reply to this email or reach out at 
                <a href="mailto:developers@vireofinance.com" style="color: #6366f1; text-decoration: none;">developers@vireofinance.com</a>
              </p>
              <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.4);">
                © ${new Date().getFullYear()} Vireo Finance<br/>
                Biometric payment infrastructure for Nigeria
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  private formatMinor(minor: bigint): string {
    const sign = minor < 0n ? '-' : '';
    const absolute = minor < 0n ? -minor : minor;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');
    return `${sign}${whole}.${fraction}`;
  }
}

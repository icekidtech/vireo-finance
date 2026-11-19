import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { NotificationProvider } from '../notification-provider.interface';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  readonly name = 'email' as const;
  private readonly logger = new Logger(EmailNotificationProvider.name);
  private readonly resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('resend.apiKey');
    this.fromEmail = this.config.get<string>('resend.fromEmail') ?? 'noreply@vireofinance.com';

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email provider initialized');
    } else {
      this.logger.warn('Resend API key not configured - email notifications disabled');
    }
  }

  async send(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.debug(`Email skipped for user ${userId} - Resend not configured`);
      return;
    }

    const emailAddress = data?.email as string | undefined;
    if (!emailAddress) {
      this.logger.debug(`Email skipped for user ${userId} - no email address provided`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: emailAddress,
        subject: title,
        text: body,
        html: this.formatHtml(title, body),
      });

      this.logger.log(`Email sent to ${emailAddress}: ${title}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${emailAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Send a verification code email
   */
  async sendVerificationCode(email: string, code: string): Promise<void> {
    if (!this.resend) {
      throw new Error('Resend email provider not configured');
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Your Vireo verification code',
        text: `Your verification code is: ${code}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request this code, please ignore this email.`,
        html: this.formatVerificationCodeHtml(code),
      });

      this.logger.log(`Verification code sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification code to ${email}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private formatHtml(title: string, body: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 24px;">${this.escapeHtml(title)}</h2>
    <p style="margin: 0; color: #4a5568; font-size: 16px;">${this.escapeHtml(body)}</p>
  </div>
  <p style="color: #718096; font-size: 14px; margin-top: 24px;">
    This is an automated message from Vireo Finance. Please do not reply to this email.
  </p>
</body>
</html>
    `.trim();
  }

  private formatVerificationCodeHtml(code: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Vireo verification code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 32px; font-weight: bold; letter-spacing: -1px; margin: 0;">Vireo</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 32px; text-align: center;">
    <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 24px;">Your verification code</h2>
    <p style="margin: 0 0 24px 0; color: #4a5568; font-size: 16px;">Enter this code to verify your email address:</p>
    
    <div style="background: white; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; display: inline-block; margin-bottom: 24px;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a; font-family: 'Courier New', monospace;">${this.escapeHtml(code)}</span>
    </div>
    
    <p style="margin: 0; color: #718096; font-size: 14px;">This code will expire in <strong>5 minutes</strong>.</p>
  </div>
  
  <div style="margin-top: 32px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
    <p style="margin: 0; color: #856404; font-size: 14px;">
      <strong>Security tip:</strong> Never share this code with anyone. Vireo staff will never ask for your verification code.
    </p>
  </div>
  
  <p style="color: #718096; font-size: 14px; margin-top: 32px; text-align: center;">
    If you didn't request this code, please ignore this email or contact our support team.
  </p>
  
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
  
  <p style="color: #a0aec0; font-size: 12px; text-align: center; margin: 0;">
    © ${new Date().getFullYear()} Vireo Finance. All rights reserved.
  </p>
</body>
</html>
    `.trim();
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

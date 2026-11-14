import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resend } from 'resend';
import { User } from '../users/user.entity';
import { formatMinor } from '../database/money';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    const apiKey = this.config.get<string>('resend.apiKey') ?? '';
    this.fromEmail = this.config.get<string>('resend.fromEmail') ?? 'noreply@vireofinance.com';
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set — emails will only be logged');
    }
  }

  async sendWelcome(user: User): Promise<void> {
    if (!user.email) return;
    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to Vireo Finance!',
      html: [
        `<h1>Welcome, ${escapeHtml(user.name)}!</h1>`,
        `<p>Your Vireo Finance account is ready. Start sending and receiving money instantly.</p>`,
        `<p>Your Vireo handle: <strong>${escapeHtml(user.handle ?? user.id)}</strong></p>`,
      ].join('\n'),
    });
  }

  async sendKycUpdate(user: User, status: string, tier: number): Promise<void> {
    if (!user.email) return;
    const statusText =
      status === 'verified' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Under Review';
    const lines = [
      `<h2>KYC Update for ${escapeHtml(user.name)}</h2>`,
      `<p>Your identity verification status: <strong>${statusText}</strong></p>`,
    ];
    if (status === 'verified') {
      lines.push(`<p>You are now KYC Tier ${tier}. Your daily limits have been updated.</p>`);
    }
    if (status === 'rejected') {
      lines.push(`<p>Your document was not accepted. Please resubmit with a valid ID.</p>`);
    }
    await this.sendEmail({
      to: user.email,
      subject: `KYC ${statusText} — Vireo Finance`,
      html: lines.join('\n'),
    });
  }

  async creditReceived(userId: string, amountMinor: bigint): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.email) {
      this.logger.debug(`No email for user ${userId}, skipping credit notification`);
      return;
    }
    const formatted = formatMinor(amountMinor);
    await this.sendEmail({
      to: user.email,
      subject: `You received NGN ${formatted} — Vireo Finance`,
      html: [
        `<h2>Credit Received</h2>`,
        `<p>Hi ${escapeHtml(user.name)},</p>`,
        `<p>You have received <strong>NGN ${formatted}</strong> in your Vireo Finance wallet.</p>`,
      ].join('\n'),
    });
  }

  async send(userId: string, title: string, body: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.email) {
      this.logger.log(`notify user=${userId} title="${title}" body="${body}" (no email on file)`);
      return;
    }
    await this.sendEmail({
      to: user.email,
      subject: `${title} — Vireo Finance`,
      html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>`,
    });
  }

  private async sendEmail({
    to,
    subject,
    html,
  }: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!to) {
      this.logger.warn(`sendEmail called with empty recipient, subject="${subject}"`);
      return;
    }
    if (!this.resend) {
      this.logger.log(`[EMAIL-MOCK] to=${to} subject="${subject}"`);
      return;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`Resend error: ${JSON.stringify(error)}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${String(err)}`);
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

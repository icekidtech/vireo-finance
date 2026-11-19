import { ConfigService } from '@nestjs/config';

const send = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send } })) }));

import { EmailNotificationProvider } from './email.provider';

function provider(settings: { apiKey?: string; fromEmail?: string } = { apiKey: 'key' }) {
  const config = {
    get: (key: string) =>
      key === 'resend.apiKey'
        ? settings.apiKey
        : key === 'resend.fromEmail'
          ? settings.fromEmail
          : undefined,
  } as unknown as ConfigService;
  return new EmailNotificationProvider(config);
}

describe('EmailNotificationProvider', () => {
  beforeEach(() => send.mockReset());

  it('sends the code from the configured sender', async () => {
    send.mockResolvedValue({ data: { id: 'e1' }, error: null });
    await provider({ apiKey: 'key', fromEmail: 'noreply@vireofinance.app' }).sendVerificationCode(
      'ada@example.com',
      '123456',
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@vireofinance.app',
        to: 'ada@example.com',
        text: expect.stringContaining('123456'),
      }),
    );
  });

  it('defaults the sender to the verified vireofinance.app domain', async () => {
    send.mockResolvedValue({ data: { id: 'e1' }, error: null });
    await provider({ apiKey: 'key' }).sendVerificationCode('ada@example.com', '123456');
    expect(send.mock.calls[0][0].from).toBe('noreply@vireofinance.app');
  });

  // Resend's client does not throw when it rejects an email: it returns { error }.
  // Treating that as success told users a code was sent when nothing was.
  it('fails when Resend rejects the email', async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: 'This API key is not authorized to send emails from vireofinance.com' },
    });
    await expect(provider().sendVerificationCode('ada@example.com', '123456')).rejects.toThrow(
      /Resend rejected the email: .*not authorized/,
    );
  });

  it('fails when the request itself throws', async () => {
    send.mockRejectedValue(new Error('network down'));
    await expect(provider().sendVerificationCode('ada@example.com', '123456')).rejects.toThrow(
      'network down',
    );
  });

  it('fails, rather than pretending, when Resend is not configured', async () => {
    await expect(
      provider({ apiKey: '' }).sendVerificationCode('ada@example.com', '123456'),
    ).rejects.toThrow('not configured');
    expect(send).not.toHaveBeenCalled();
  });

  it('also fails for general notification emails that Resend rejects', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    await expect(
      provider().send('user-1', 'Title', 'Body', { email: 'ada@example.com' }),
    ).rejects.toThrow(/Resend rejected the email/);
  });
});

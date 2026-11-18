import { NotificationsService } from './notifications.service';
import { LoggerNotificationProvider } from './providers/logger.provider';
import { SmsNotificationProvider } from './providers/sms.provider';
import { PushNotificationProvider } from './providers/push.provider';
import { ConfigService } from '@nestjs/config';

const mockConfig = {
  get: jest.fn(() => undefined),
} as unknown as ConfigService;

describe('NotificationsService', () => {
  it('sends creditReceived via logger provider', async () => {
    const loggerProvider = new LoggerNotificationProvider();
    const sendSpy = jest.spyOn(loggerProvider, 'send');

    const service = new NotificationsService(
      loggerProvider,
      new SmsNotificationProvider(mockConfig),
      new PushNotificationProvider(mockConfig),
    );

    await service.creditReceived('user-1', 5000n);

    expect(sendSpy).toHaveBeenCalledWith(
      'user-1',
      'Credit received',
      'You received NGN 50.00.',
      undefined,
    );
  });

  it('formats minor units correctly', () => {
    const service = new NotificationsService(
      new LoggerNotificationProvider(),
      new SmsNotificationProvider(mockConfig),
      new PushNotificationProvider(mockConfig),
    );
    const formatMinor = (service as any).formatMinor.bind(service);
    expect(formatMinor(5000n)).toBe('50.00');
    expect(formatMinor(99n)).toBe('0.99');
    expect(formatMinor(0n)).toBe('0.00');
    expect(formatMinor(-100n)).toBe('-1.00');
  });
});

describe('LoggerNotificationProvider', () => {
  it('sends a notification via send method', async () => {
    const provider = new LoggerNotificationProvider();
    const sendSpy = jest.spyOn(provider, 'send');
    await provider.send('user-1', 'Hello', 'Body', { foo: 'bar' });
    expect(sendSpy).toHaveBeenCalledWith('user-1', 'Hello', 'Body', { foo: 'bar' });
  });
});

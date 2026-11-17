import { randomBytes } from 'crypto';
import { validateEnv } from './env.validation';

const secret = 'x'.repeat(40);

describe('validateEnv', () => {
  it('requires a JWT secret in every environment', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('accepts a strong secret in development', () => {
    expect(() => validateEnv({ JWT_SECRET: secret })).not.toThrow();
  });

  it('forbids logging OTPs in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: secret,
        DB_HOST: 'h',
        DB_USER: 'u',
        DB_NAME: 'n',
        OTP_LOG_CODE: 'true',
      }),
    ).toThrow(/OTP_LOG_CODE/);
  });

  it('allows OTP logging outside production', () => {
    expect(() => validateEnv({ JWT_SECRET: secret, OTP_LOG_CODE: 'true' })).not.toThrow();
  });

  it('requires a real 32-byte key once a biometric provider is named', () => {
    expect(() => validateEnv({ JWT_SECRET: secret, BIOMETRIC_PROVIDER: 'acme' })).toThrow(
      /BIOMETRIC_ENCRYPTION_KEY/,
    );
    expect(() =>
      validateEnv({
        JWT_SECRET: secret,
        BIOMETRIC_PROVIDER: 'acme',
        BIOMETRIC_ENCRYPTION_KEY: randomBytes(16).toString('base64'),
      }),
    ).toThrow(/BIOMETRIC_ENCRYPTION_KEY/);
    expect(() =>
      validateEnv({
        JWT_SECRET: secret,
        BIOMETRIC_PROVIDER: 'acme',
        BIOMETRIC_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      }),
    ).not.toThrow();
  });

  it('does not need a biometric key while biometrics are disabled', () => {
    expect(() => validateEnv({ JWT_SECRET: secret })).not.toThrow();
  });
});

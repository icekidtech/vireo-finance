import { randomBytes } from 'crypto';
import { validateEnv as validateEnvRaw } from './env.validation';

/** Most tests are about other settings, so they get a valid PIN_PEPPER unless they set their own. */
const validateEnv = (config: Record<string, unknown>) =>
  validateEnvRaw({ PIN_PEPPER: 'y'.repeat(40), ...config });

const secret = 'x'.repeat(40);
const pepper = 'y'.repeat(40);

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

  it('allows logging OTPs and bodies in production (warned about at startup)', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: secret,
        DB_HOST: 'h',
        DB_USER: 'u',
        DB_NAME: 'n',
        DB_PASSWORD: 'p',
        OTP_LOG_CODE: 'true',
        LOG_HTTP_BODIES: 'true',
        LOG_LLM_PAYLOADS: 'true',
      }),
    ).not.toThrow(/OTP_LOG_CODE|LOG_HTTP_BODIES|LOG_LLM_PAYLOADS/);
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

  it('forbids unverified database TLS in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: secret,
        DB_HOST: 'h',
        DB_USER: 'u',
        DB_PASSWORD: 'p',
        DB_NAME: 'n',
        DB_SSL_INSECURE: 'true',
      }),
    ).toThrow(/DB_SSL_INSECURE/);
  });

  it('requires an explicit database password in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: secret,
        DB_HOST: 'h',
        DB_USER: 'u',
        DB_NAME: 'n',
      }),
    ).toThrow(/DB_PASSWORD/);
  });

  describe('didit provider', () => {
    const base = {
      JWT_SECRET: secret,
      BIOMETRIC_PROVIDER: 'didit',
      BIOMETRIC_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    };

    it('requires an API key and a declared key type', () => {
      expect(() => validateEnv({ ...base, DIDIT_KEY_TYPE: 'live' })).toThrow(/DIDIT_API_KEY/);
      expect(() => validateEnv({ ...base, DIDIT_API_KEY: 'k' })).toThrow(/DIDIT_KEY_TYPE/);
      expect(() =>
        validateEnv({ ...base, DIDIT_API_KEY: 'k', DIDIT_KEY_TYPE: 'live' }),
      ).not.toThrow();
    });

    it('allows a sandbox key in production (the mode is logged at startup)', () => {
      expect(() =>
        validateEnv({
          ...base,
          NODE_ENV: 'production',
          DB_HOST: 'h',
          DB_USER: 'u',
          DB_PASSWORD: 'p',
          DB_NAME: 'n',
          DIDIT_API_KEY: 'k',
          DIDIT_KEY_TYPE: 'sandbox',
        }),
      ).not.toThrow();
    });
  });

  it('rejects biometric thresholds that would make every check pass', () => {
    expect(() => validateEnv({ JWT_SECRET: secret, BIOMETRIC_MIN_MATCH_SCORE: 'abc' })).toThrow(
      /BIOMETRIC_MIN_MATCH_SCORE/,
    );
    expect(() => validateEnv({ JWT_SECRET: secret, BIOMETRIC_MAX_SPOOF_SCORE: '150' })).toThrow(
      /BIOMETRIC_MAX_SPOOF_SCORE/,
    );
    expect(() =>
      validateEnv({
        JWT_SECRET: secret,
        BIOMETRIC_MIN_MATCH_SCORE: '80',
        BIOMETRIC_STEP_UP_AMOUNT_MINOR: '5000000',
      }),
    ).not.toThrow();
  });

  describe('kyc provider', () => {
    const bio = randomBytes(32).toString('base64');
    it('needs its own 32-byte key, distinct from the biometric key', () => {
      const base = {
        JWT_SECRET: secret,
        KYC_PROVIDER: 'didit',
        DIDIT_API_KEY: 'k',
        DIDIT_KEY_TYPE: 'live',
      };
      expect(() => validateEnv(base)).toThrow(/KYC_ENCRYPTION_KEY/);
      expect(() =>
        validateEnv({ ...base, KYC_ENCRYPTION_KEY: bio, BIOMETRIC_ENCRYPTION_KEY: bio }),
      ).toThrow(/must differ/);
      expect(() =>
        validateEnv({ ...base, KYC_ENCRYPTION_KEY: randomBytes(32).toString('base64') }),
      ).not.toThrow();
    });
  });

  describe('document storage', () => {
    const base = {
      JWT_SECRET: secret,
      DOCUMENT_STORAGE: 'b2',
      B2_KEY_ID: 'k',
      B2_APPLICATION_KEY: 'a',
      B2_BUCKET_ID: 'i',
      B2_BUCKET_NAME: 'n',
    };
    it('needs its own 32-byte key and the bucket details', () => {
      expect(() => validateEnv(base)).toThrow(/DOCUMENT_ENCRYPTION_KEY/);
      const key = randomBytes(32).toString('base64');
      expect(() => validateEnv({ ...base, DOCUMENT_ENCRYPTION_KEY: key })).not.toThrow();
      expect(() =>
        validateEnv({ ...base, DOCUMENT_ENCRYPTION_KEY: key, B2_BUCKET_ID: '' }),
      ).toThrow(/B2_BUCKET_ID/);
    });
    it('must not reuse another encryption key', () => {
      const key = randomBytes(32).toString('base64');
      expect(() =>
        validateEnv({ ...base, DOCUMENT_ENCRYPTION_KEY: key, KYC_ENCRYPTION_KEY: key }),
      ).toThrow(/must differ/);
    });
  });

  it('requires a strong PIN pepper that differs from the JWT secret', () => {
    expect(() => validateEnvRaw({ JWT_SECRET: secret })).toThrow(/PIN_PEPPER/);
    expect(() => validateEnvRaw({ JWT_SECRET: secret, PIN_PEPPER: 'short' })).toThrow(/PIN_PEPPER/);
    expect(() => validateEnvRaw({ JWT_SECRET: secret, PIN_PEPPER: secret })).toThrow(/must differ/);
    expect(() => validateEnvRaw({ JWT_SECRET: secret, PIN_PEPPER: pepper })).not.toThrow();
  });
});

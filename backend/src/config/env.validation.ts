import { parseEncryptionKey } from '../common/crypto';

const MIN_JWT_SECRET_LENGTH = 32;
const REQUIRED_IN_PRODUCTION = ['DB_HOST', 'DB_USER', 'DB_NAME'];

/**
 * Fails startup on unsafe configuration rather than running with a weak
 * default. Secrets have no fallback in any environment.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be set to at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (config.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!config[key]) errors.push(`${key} is required in production`);
    }
    if (config.OTP_ECHO_CODE === 'true' || config.OTP_ECHO_CODE === '1') {
      errors.push('OTP_ECHO_CODE must not be enabled in production');
    }
  }

  // Biometrics are off unless a provider is named, and then they need a real key.
  if (typeof config.BIOMETRIC_PROVIDER === 'string' && config.BIOMETRIC_PROVIDER.trim()) {
    try {
      parseEncryptionKey(String(config.BIOMETRIC_ENCRYPTION_KEY ?? ''));
    } catch {
      errors.push('BIOMETRIC_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
  return config;
}

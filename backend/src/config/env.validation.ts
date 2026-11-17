import { parseEncryptionKey } from '../common/crypto';

const MIN_JWT_SECRET_LENGTH = 32;
const REQUIRED_IN_PRODUCTION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

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

  const pepper = typeof config.PIN_PEPPER === 'string' ? config.PIN_PEPPER : '';
  if (pepper.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`PIN_PEPPER must be set to at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (pepper && pepper === jwtSecret) {
    errors.push('PIN_PEPPER must differ from JWT_SECRET');
  }

  if (config.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!config[key]) errors.push(`${key} is required in production`);
    }
    if (config.DB_SSL_INSECURE === 'true') {
      errors.push(
        'DB_SSL_INSECURE must not be enabled in production (certificates must be verified)',
      );
    }
    for (const flag of ['LOG_HTTP_BODIES', 'LOG_LLM_PAYLOADS']) {
      if (config[flag] === 'true' || config[flag] === '1') {
        errors.push(`${flag} must not be enabled in production (logs would contain personal data)`);
      }
    }
    if (config.OTP_LOG_CODE === 'true' || config.OTP_LOG_CODE === '1') {
      errors.push('OTP_LOG_CODE must not be enabled in production');
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

  // Decision thresholds: a non-numeric value would make every comparison false
  // and approve everything, so reject anything that is not a sane integer.
  for (const name of [
    'BIOMETRIC_MIN_MATCH_SCORE',
    'BIOMETRIC_STEP_UP_MATCH_SCORE',
    'BIOMETRIC_MIN_LIVENESS_SCORE',
    'BIOMETRIC_MAX_SPOOF_SCORE',
    'BIOMETRIC_MIN_QUALITY_SCORE',
  ]) {
    const raw = config[name];
    if (raw === undefined || raw === '') continue;
    if (!/^\d{1,3}$/.test(String(raw)) || Number(raw) > 100) {
      errors.push(`${name} must be an integer from 0 to 100`);
    }
  }
  const stepUpAmount = config.BIOMETRIC_STEP_UP_AMOUNT_MINOR;
  if (
    stepUpAmount !== undefined &&
    stepUpAmount !== '' &&
    !/^\d{1,15}$/.test(String(stepUpAmount))
  ) {
    errors.push('BIOMETRIC_STEP_UP_AMOUNT_MINOR must be a non-negative integer (minor units)');
  }

  if (typeof config.KYC_PROVIDER === 'string' && config.KYC_PROVIDER.trim()) {
    try {
      parseEncryptionKey(String(config.KYC_ENCRYPTION_KEY ?? ''));
    } catch {
      errors.push('KYC_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
    }
    if (
      config.KYC_ENCRYPTION_KEY &&
      config.KYC_ENCRYPTION_KEY === config.BIOMETRIC_ENCRYPTION_KEY
    ) {
      errors.push('KYC_ENCRYPTION_KEY must differ from BIOMETRIC_ENCRYPTION_KEY');
    }
  }

  if (typeof config.DOCUMENT_STORAGE === 'string' && config.DOCUMENT_STORAGE.trim()) {
    try {
      parseEncryptionKey(String(config.DOCUMENT_ENCRYPTION_KEY ?? ''));
    } catch {
      errors.push('DOCUMENT_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
    }
    const reused = ['BIOMETRIC_ENCRYPTION_KEY', 'KYC_ENCRYPTION_KEY'].some(
      (other) => config[other] && config[other] === config.DOCUMENT_ENCRYPTION_KEY,
    );
    if (reused) {
      errors.push('DOCUMENT_ENCRYPTION_KEY must differ from the biometric and KYC keys');
    }
    if (config.DOCUMENT_STORAGE.trim().toLowerCase() === 'b2') {
      for (const name of ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_ID', 'B2_BUCKET_NAME']) {
        if (!String(config[name] ?? '').trim())
          errors.push(`${name} is required when DOCUMENT_STORAGE=b2`);
      }
    }
  }

  const usesDidit = ['BIOMETRIC_PROVIDER', 'KYC_PROVIDER'].some(
    (name) =>
      String(config[name] ?? '')
        .trim()
        .toLowerCase() === 'didit',
  );
  if (usesDidit) {
    if (!String(config.DIDIT_API_KEY ?? '').trim()) {
      errors.push('DIDIT_API_KEY is required when a provider is set to didit');
    }
    const keyType = String(config.DIDIT_KEY_TYPE ?? '')
      .trim()
      .toLowerCase();
    if (keyType !== 'live' && keyType !== 'sandbox') {
      errors.push('DIDIT_KEY_TYPE must be "live" or "sandbox"');
    }
    // Didit sandbox keys return a canned "Approved" for every image.
    if (config.NODE_ENV === 'production' && keyType === 'sandbox') {
      errors.push(
        'DIDIT_KEY_TYPE=sandbox is not allowed in production (sandbox approves every face)',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
  return config;
}

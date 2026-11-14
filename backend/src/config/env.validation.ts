const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  if (config.NODE_ENV === 'production') {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !config[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
  return config;
}

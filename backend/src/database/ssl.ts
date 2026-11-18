/** The subset of TLS options this app uses; assignable to the pg driver's `ssl`. */
export interface DbSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

interface SslEnv {
  DB_SSL?: string;
  DB_SSL_CA?: string;
  DB_SSL_INSECURE?: string;
}

/**
 * Postgres TLS settings.
 *
 *  - DB_SSL unset/false  -> no TLS (local development).
 *  - DB_SSL=true         -> TLS with the server certificate VERIFIED against the
 *                           system roots, or against DB_SSL_CA when your provider
 *                           uses its own CA (PEM text, or the PEM base64-encoded).
 *  - DB_SSL_INSECURE=true-> TLS without verification, for local self-signed
 *                           databases only. Startup validation rejects it in
 *                           production because it allows man-in-the-middle attacks.
 */
export function resolveDbSsl(env: SslEnv): false | DbSslOptions {
  if (env.DB_SSL !== 'true') {
    return false;
  }
  if (env.DB_SSL_INSECURE === 'true') {
    return { rejectUnauthorized: false };
  }

  const raw = env.DB_SSL_CA?.trim();
  if (!raw) {
    return { rejectUnauthorized: true };
  }

  // Env files often flatten newlines, so accept literal "\n" and base64 too.
  const pem = raw.includes('-----BEGIN')
    ? raw.replace(/\\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8');
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('DB_SSL_CA must be a PEM certificate (or a base64-encoded PEM certificate)');
  }
  return { rejectUnauthorized: true, ca: pem };
}

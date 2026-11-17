import { resolveDbSsl } from './ssl';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBdummy\n-----END CERTIFICATE-----';

describe('resolveDbSsl', () => {
  it('is off unless DB_SSL=true', () => {
    expect(resolveDbSsl({})).toBe(false);
    expect(resolveDbSsl({ DB_SSL: 'false' })).toBe(false);
  });

  it('verifies the server certificate by default', () => {
    expect(resolveDbSsl({ DB_SSL: 'true' })).toEqual({ rejectUnauthorized: true });
  });

  it('trusts a custom CA given as PEM, including env-flattened newlines', () => {
    expect(resolveDbSsl({ DB_SSL: 'true', DB_SSL_CA: PEM })).toEqual({
      rejectUnauthorized: true,
      ca: PEM,
    });
    expect(resolveDbSsl({ DB_SSL: 'true', DB_SSL_CA: PEM.replace(/\n/g, '\\n') })).toEqual({
      rejectUnauthorized: true,
      ca: PEM,
    });
  });

  it('accepts a base64-encoded CA', () => {
    const b64 = Buffer.from(PEM).toString('base64');
    expect(resolveDbSsl({ DB_SSL: 'true', DB_SSL_CA: b64 })).toEqual({
      rejectUnauthorized: true,
      ca: PEM,
    });
  });

  it('rejects a CA value that is not a certificate', () => {
    expect(() => resolveDbSsl({ DB_SSL: 'true', DB_SSL_CA: 'not-a-cert' })).toThrow(/PEM/);
  });

  it('only skips verification when explicitly told to', () => {
    expect(resolveDbSsl({ DB_SSL: 'true', DB_SSL_INSECURE: 'true' })).toEqual({
      rejectUnauthorized: false,
    });
  });
});

import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { httpLogger } from './http-logger.middleware';
import { redactForLog, redactUrl } from './redact';

describe('redactForLog (bank ids)', () => {
  it('keeps bank ids readable but still hides one-time codes', () => {
    const out = redactForLog({
      bankCode: 'e73d306e-843a-448b-9b7f-128549ff8945',
      code: '123456',
    }) as Record<string, unknown>;
    expect(out.bankCode).toBe('e73d306e-843a-448b-9b7f-128549ff8945');
    expect(out.code).toBe('[redacted]');
  });
});

describe('redactForLog (identity data)', () => {
  it('never lets BVNs, NINs, selfies, PINs, birth dates or account numbers reach a log', () => {
    const out = redactForLog({
      bvn: '22652863774',
      nin: '10987654321',
      selfie: 'data:image/png;base64,AAAA',
      pin: '4827',
      currentPin: '1111',
      dateOfBirth: '2003-12-16',
      address: '12 Allen Avenue',
      accountNumber: '0123456789',
      firstName: 'Ada',
    }) as Record<string, unknown>;
    const text = JSON.stringify(out);
    for (const secret of [
      '22652863774',
      '10987654321',
      'AAAA',
      '4827',
      '1111',
      '2003-12-16',
      'Allen',
      '0123456789',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(out.firstName).toBe('Ada');
  });
});

describe('redactForLog', () => {
  it('replaces sensitive keys at any depth', () => {
    const out = redactForLog({
      phone: '+2348012345678',
      code: '123456',
      nested: { signature: 'abc', authorization: 'Bearer x', ok: 1 },
      biometricSample: 'A'.repeat(5000),
    }) as Record<string, any>;
    expect(out.phone).toBe('+2348012345678');
    expect(out.code).toBe('[redacted]');
    expect(out.nested.signature).toBe('[redacted]');
    expect(out.nested.authorization).toBe('[redacted]');
    expect(out.nested.ok).toBe(1);
    expect(out.biometricSample).toBe('[redacted]');
  });

  it('truncates long strings and large arrays', () => {
    const out = redactForLog({
      note: 'x'.repeat(1000),
      items: Array.from({ length: 30 }, (_, i) => i),
    }) as any;
    expect(out.note.length).toBeLessThan(260);
    expect(out.items).toHaveLength(11);
  });

  it('redacts sensitive query parameters', () => {
    expect(redactUrl('/api/v1/x?limit=5&token=secret&code=123456')).toBe(
      '/api/v1/x?limit=5&token=[redacted]&code=[redacted]',
    );
    expect(redactUrl('/api/v1/x')).toBe('/api/v1/x');
  });
});

function run(opts: {
  status: number;
  body?: unknown;
  reqBody?: unknown;
  logBodies?: boolean;
  user?: string;
}) {
  const lines: Record<string, string[]> = { log: [], warn: [], error: [] };
  const spies = (['log', 'warn', 'error'] as const).map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation(((msg: unknown) => {
      lines[level].push(String(msg));
    }) as never),
  );
  const res: any = Object.assign(new EventEmitter(), {
    statusCode: opts.status,
    send: jest.fn((b: unknown) => b),
  });
  const req: any = {
    method: 'POST',
    originalUrl: '/api/v1/auth/otp/verify?code=999999',
    ip: '::1',
    headers: { authorization: 'Bearer SECRET-TOKEN' },
    body: opts.reqBody,
    user: opts.user ? { userId: opts.user } : undefined,
  };
  httpLogger({ logBodies: opts.logBodies })(req, res, () => undefined);
  if (opts.body !== undefined) res.send(JSON.stringify(opts.body));
  res.emit('finish');
  spies.forEach((s) => s.mockRestore());
  return lines;
}

describe('httpLogger', () => {
  it('logs method, path, status, duration and caller for a success', () => {
    const l = run({ status: 200, user: 'user-1' });
    expect(l.log).toHaveLength(1);
    expect(l.log[0]).toMatch(
      /POST \/api\/v1\/auth\/otp\/verify\?code=\[redacted\] -> 200 \d+ms user=user-1/,
    );
  });

  it('logs a 4xx as a warning including the API error message', () => {
    const l = run({ status: 400, body: { message: ['phone must be valid', 'name too short'] } });
    expect(l.warn[0]).toContain('-> 400');
    expect(l.warn[0]).toContain('error="phone must be valid; name too short"');
    expect(l.warn[0]).toContain('user=anon');
  });

  it('logs a 5xx as an error', () => {
    const l = run({ status: 500, body: { message: 'Internal server error' } });
    expect(l.error[0]).toContain('-> 500');
  });

  it('never logs the authorization header or request bodies by default', () => {
    const l = run({ status: 200, reqBody: { code: '123456', name: 'Ada' } });
    const all = [...l.log, ...l.warn, ...l.error].join('\n');
    expect(all).not.toContain('SECRET-TOKEN');
    expect(all).not.toContain('123456');
    expect(all).not.toContain('Ada');
  });

  it('logs redacted bodies only when enabled', () => {
    const l = run({ status: 200, logBodies: true, reqBody: { code: '123456', name: 'Ada' } });
    expect(l.log[0]).toContain('"name":"Ada"');
    expect(l.log[0]).toContain('"code":"[redacted]"');
    expect(l.log[0]).not.toContain('123456');
  });
});

describe('httpLogger (abandoned requests)', () => {
  function abandoned() {
    const lines: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(((msg: unknown) => {
      lines.push(String(msg));
    }) as never);
    const res: any = Object.assign(new EventEmitter(), { statusCode: 200, send: jest.fn() });
    const req: any = {
      method: 'POST',
      originalUrl: '/api/v1/biometrics/identify',
      ip: '::1',
      headers: {},
      user: { userId: 'u1' },
    };
    httpLogger()(req, res, () => undefined);
    return { res, lines, done: () => spy.mockRestore() };
  }

  it('logs a request the client abandons before the reply', () => {
    const { res, lines, done } = abandoned();
    res.emit('close');
    done();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/POST \/api\/v1\/biometrics\/identify -> ABORTED .* user=u1/);
  });

  it('does not report a normally finished request as abandoned', () => {
    const { res, lines, done } = abandoned();
    res.emit('finish');
    res.emit('close');
    done();
    expect(lines).toHaveLength(0);
  });
});

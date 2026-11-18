import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ServerErrorFilter } from './server-error.filter';

function run(error: unknown) {
  const base = jest
    .spyOn(BaseExceptionFilter.prototype, 'catch')
    .mockImplementation(() => undefined);
  const json = jest.fn();
  const res = { status: jest.fn(() => ({ json })) };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/x' }),
      getResponse: () => res,
    }),
  } as never;
  const filter = new ServerErrorFilter({ reply: jest.fn(), isHeadersSent: jest.fn() } as never);
  jest
    .spyOn((filter as never as { log: { error: () => void } }).log, 'error')
    .mockImplementation(() => undefined);
  filter.catch(error, host);
  return { json, res, base };
}

describe('ServerErrorFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('hides vendor text on 502', () => {
    const { json } = run(new BadGatewayException('Paga collect banks failed (500): system error'));
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('Paga');
    expect(json.mock.calls[0][0].message).toMatch(/temporarily unavailable/);
  });

  it('hides internal error text on unexpected exceptions', () => {
    const { json, res } = run(new Error('relation "users" does not exist'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('relation');
  });

  it('passes 4xx messages through', () => {
    const { json, base } = run(new BadRequestException('Unsupported bank'));
    expect(json).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalled(); // delegated to Nest's default handler
  });

  it('keeps deliberate 503 messages', () => {
    const { json, base } = run(new ServiceUnavailableException('Biometrics not configured'));
    expect(json).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalled();
  });
});

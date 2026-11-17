import { createHash } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { B2Storage } from './b2.storage';

const cfg = {
  keyId: 'kid',
  applicationKey: 'secret',
  bucketId: 'bkt',
  bucketName: 'my-bucket',
  timeoutMs: 1000,
};
const res = (body: unknown, status = 200) =>
  ({
    ok: status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => Buffer.from(String(body)),
  }) as unknown as Response;

const authOk = res({
  authorizationToken: 'AUTH',
  apiInfo: { storageApi: { apiUrl: 'https://api.b2.test', downloadUrl: 'https://dl.b2.test' } },
});

describe('B2Storage', () => {
  let f: jest.SpyInstance;
  let storage: B2Storage;
  beforeEach(() => {
    f = jest.spyOn(global, 'fetch');
    storage = new B2Storage(cfg);
    jest.spyOn((storage as any).logger, 'error').mockImplementation(() => undefined);
    jest.spyOn((storage as any).logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('authorizes with basic credentials, then uploads with a checksum and the encoded file name', async () => {
    f.mockResolvedValueOnce(authOk)
      .mockResolvedValueOnce(res({ uploadUrl: 'https://pod.b2.test/up', authorizationToken: 'UP' }))
      .mockResolvedValueOnce(res({ fileId: 'FID' }));
    const data = Buffer.from('ciphertext');
    await expect(storage.put('docs/u 1/abc', data, 'application/octet-stream')).resolves.toEqual({
      fileId: 'FID',
    });

    const [authUrl, authInit] = f.mock.calls[0] as [string, RequestInit];
    expect(authUrl).toBe('https://api.backblazeb2.com/b2api/v4/b2_authorize_account');
    expect((authInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('kid:secret').toString('base64')}`,
    );
    const [slotUrl, slotInit] = f.mock.calls[1] as [string, RequestInit];
    expect(slotUrl).toBe('https://api.b2.test/b2api/v4/b2_get_upload_url');
    expect(JSON.parse(slotInit.body as string)).toEqual({ bucketId: 'bkt' });
    const [upUrl, upInit] = f.mock.calls[2] as [string, RequestInit];
    const h = upInit.headers as Record<string, string>;
    expect(upUrl).toBe('https://pod.b2.test/up');
    expect(h.Authorization).toBe('UP');
    expect(h['X-Bz-File-Name']).toBe('docs/u%201/abc');
    expect(h['X-Bz-Content-Sha1']).toBe(createHash('sha1').update(data).digest('hex'));
    expect(h['Content-Length']).toBe(String(data.length));
  });

  it('retries an upload once with fresh credentials after an expired token', async () => {
    f.mockResolvedValueOnce(authOk)
      .mockResolvedValueOnce(res({ uploadUrl: 'https://pod/1', authorizationToken: 'U1' }))
      .mockResolvedValueOnce(res({}, 401))
      .mockResolvedValueOnce(authOk)
      .mockResolvedValueOnce(res({ uploadUrl: 'https://pod/2', authorizationToken: 'U2' }))
      .mockResolvedValueOnce(res({ fileId: 'OK' }));
    await expect(storage.put('k', Buffer.from('x'), 't')).resolves.toEqual({ fileId: 'OK' });
  });

  it('downloads from the private bucket URL with the account token', async () => {
    f.mockResolvedValueOnce(authOk).mockResolvedValueOnce(res('hello'));
    expect((await storage.get('docs/u1/abc')).toString()).toBe('hello');
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://dl.b2.test/file/my-bucket/docs/u1/abc');
    expect((init.headers as Record<string, string>).Authorization).toBe('AUTH');
  });

  it('deletes by name and id, treating "already gone" as success', async () => {
    f.mockResolvedValueOnce(authOk).mockResolvedValueOnce(res({}, 400));
    await expect(storage.delete('docs/u1/abc', 'FID')).resolves.toBeUndefined();
    expect(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      fileName: 'docs/u1/abc',
      fileId: 'FID',
    });
  });

  it('hides storage errors behind a generic message', async () => {
    f.mockResolvedValueOnce(res({}, 500));
    await expect(storage.get('k')).rejects.toThrow(
      new ServiceUnavailableException('Document storage is not available right now'),
    );
    f.mockRejectedValueOnce(new Error('ECONNRESET b2 secret detail'));
    const err = await new B2Storage(cfg).get('k').catch((e: Error) => e);
    expect((err as Error).message).not.toContain('ECONNRESET');
  });
});

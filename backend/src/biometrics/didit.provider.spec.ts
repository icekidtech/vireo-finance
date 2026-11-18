import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BiometricType } from './biometric-enrollment.entity';
import { DiditProvider } from './didit.provider';

const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');
const REF = Buffer.from('reference-jpeg').toString('base64');

function reply(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as Response;
}
const live = (over: Record<string, unknown> = {}) =>
  reply({ liveness: { status: 'Approved', score: 96, face_quality: 88, warnings: [], ...over } });
const match = (score: number | null) => reply({ face_match: { status: 'Approved', score } });

describe('DiditProvider', () => {
  let fetchMock: jest.SpyInstance;
  const provider = new DiditProvider({
    apiKey: 'k',
    baseUrl: 'https://didit.test/v3',
    timeoutMs: 1000,
  });

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    for (const m of ['log', 'error'])
      jest.spyOn((provider as any).logger, m).mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('does not let Didit keep images, and sends the key only as a header', async () => {
    fetchMock.mockResolvedValueOnce(live());
    await provider.enroll(BiometricType.FACE, IMG);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://didit.test/v3/passive-liveness/');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect((init.body as FormData).get('save_api_request')).toBe('false');
  });

  it('enrolls a live face, returning the image as the template', async () => {
    fetchMock.mockResolvedValueOnce(live());
    const r = await provider.enroll(BiometricType.FACE, `data:image/jpeg;base64,${IMG}`);
    expect(r.template).toBe(IMG);
    expect(r.qualityScore).toBe(88);
  });

  it('refuses to enroll a face that fails liveness', async () => {
    fetchMock.mockResolvedValueOnce(live({ status: 'Declined', score: 10 }));
    await expect(provider.enroll(BiometricType.FACE, IMG)).rejects.toThrow(BadRequestException);
  });

  it('matches a live sample against every stored reference and keeps the best', async () => {
    fetchMock
      .mockResolvedValueOnce(live())
      .mockResolvedValueOnce(match(40))
      .mockResolvedValueOnce(match(93));
    const r = await provider.verify(BiometricType.FACE, IMG, [REF, REF]);
    expect(r.matchScore).toBe(93);
    expect(r.matchedTemplateIndex).toBe(1);
    expect(r.livenessScore).toBe(96);
    expect(r.spoofScore).toBe(4);
  });

  it('never matches a presentation attack', async () => {
    fetchMock.mockResolvedValueOnce(
      live({ status: 'Declined', score: 5, warnings: [{ risk: 'LIVENESS_FACE_ATTACK' }] }),
    );
    const r = await provider.verify(BiometricType.FACE, IMG, [REF]);
    expect(r.matchScore).toBe(0);
    expect(r.spoofScore).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects frames with more than one face', async () => {
    fetchMock.mockResolvedValueOnce(live({ warnings: [{ risk: 'MULTIPLE_FACES_DETECTED' }] }));
    const r = await provider.verify(BiometricType.FACE, IMG, [REF]);
    expect(r.matchScore).toBe(0);
    expect(r.qualityScore).toBe(0);
  });

  it('fails closed, without leaking vendor text, when Didit errors', async () => {
    fetchMock.mockResolvedValueOnce(reply({ detail: 'secret vendor text' }, 500));
    await expect(provider.verify(BiometricType.FACE, IMG, [REF])).rejects.toThrow(
      ServiceUnavailableException,
    );
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(provider.verify(BiometricType.FACE, IMG, [REF])).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects voice, bad base64 and oversized images', async () => {
    await expect(provider.enroll(BiometricType.VOICE, IMG)).rejects.toThrow(BadRequestException);
    await expect(provider.enroll(BiometricType.FACE, '!!not base64!!')).rejects.toThrow(
      BadRequestException,
    );
    const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    await expect(provider.enroll(BiometricType.FACE, big)).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

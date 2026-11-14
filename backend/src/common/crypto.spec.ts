import {
  sha256Hex,
  sha512Hex,
  randomNonce,
  hmacSha256Hex,
  safeEqual,
  canonicalJson,
  verifyDeviceSignature,
} from './crypto';

describe('sha256Hex', () => {
  it('produces a deterministic 64-char hex string', () => {
    const a = sha256Hex('hello');
    const b = sha256Hex('hello');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(a)).toBe(true);
  });

  it('differs for different inputs', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});

describe('sha512Hex', () => {
  it('produces a deterministic 128-char hex string', () => {
    const a = sha512Hex('hello');
    const b = sha512Hex('hello');
    expect(a).toBe(b);
    expect(a).toHaveLength(128);
  });
});

describe('randomNonce', () => {
  it('produces a 64-char hex string', () => {
    const n = randomNonce();
    expect(n).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(n)).toBe(true);
  });

  it('produces unique values', () => {
    expect(randomNonce()).not.toBe(randomNonce());
  });
});

describe('hmacSha256Hex', () => {
  it('produces deterministic output', () => {
    const a = hmacSha256Hex('secret', 'payload');
    const b = hmacSha256Hex('secret', 'payload');
    expect(a).toBe(b);
  });

  it('differs with different keys or payloads', () => {
    expect(hmacSha256Hex('k1', 'p')).not.toBe(hmacSha256Hex('k2', 'p'));
    expect(hmacSha256Hex('k', 'p1')).not.toBe(hmacSha256Hex('k', 'p2'));
  });
});

describe('safeEqual', () => {
  it('returns true for equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: { b: 1, a: 2 }, y: 3 })).toBe('{"y":3,"z":{"a":2,"b":1}}');
  });

  it('is deterministic regardless of input key order', () => {
    const a = canonicalJson({ c: 3, a: 1, b: 2 });
    const b = canonicalJson({ b: 2, c: 3, a: 1 });
    expect(a).toBe(b);
  });
});

describe('verifyDeviceSignature', () => {
  it('returns false for invalid inputs', () => {
    expect(
      verifyDeviceSignature({
        algorithm: 'ed25519' as any,
        publicKeyBase64: 'notakey',
        data: Buffer.from('data'),
        signatureBase64: 'notasig',
      }),
    ).toBe(false);
  });
});

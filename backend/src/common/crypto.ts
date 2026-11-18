import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from 'crypto';
import { SignatureAlgorithm } from './enums';

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function sha512Hex(input: string | Buffer): string {
  return createHash('sha512').update(input).digest('hex');
}

export function randomNonce(): string {
  return randomBytes(32).toString('hex');
}

export function hmacSha256Base64(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64');
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * Deterministic JSON (sorted keys, recursively) so a payload always hashes the
 * same way server-side. Clients never re-implement this: they sign the
 * server-provided payloadHash bytes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export interface VerifySignatureInput {
  algorithm: SignatureAlgorithm;
  publicKeyBase64: string;
  data: Buffer;
  signatureBase64: string;
}

export function verifyDeviceSignature(input: VerifySignatureInput): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(input.publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const signature = Buffer.from(input.signatureBase64, 'base64');
    if (input.algorithm === SignatureAlgorithm.ED25519) {
      return verify(null, input.data, key, signature);
    }
    return verify('sha256', input.data, { key, dsaEncoding: 'der' }, signature);
  } catch {
    return false;
  }
}

const EMBEDDING_FORMAT = 'v1';
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;

/** Parses a base64 AES-256 key; throws unless it decodes to exactly 32 bytes. */
export function parseEncryptionKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== AES_KEY_BYTES) {
    throw new Error('Encryption key must be 32 bytes, base64-encoded');
  }
  return key;
}

/**
 * Encrypts a biometric template with AES-256-GCM before it is stored.
 * `context` (the owning user's id) is bound as authenticated data, so a
 * ciphertext copied onto another user's row fails to decrypt.
 * Output: `v1:<iv>:<tag>:<ciphertext>` (base64 parts).
 */
export function encryptEmbedding(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    EMBEDDING_FORMAT,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Reverses encryptEmbedding. Throws on a wrong key/context, tampering, or an unknown format. */
export function decryptEmbedding(stored: string, key: Buffer, context: string): string {
  const [format, iv, tag, ciphertext] = stored.split(':');
  if (format !== EMBEDDING_FORMAT || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised biometric template format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

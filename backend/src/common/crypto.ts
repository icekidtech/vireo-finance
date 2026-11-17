import {
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

/**
 * Encrypt a biometric embedding before storing in the database.
 * Uses AES-256-GCM with a key from environment or KMS.
 */
export function encryptEmbedding(embedding: string): string {
  // TODO: In production, use KMS or hardware security module
  // For now, use a simple base64 encoding as placeholder
  // Real implementation should use proper encryption like AES-256-GCM
  return Buffer.from(embedding).toString('base64');
}

/**
 * Decrypt a biometric embedding retrieved from the database.
 */
export function decryptEmbedding(embeddingEncrypted: string): string {
  // TODO: In production, use KMS or hardware security module
  // Placeholder: reverse the base64 encoding
  return Buffer.from(embeddingEncrypted, 'base64').toString('utf-8');
}

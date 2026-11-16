import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { ed25519 } from '@noble/curves/ed25519';
import { Platform } from 'react-native';
import { api } from '../api';

const PRIVATE_KEY_STORE = 'vireo.devicePrivateKey';
const DEVICE_ID_STORE = 'vireo.deviceId';

/**
 * SubjectPublicKeyInfo prefix for Ed25519 (OID 1.3.101.112). The backend parses
 * SPKI DER, so the raw 32-byte public key is wrapped instead of sent bare.
 */
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export interface SignedApproval {
  signature: string;
  /** False when the device has no enrolled biometrics (emulator / dev build). */
  biometric: boolean;
}

/**
 * Returns the registered device id, generating and registering a key on first
 * use. A new key always forces a new registration so the backend never holds a
 * public key that no longer matches the private key on this phone.
 */
export async function ensureDeviceRegistered(): Promise<string> {
  const privateKeyHex = (await SecureStore.getItemAsync(PRIVATE_KEY_STORE)) ?? (await createAndStoreKey());
  const storedDeviceId = await SecureStore.getItemAsync(DEVICE_ID_STORE);

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const publicKey = ed25519.getPublicKey(hexToBytes(privateKeyHex));
  const spkiDer = hexToBytes(ED25519_SPKI_PREFIX + bytesToHex(publicKey));
  const device = await api.registerDevice(
    bytesToBase64(spkiDer),
    Platform.OS === 'ios' ? 'ios' : 'android',
    'ed25519',
  );
  const deviceId: string = device.id;
  await SecureStore.setItemAsync(DEVICE_ID_STORE, deviceId);
  return deviceId;
}

/** An Ed25519 private key is 32 random bytes, taken from the platform CSPRNG. */
async function createAndStoreKey(): Promise<string> {
  const privateKeyHex = bytesToHex(Crypto.getRandomValues(new Uint8Array(32)));
  await SecureStore.setItemAsync(PRIVATE_KEY_STORE, privateKeyHex, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  // Drop any registration belonging to a key this phone no longer holds.
  await SecureStore.deleteItemAsync(DEVICE_ID_STORE);
  return privateKeyHex;
}

export async function getDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_STORE);
}

/**
 * Asks for the phone's biometric, then signs the challenge. The server signs
 * nothing itself: it hands us `payloadHash` and we sign those exact bytes, so
 * the client never re-implements canonical JSON.
 */
export async function approveAndSign(payloadHash: string): Promise<SignedApproval> {
  const biometric = await requestBiometricApproval();
  const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  if (!privateKeyHex) {
    throw new Error('No device key on this phone. Register this device first.');
  }
  const signature = ed25519.sign(asciiBytes(payloadHash), hexToBytes(privateKeyHex));
  return { signature: bytesToBase64(signature), biometric };
}

async function requestBiometricApproval(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) {
    // Dev fallback: no biometric hardware to gate the key with. The caller
    // surfaces this so an un-gated approval is never silent.
    return false;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Approve this payment',
    cancelLabel: 'Cancel',
  });
  if (!result.success) {
    throw new Error('Approval cancelled');
  }
  return true;
}

/** payloadHash is hex ASCII, so byte-per-character is exact and needs no TextEncoder. */
function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** React Native has no Buffer, so base64 is encoded here rather than polyfilled. */
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}
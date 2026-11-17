import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Secret storage. On iOS/Android this is the OS keychain/keystore. The browser
 * has no equivalent, so web (a testing convenience only) uses sessionStorage:
 * it is cleared when the tab closes and is NOT hardware-protected, so never
 * treat a web session's stored key as equivalent to a phone's.
 */
const isWeb = Platform.OS === 'web';

function webStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return webStore()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string, opts?: { deviceOnly?: boolean }): Promise<void> {
  if (isWeb) {
    webStore()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(
    key,
    value,
    opts?.deviceOnly ? { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } : undefined,
  );
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    webStore()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

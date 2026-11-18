import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Keeps where the user was, and the (non-sensitive) things they had typed, across a
 * page reload on web. It uses sessionStorage, the same store as the web session, so it is
 * tab-scoped, disappears when the tab closes, and is wiped at sign-out.
 *
 * NEVER put secrets here: no BVN, NIN, PIN, one-time code, selfie or document.
 * On phones the app keeps its state in memory and this is a no-op.
 */
const NAV_KEY = 'vireo.nav';
const DRAFT_PREFIX = 'vireo.draft.';

function store(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | undefined {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: losing a draft is fine.
  }
}

export function loadNavState<T>(): T | undefined {
  return read<T>(NAV_KEY);
}

export function saveNavState(state: unknown): void {
  write(NAV_KEY, state);
}

/** Forgets the saved screen and every saved draft (call at sign-out). */
export function clearSessionState(): void {
  const s = store();
  if (!s) return;
  const keys: string[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const k = s.key(i);
    if (k && (k === NAV_KEY || k.startsWith(DRAFT_PREFIX))) keys.push(k);
  }
  keys.forEach((k) => s.removeItem(k));
}

/** Forgets the saved drafts whose key starts with `prefix` (e.g. when a form is submitted). */
export function clearDrafts(prefix: string): void {
  const s = store();
  if (!s) return;
  const keys: string[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const k = s.key(i);
    if (k && k.startsWith(DRAFT_PREFIX + prefix)) keys.push(k);
  }
  keys.forEach((k) => s.removeItem(k));
}

export function loadDraft<T>(key: string): T | undefined {
  return read<T>(DRAFT_PREFIX + key);
}

export function saveDraft(key: string, value: unknown): void {
  write(DRAFT_PREFIX + key, value);
}

/** Like useState, but the value survives a page reload on web. Only for non-sensitive input. */
export function usePersistedState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => loadDraft<T>(key) ?? initial);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        saveDraft(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

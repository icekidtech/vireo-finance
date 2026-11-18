import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import * as storage from '../lib/storage';
import { clearSessionState } from '../lib/sessionState';
import { api } from '../api';
import type { PublicUser } from '../types';

const TOKEN_KEY = 'vireo.accessToken';
const USER_KEY = 'vireo.user';

interface AuthContextType {
  token: string | null;
  user: PublicUser | null;
  isLoading: boolean;
  login: (token: string, user: PublicUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          storage.getItem(TOKEN_KEY),
          storage.getItem(USER_KEY),
        ]);
        if (cancelled) return;
        if (storedToken) {
          api.setToken(storedToken);
          setTokenState(storedToken);
        }
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch {
        // A corrupt or unavailable keychain must not trap the app on the splash.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((nextToken: string, nextUser: PublicUser) => {
    setTokenState(nextToken);
    setUser(nextUser);
    api.setToken(nextToken);
    void storage.setItem(TOKEN_KEY, nextToken);
    void storage.setItem(USER_KEY, JSON.stringify(nextUser ?? null));
  }, []);

  const logout = useCallback(() => {
    clearSessionState(); // forget the saved screen and drafts so the next sign-in starts clean
    setTokenState(null);
    setUser(null);
    api.clearToken();
    void storage.deleteItem(TOKEN_KEY);
    void storage.deleteItem(USER_KEY);
  }, []);

  // A 401 from any call (expired/revoked token) signs the user out.
  useEffect(() => {
    api.setUnauthorizedHandler(logout);
    return () => api.setUnauthorizedHandler(null);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
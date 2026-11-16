import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api';

const TOKEN_KEY = 'vireo.accessToken';
const USER_KEY = 'vireo.user';

interface AuthContextType {
  token: string | null;
  user: any | null;
  isLoading: boolean;
  login: (token: string, user: any) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
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

  const login = useCallback((nextToken: string, nextUser: any) => {
    setTokenState(nextToken);
    setUser(nextUser);
    api.setToken(nextToken);
    void SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(nextUser ?? null));
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    setUser(null);
    api.clearToken();
    void SecureStore.deleteItemAsync(TOKEN_KEY);
    void SecureStore.deleteItemAsync(USER_KEY);
  }, []);

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
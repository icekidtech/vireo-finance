import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { api } from './api';

interface AuthContextType {
  token: string | null;
  user: any | null;
  isLoading: boolean;
  login: (token: string, user: any) => void;
  logout: () => void;
  setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback((token: string, user: any) => {
    setTokenState(token);
    setUser(user);
    api.setToken(token);
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    setUser(null);
    api.clearToken();
  }, []);

  const setToken = useCallback((token: string | null) => {
    setTokenState(token);
    if (token) {
      api.setToken(token);
    } else {
      api.clearToken();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, setToken }}>
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

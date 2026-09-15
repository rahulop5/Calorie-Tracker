import { useQueryClient } from '@tanstack/react-query';
import type { LoginInput, PublicUser, RegisterInput } from '@tracker/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onUnauthorized, restoreSession, setAccessToken } from '@/lib/api/client';
import { authApi } from '@/lib/api/resources';

type AuthContextValue = {
  user: PublicUser | null;
  /** True until the refresh cookie has been checked on first load. */
  restoring: boolean;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // The access token lives 15 minutes, but the refresh cookie lives 30 days, so
  // a reload restores the session instead of bouncing the user to the login page.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const refreshed = await restoreSession();

      if (cancelled) {
        return;
      }

      if (refreshed) {
        try {
          setUser(await authApi.me());
        } catch {
          clearSession();
        }
      }

      setRestoring(false);
    }

    void restore();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // A refresh that fails mid-session means the session is gone for good.
  useEffect(() => {
    onUnauthorized(clearSession);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      restoring,
      async register(input) {
        const session = await authApi.register(input);
        setAccessToken(session.accessToken);
        setUser(session.user);
      },
      async login(input) {
        const session = await authApi.login(input);
        setAccessToken(session.accessToken);
        setUser(session.user);
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          // Clear locally even if the call failed, so the UI cannot get stuck.
          clearSession();
        }
      },
    }),
    [user, restoring, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}

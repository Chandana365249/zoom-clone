"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, authToken, onUnauthorized } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: User };

interface AuthContextValue {
  status: AuthState["status"];
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds who is signed in. On load it restores the session from the stored token by calling
 * /api/users/me; if the server ever rejects the token (expired/revoked), it signs out locally.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  const clearSession = useCallback(() => {
    authToken.set(null);
    setState({ status: "anonymous", user: null });
  }, []);

  useEffect(() => {
    onUnauthorized(clearSession);
    let cancelled = false;

    async function restoreSession() {
      if (!authToken.get()) return clearSession();
      try {
        const user = await api.getCurrentUser();
        if (!cancelled) setState({ status: "authenticated", user });
      } catch {
        // 401 is handled by onUnauthorized; for network errors, treat as signed out too —
        // the sign-in page then shows a clear error if the server is really unreachable.
        if (!cancelled) clearSession();
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
      onUnauthorized(null);
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login({ email, password });
    authToken.set(token);
    setState({ status: "authenticated", user });
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const { token, user } = await api.signup({ name, email, password });
    authToken.set(token);
    setState({ status: "authenticated", user });
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined); // signing out locally must always work
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, user: state.user, login, signup, logout }),
    [state, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

/** The signed-in user, or null while loading / when signed out. */
export function useCurrentUser(): User | null {
  return useAuth().user;
}

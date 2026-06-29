import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from "@flowpedia/shared";
import {
  fetchMe,
  forgotPassword as apiForgot,
  loginAccount,
  registerAccount,
  resetPassword as apiReset,
  setAuthToken,
} from "../api/client";

// Token persisted across launches. AsyncStorage (not SecureStore) so the same
// code path works on web too; native builds could later swap in expo-secure-store.
const TOKEN_KEY = "flowpedia.authToken";

type AuthStatus = "loading" | "guest" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** True once the initial token restore has finished (status !== "loading"). */
  ready: boolean;
  register: (body: RegisterRequest) => Promise<void>;
  login: (body: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (body: ResetPasswordRequest) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Restore a persisted session on boot: load the token, then validate it with
  // /auth/me. A bad/expired token (or being offline) drops back to guest.
  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (active) setStatus("guest");
        return;
      }
      setAuthToken(token);
      try {
        const me = await fetchMe();
        if (!active) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        setAuthToken(undefined);
        await AsyncStorage.removeItem(TOKEN_KEY);
        if (active) setStatus("guest");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function applySession(token: string, authedUser: AuthUser): Promise<void> {
    setAuthToken(token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(authedUser);
    setStatus("authenticated");
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      ready: status !== "loading",
      register: async (body) => {
        const res = await registerAccount(body);
        await applySession(res.token, res.user);
      },
      login: async (body) => {
        const res = await loginAccount(body);
        await applySession(res.token, res.user);
      },
      logout: async () => {
        setAuthToken(undefined);
        await AsyncStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setStatus("guest");
      },
      forgotPassword: async (email) => (await apiForgot({ email })).message,
      resetPassword: async (body) => (await apiReset(body)).message,
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
} from "@flowpedia/shared";
import {
  changePassword as apiChangePassword,
  deleteAccount as apiDeleteAccount,
  fetchMe,
  forgotPassword as apiForgot,
  loginAccount,
  registerAccount,
  resetPassword as apiReset,
  setAuthToken,
  setCurrentUserId,
  updateProfile as apiUpdateProfile,
  wipeAccountData as apiWipeData,
} from "../api/client";
import { useUser } from "../user/UserProvider";

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
  updateProfile: (body: UpdateProfileRequest) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Clears the account's server-side data but keeps the account. */
  wipeData: () => Promise<string>;
  /** Deletes the account and all its data, then drops to guest. */
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const tempUser = useUser();
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
        // Signals now attach the real account id (per-account algorithm input).
        setCurrentUserId(me.id);
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
    setCurrentUserId(authedUser.id);
    setUser(authedUser);
    setStatus("authenticated");
  }

  async function dropToGuest(): Promise<void> {
    setAuthToken(undefined);
    await AsyncStorage.removeItem(TOKEN_KEY);
    setCurrentUserId(tempUser.id); // signals revert to the anonymous id
    setUser(null);
    setStatus("guest");
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
      logout: dropToGuest,
      forgotPassword: async (email) => (await apiForgot({ email })).message,
      resetPassword: async (body) => (await apiReset(body)).message,
      updateProfile: async (body) => {
        setUser(await apiUpdateProfile(body));
      },
      changePassword: async (currentPassword, newPassword) => {
        await apiChangePassword({ currentPassword, newPassword });
      },
      wipeData: async () => (await apiWipeData()).message,
      deleteAccount: async () => {
        await apiDeleteAccount();
        await dropToGuest();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, tempUser.id],
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

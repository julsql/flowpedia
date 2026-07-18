import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setCurrentUserId } from "../api/client";

const USER_KEY = "flowpedia.user";

export interface TempUser {
  id: string;
  name: string;
}

const DEFAULT_NAME = "Guest";

/**
 * Generate the anonymous device id with a cryptographically secure RNG. This id
 * keys server-side de-dup and personalization, so a predictable value would let
 * one client guess/impersonate another's stream — hence `crypto`, not
 * `Math.random`. Prefers `randomUUID`, falls back to `getRandomValues`; both are
 * available on Expo web and on native via React Native's crypto implementation.
 */
function generateUserId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }
  if (webCrypto?.getRandomValues) {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Last-resort non-crypto fallback for runtimes without WebCrypto: still
  // unique enough for a guest id, and never reached on web or modern native.
  return `u-${Date.now().toString(36)}-${(globalThis.performance?.now() ?? 0).toString(36)}`;
}

function createUser(): TempUser {
  return { id: generateUserId(), name: DEFAULT_NAME };
}

const UserContext = createContext<TempUser | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  // Generated synchronously so the avatar is stable; reconciled with storage.
  const [user, setUser] = useState<TempUser>(createUser);

  useEffect(() => {
    void (async () => {
      const stored = await AsyncStorage.getItem(USER_KEY);
      if (stored) {
        // Keep the persisted id, but always use the current display name.
        const parsed = JSON.parse(stored) as TempUser;
        const reconciled = { id: parsed.id, name: DEFAULT_NAME };
        setUser(reconciled);
        setCurrentUserId(reconciled.id);
        if (parsed.name !== DEFAULT_NAME) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(reconciled));
        }
      } else {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        setCurrentUserId(user.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): TempUser {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return ctx;
}

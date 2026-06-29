import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setCurrentUserId } from "../api/client";

const USER_KEY = "flowpedia.user";

export interface TempUser {
  id: string;
  name: string;
}

const DEFAULT_NAME = "Guest";

function createUser(): TempUser {
  const id =
    Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  return { id, name: DEFAULT_NAME };
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

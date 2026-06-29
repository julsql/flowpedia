import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { fetchUnreadCount, markNotificationsRead, registerPushToken } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { registerForPushNotificationsAsync } from "./registerPush";

// Foreground behaviour: still show the banner while the app is open.
Notifications.setNotificationHandler({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }) as any,
});

const POLL_MS = 60_000;

interface NotificationsValue {
  /** Unread in-app notification count (drives the badge). */
  unread: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/** Tracks the unread badge, registers the device push token on login, and keeps
 *  the count fresh on incoming push / app foreground. Guest mode = always 0. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const authed = auth.status === "authenticated";
  const [unread, setUnread] = useState(0);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (!authed || refreshing.current) {
      return;
    }
    refreshing.current = true;
    try {
      const { count } = await fetchUnreadCount();
      setUnread(count);
    } catch {
      // best-effort; keep the last known count
    } finally {
      refreshing.current = false;
    }
  }, [authed]);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    try {
      await markNotificationsRead();
    } catch {
      // optimistic; a later refresh reconciles
    }
  }, []);

  // Register the push token once authenticated.
  useEffect(() => {
    if (!authed) {
      setUnread(0);
      return;
    }
    void (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await registerPushToken({ token, platform: Platform.OS }).catch(() => undefined);
      }
    })();
    void refresh();
  }, [authed, refresh]);

  // Bump the count when a push lands while the app is open.
  useEffect(() => {
    if (!authed) {
      return;
    }
    const sub = Notifications.addNotificationReceivedListener(() => {
      void refresh();
    });
    return () => sub.remove();
  }, [authed, refresh]);

  // Refresh on app foreground and on a slow poll.
  useEffect(() => {
    if (!authed) {
      return;
    }
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      appSub.remove();
      clearInterval(timer);
    };
  }, [authed, refresh]);

  const value = useMemo<NotificationsValue>(
    () => ({ unread, refresh, markAllRead }),
    [unread, refresh, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}

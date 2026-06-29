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
import {
  fetchMessagesUnreadCount,
  fetchUnreadCount,
  getAuthToken,
  markNotificationsRead,
  registerPushToken,
} from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { useLocale } from "../i18n";
import { addPushReceivedListener, registerForPushNotificationsAsync } from "./registerPush";
import { connectRealtime, type LiveEvent } from "./realtime";
import { LiveToast } from "./LiveToast";

const POLL_MS = 60_000;

interface NotificationsValue {
  /** Unread bell notifications (follows) — excludes messages. */
  unread: number;
  /** Unread received pages — drives the Messages tab badge. */
  messagesUnread: number;
  /** Bumped on every live event — screens depend on it to refetch in real time. */
  lastEventAt: number;
  refresh: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/** Tracks the unread badge, registers the device push token on login, opens the
 *  realtime socket (live follows/messages), and shows an in-app toast. Guest mode
 *  = always 0 and no socket. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { locale } = useLocale();
  const authed = auth.status === "authenticated";
  const [unread, setUnread] = useState(0);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const [lastEventAt, setLastEventAt] = useState(0);
  const [toast, setToast] = useState<LiveEvent | null>(null);
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

  const refreshMessages = useCallback(async () => {
    if (!authed) {
      return;
    }
    try {
      const { count } = await fetchMessagesUnreadCount();
      setMessagesUnread(count);
    } catch {
      // best-effort
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
      setMessagesUnread(0);
      return;
    }
    void (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        // locale → server localizes push copy per device.
        await registerPushToken({ token, platform: Platform.OS, locale }).catch(() => undefined);
      }
    })();
    void refresh();
    void refreshMessages();
  }, [authed, refresh, refreshMessages, locale]);

  // Realtime socket: live badge bump, screen refresh, and a toast. Messages and
  // bell notifications arrive on distinct channels and update distinct counters.
  useEffect(() => {
    if (!authed) {
      return;
    }
    const token = getAuthToken();
    if (!token) {
      return;
    }
    const onEvent = (kind: "notification" | "message", e: LiveEvent) => {
      if (kind === "message") {
        void refreshMessages();
      } else {
        void refresh();
      }
      setLastEventAt(Date.now());
      setToast(e);
    };
    const disconnect = connectRealtime(token, onEvent);
    return disconnect;
  }, [authed, refresh, refreshMessages]);

  // Bump the count when a push lands while the app is open (no-op without push).
  useEffect(() => {
    if (!authed) {
      return;
    }
    let unsubscribe = () => undefined as void;
    let cancelled = false;
    void addPushReceivedListener(() => void refresh()).then((off) => {
      if (cancelled) {
        off();
      } else {
        unsubscribe = off;
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authed, refresh]);

  // Refresh on app foreground and on a slow poll (socket is the primary signal).
  useEffect(() => {
    if (!authed) {
      return;
    }
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
        void refreshMessages();
      }
    });
    const timer = setInterval(() => {
      void refresh();
      void refreshMessages();
    }, POLL_MS);
    return () => {
      appSub.remove();
      clearInterval(timer);
    };
  }, [authed, refresh, refreshMessages]);

  const value = useMemo<NotificationsValue>(
    () => ({ unread, messagesUnread, lastEventAt, refresh, refreshMessages, markAllRead }),
    [unread, messagesUnread, lastEventAt, refresh, refreshMessages, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <LiveToast event={toast} onHide={() => setToast(null)} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}

import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";

/** Native remote push isn't available on web, on a simulator, or inside Expo Go
 *  (removed in SDK 53 — needs a development/standalone build). We detect that and
 *  skip everything that touches `expo-notifications`, so the app still runs fully
 *  (in-app notifications + badge) everywhere; only the native banner needs a build. */
export function isPushSupported(): boolean {
  if (Platform.OS === "web" || !Device.isDevice) {
    return false;
  }
  // Expo Go reports executionEnvironment "storeClient" / appOwnership "expo".
  const inExpoGo =
    Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
  return !inExpoGo;
}

/**
 * Ask for permission and return this device's Expo push token, or null when push
 * isn't available (see isPushSupported) or anything fails. `expo-notifications` is
 * imported dynamically so it never loads in Expo Go (which would warn/error).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!isPushSupported()) {
    return null;
  }
  try {
    const Notifications = await import("expo-notifications");
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") {
      return null;
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    return null;
  }
}

/** Configure foreground display + subscribe to incoming pushes. No-op (returns a
 *  no-op unsubscribe) when push isn't supported. Dynamically imported. */
export async function addPushReceivedListener(onReceived: () => void): Promise<() => void> {
  if (!isPushSupported()) {
    return () => undefined;
  }
  try {
    const Notifications = await import("expo-notifications");
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
    const sub = Notifications.addNotificationReceivedListener(() => onReceived());
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

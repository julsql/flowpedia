import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../src/theme";
import { useLocale } from "../../src/i18n";
import { useNotifications } from "../../src/notifications/NotificationProvider";

// Bottom tab bar — handoff: home, search, bolt (flow), messages, person.
export default function TabsLayout() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const { messagesUnread } = useNotifications();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedLight,
        tabBarStyle: {
          height: 60,
          backgroundColor: colors.bg,
          borderTopColor: colors.separator,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tab.home"),
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t("tab.explore"),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="flow"
        options={{
          title: t("tab.flow"),
          tabBarIcon: ({ color, size }) => <MaterialIcons name="bolt" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: t("tab.share"),
          tabBarIcon: ({ color, size }) => <MaterialIcons name="forum" size={size} color={color} />,
          tabBarBadge: messagesUnread > 0 ? (messagesUnread > 99 ? "99+" : messagesUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: "#fff", fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tab.profile"),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

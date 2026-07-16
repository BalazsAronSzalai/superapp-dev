import { Tabs } from "expo-router"
import { Platform } from "react-native"
import {
  CalendarDays,
  Mail,
  NotebookPen,
  SquareCheckBig,
  Sun,
  Wallet,
} from "lucide-react-native"

import { useUnreadCount } from "@/hooks/use-mail"
import { typography, useAppTheme } from "@/theme"

export default function TabsLayout() {
  const { colors } = useAppTheme()
  const unreadQuery = useUnreadCount()
  const unread = unreadQuery.data ?? 0

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.separator,
        },
        tabBarLabelStyle: {
          fontSize: typography.caption.fontSize,
          fontWeight: "500",
          // Web renders labels slightly tighter than native.
          ...(Platform.OS === "web" ? { marginTop: 2 } : null),
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => <Sun color={color} size={size} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="mail"
        options={{
          title: "Mail",
          tabBarIcon: ({ color, size }) => <Mail color={color} size={size} strokeWidth={1.75} />,
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: "#FFFFFF",
            fontSize: typography.caption.fontSize,
          },
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: "To-Do",
          tabBarIcon: ({ color, size }) => (
            <SquareCheckBig color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: "Notes",
          tabBarIcon: ({ color, size }) => (
            <NotebookPen color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: "Finance",
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  )
}

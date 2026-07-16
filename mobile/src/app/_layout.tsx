import { useEffect } from "react"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { QueryClientProvider } from "@tanstack/react-query"

import { BiometricGate } from "@/components/biometric-gate"
import { useAuthStore } from "@/lib/auth/store"
import { queryClient } from "@/lib/query-client"
import { AppThemeProvider, useAppTheme } from "@/theme"

SplashScreen.preventAutoHideAsync()

function RootNavigator() {
  const status = useAuthStore((s) => s.status)
  const hydrate = useAuthStore((s) => s.hydrate)
  const { colors, scheme } = useAppTheme()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync()
  }, [status])

  if (status === "loading") return null

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={status === "authenticated"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="settings"
            options={{
              presentation: "modal",
              headerShown: true,
              title: "Settings",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="search"
            options={{
              headerShown: true,
              title: "Search",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="mail/account-setup"
            options={{
              presentation: "modal",
              headerShown: true,
              title: "Add Mail Account",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="mail/compose"
            options={{
              presentation: "modal",
              headerShown: true,
              title: "New Message",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="mail/thread/[id]"
            options={{
              headerShown: true,
              title: "",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="mail/search"
            options={{
              headerShown: true,
              title: "Search",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="notes/note/[id]"
            options={{
              headerShown: true,
              title: "",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="notes/notebooks"
            options={{
              headerShown: true,
              title: "Notebooks",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="notes/search"
            options={{
              headerShown: true,
              title: "Search Notes",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="finance/transactions"
            options={{
              headerShown: true,
              title: "Transactions",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="finance/transaction/[id]"
            options={{
              headerShown: true,
              title: "Transaction",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="finance/account/[id]"
            options={{
              headerShown: true,
              title: "Account",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="finance/budgets"
            options={{
              headerShown: true,
              title: "Budgets",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="finance/cards"
            options={{
              headerShown: true,
              title: "Cards",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="finance/analytics"
            options={{
              headerShown: true,
              title: "Analytics",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={status !== "authenticated"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <BiometricGate />
    </>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  )
}

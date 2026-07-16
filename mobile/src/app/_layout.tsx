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

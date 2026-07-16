import { Stack } from "expo-router"
import { useAuthStore } from "@/lib/auth/store"

export default function AuthLayout() {
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded)

  return (
    <Stack
      screenOptions={{ headerShown: false }}
      initialRouteName={hasOnboarded ? "login" : "onboarding"}
    >
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}

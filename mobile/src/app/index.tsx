import { Redirect } from "expo-router"
import { useAuthStore } from "@/lib/auth/store"

export default function Index() {
  const status = useAuthStore((s) => s.status)
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded)

  console.log("[IndexRoute] rendering, status:", status, "hasOnboarded:", hasOnboarded)

  if (status === "loading") {
    return null
  }

  if (status === "authenticated") {
    return <Redirect href="/today" />
  }

  return <Redirect href={hasOnboarded ? "/login" : "/onboarding"} />
}

import { AppState, Platform, type AppStateStatus } from "react-native"
import NetInfo from "@react-native-community/netinfo"
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query"

/**
 * React Native has no window focus/online events, so wire TanStack Query's
 * managers to AppState (refetch stale queries when the app foregrounds) and
 * NetInfo (pause/resume queries with connectivity). Web keeps the defaults.
 * Idempotent module side effects — safe with Fast Refresh.
 */
if (Platform.OS !== "web") {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected ?? true)
    }),
  )

  AppState.addEventListener("change", (status: AppStateStatus) => {
    focusManager.setFocused(status === "active")
  })
}

/**
 * TanStack Query 5 — server state (caching, mutations, optimistic updates).
 * Offline-first defaults: keep data fresh-ish, retry conservatively.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
    },
    mutations: {
      retry: 1,
    },
  },
})

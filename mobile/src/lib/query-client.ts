import { QueryClient } from "@tanstack/react-query"

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

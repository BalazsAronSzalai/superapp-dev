import { create } from "zustand"
import { persist } from "zustand/middleware"
import { api } from "@/lib/api"
import { setTokens, clearTokens, getRefreshToken, getAccessToken } from "@/lib/token-store"
import { zustandStorage } from "@/lib/storage"
import { authResponseSchema, type User } from "@/lib/schemas/auth.schemas"

type AuthStatus = "loading" | "unauthenticated" | "authenticated"

interface AuthState {
  status: AuthStatus
  user: User | null
  hasOnboarded: boolean
  biometricLockEnabled: boolean
  hydrate: () => Promise<void>
  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setHasOnboarded: (v: boolean) => void
  setBiometricLockEnabled: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: "loading",
      user: null,
      hasOnboarded: false,
      biometricLockEnabled: false,

      /** Called once on app start: restore session from SecureStore. */
      hydrate: async () => {
        try {
          const token = await getAccessToken()
          const refreshToken = await getRefreshToken()
          if (!token && !refreshToken) {
            set({ status: "unauthenticated", user: null })
            return
          }
          const { user } = await api<{ user: User }>("/api/auth/me")
          set({ status: "authenticated", user })
        } catch {
          await clearTokens()
          set({ status: "unauthenticated", user: null })
        }
      },

      register: async (email, password) => {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: { email, password },
          auth: false,
        })
        const parsed = authResponseSchema.parse(data)
        await setTokens(parsed.tokens.accessToken, parsed.tokens.refreshToken)
        set({ status: "authenticated", user: parsed.user })
      },

      login: async (email, password) => {
        const data = await api("/api/auth/login", {
          method: "POST",
          body: { email, password },
          auth: false,
        })
        const parsed = authResponseSchema.parse(data)
        await setTokens(parsed.tokens.accessToken, parsed.tokens.refreshToken)
        set({ status: "authenticated", user: parsed.user })
      },

      logout: async () => {
        const refreshToken = await getRefreshToken()
        if (refreshToken) {
          await api("/api/auth/logout", {
            method: "POST",
            body: { refreshToken },
          }).catch(() => {})
        }
        await clearTokens()
        set({ status: "unauthenticated", user: null })
      },

      setHasOnboarded: (hasOnboarded) => set({ hasOnboarded }),
      setBiometricLockEnabled: (biometricLockEnabled) => set({ biometricLockEnabled }),
    }),
    {
      name: "auth-preferences",
      storage: zustandStorage,
      // Only UI preferences persist to MMKV — tokens live in SecureStore.
      partialize: (s) => ({
        hasOnboarded: s.hasOnboarded,
        biometricLockEnabled: s.biometricLockEnabled,
      }),
    },
  ),
)

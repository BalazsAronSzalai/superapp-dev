import { create } from "zustand"
import { persist } from "zustand/middleware"
import { api } from "@/lib/api"
import { setTokens, clearTokens, getRefreshToken, getAccessToken } from "@/lib/token-store"
import { zustandStorage } from "@/lib/storage"
import {
  authResponseSchema,
  loginResponseSchema,
  type User,
} from "@/lib/schemas/auth.schemas"

type AuthStatus = "loading" | "unauthenticated" | "authenticated"

/** Result of a login attempt: signed in, or a 2FA challenge to complete. */
export type LoginResult = { requires2fa: false } | { requires2fa: true; pendingToken: string }

interface AuthState {
  status: AuthStatus
  user: User | null
  hasOnboarded: boolean
  biometricLockEnabled: boolean
  hydrate: () => Promise<void>
  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<LoginResult>
  /** Step 2 of login for 2FA-enabled accounts: TOTP code → real tokens. */
  verify2fa: (pendingToken: string, code: string) => Promise<void>
  logout: () => Promise<void>
  setHasOnboarded: (v: boolean) => void
  setBiometricLockEnabled: (v: boolean) => void
  /** Refresh the cached user (e.g. after enabling/disabling 2FA). */
  setUser: (user: User) => void
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
        const parsed = loginResponseSchema.parse(data)
        // 2FA-enabled accounts get a pending token instead of real tokens.
        if ("requires2fa" in parsed) {
          return { requires2fa: true, pendingToken: parsed.pendingToken }
        }
        await setTokens(parsed.tokens.accessToken, parsed.tokens.refreshToken)
        set({ status: "authenticated", user: parsed.user })
        return { requires2fa: false }
      },

      verify2fa: async (pendingToken, code) => {
        const data = await api("/api/auth/2fa/verify", {
          method: "POST",
          body: { pendingToken, code },
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
      setUser: (user) => set({ user }),
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

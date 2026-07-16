// Web fallback: SecureStore is native-only. On web (dev/preview) we fall back
// to localStorage. Native builds resolve token-store.ts (SecureStore) instead.

const ACCESS_KEY = "superapp.accessToken"
const REFRESH_KEY = "superapp.refreshToken"

export async function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY)
}

export async function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

export async function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export async function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

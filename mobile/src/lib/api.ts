import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./token-store"
import { authTokensSchema } from "./schemas/auth.schemas"

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let refreshPromise: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      await clearTokens()
      return false
    }
    const data = await res.json()
    const tokens = authTokensSchema.parse(data.tokens)
    await setTokens(tokens.accessToken, tokens.refreshToken)
    return true
  } catch {
    return false
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  auth?: boolean
}

/**
 * Fetch wrapper: attaches the access token and transparently retries
 * once after a refresh when the server returns 401.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (auth) {
      const token = await getAccessToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  let res = await doFetch()

  if (res.status === 401 && auth) {
    refreshPromise ??= refreshTokens().finally(() => {
      refreshPromise = null
    })
    const refreshed = await refreshPromise
    if (refreshed) res = await doFetch()
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string })?.error ?? "Request failed")
  }
  return data as T
}

import type { Request, Response, NextFunction } from "express"

/**
 * Small in-memory fixed-window rate limiter (no new dependency).
 *
 * Good enough for a single-process deployment; a Redis-backed store is the
 * production follow-up for multi-instance deployments (see dev_log.md).
 */

interface Window {
  count: number
  resetAt: number
}

interface LimiterOptions {
  /** Max requests per window. */
  max: number
  /** Window length in ms. */
  windowMs: number
  /** Bucket name so different limiters don't share counters. */
  name: string
}

const buckets = new Map<string, Window>()

// Periodically drop expired windows so the map doesn't grow unbounded.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()
function maybeCleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key)
  }
}

function clientIp(req: Request): string {
  // Behind Vercel/proxies the client IP is the first x-forwarded-for entry.
  const fwd = req.headers["x-forwarded-for"]
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  if (raw) return raw.split(",")[0]!.trim()
  return req.socket.remoteAddress ?? "unknown"
}

export function rateLimit({ max, windowMs, name }: LimiterOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    maybeCleanup(now)

    const key = `${name}:${clientIp(req)}`
    let win = buckets.get(key)
    if (!win || win.resetAt <= now) {
      win = { count: 0, resetAt: now + windowMs }
      buckets.set(key, win)
    }
    win.count++

    if (win.count > max) {
      res.setHeader("Retry-After", Math.ceil((win.resetAt - now) / 1000))
      res.status(429).json({ error: "Too many requests, please try again later" })
      return
    }
    next()
  }
}

/** Strict limiter for credential endpoints (login/register/refresh/2FA). */
export const authRateLimit = rateLimit({ name: "auth", max: 20, windowMs: 60 * 1000 })

/** Lenient global limiter for the whole /api surface. */
export const globalRateLimit = rateLimit({ name: "global", max: 300, windowMs: 60 * 1000 })

/** Test hook — reset all counters. */
export function resetRateLimits() {
  buckets.clear()
}

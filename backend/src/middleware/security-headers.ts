import type { Request, Response, NextFunction } from "express"

/**
 * Security response headers for a JSON API (no new dependency needed —
 * this covers the helmet defaults that matter for an API surface).
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  // No sniffing responses into other content types.
  res.setHeader("X-Content-Type-Options", "nosniff")
  // API responses must never be framed.
  res.setHeader("X-Frame-Options", "DENY")
  // Lock down anything that accidentally renders as a document.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
  // Never leak URLs (which may contain ids) via Referer.
  res.setHeader("Referrer-Policy", "no-referrer")
  // HSTS — meaningful behind Vercel's TLS termination.
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
  // Sensitive payloads (mail bodies, finance data) must not be cached by proxies.
  res.setHeader("Cache-Control", "no-store")
  // Disable powerful browser features outright.
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  // Don't advertise the stack.
  res.removeHeader("X-Powered-By")
  next()
}

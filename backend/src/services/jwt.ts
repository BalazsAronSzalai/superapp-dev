import { SignJWT, jwtVerify } from "jose"
import { createHash, randomBytes } from "node:crypto"

const secretEnv = process.env.JWT_SECRET
if (!secretEnv) {
  throw new Error("JWT_SECRET environment variable is not set")
}
const secret = new TextEncoder().encode(secretEnv)

const ISSUER = "superapp-backend"
const ACCESS_TTL = "15m"
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER })
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url")
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

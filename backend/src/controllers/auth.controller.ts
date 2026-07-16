import type { Request, Response } from "express"
import { and, eq, gt } from "drizzle-orm"
import argon2 from "argon2"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  signPending2faToken,
  verifyPending2faToken,
  REFRESH_TTL_MS,
} from "../services/jwt.js"
import { generateTotpSecret, verifyTotpCode } from "../services/totp.js"
import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  PushTokenInput,
  TwoFaCodeInput,
  TwoFaVerifyInput,
  AuthResponse,
  Pending2faResponse,
  TwoFaSetupResponse,
  User,
} from "../shared/auth.schemas.js"

function toUser(row: {
  id: string
  email: string
  createdAt: Date
  totpEnabled: boolean
}): User {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    totpEnabled: row.totpEnabled,
  }
}

async function issueTokens(userId: string) {
  const accessToken = await signAccessToken(userId)
  const refreshToken = generateRefreshToken()
  await db.insert(schema.refreshTokens).values({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })
  return { accessToken, refreshToken }
}

export async function register(req: Request, res: Response) {
  const { email, password } = req.body as RegisterInput
  const normalized = email.toLowerCase().trim()

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1)
  if (existing.length > 0) {
    throw new HttpError(409, "An account with this email already exists")
  }

  const passwordHash = await argon2.hash(password)
  const [user] = await db
    .insert(schema.users)
    .values({ email: normalized, passwordHash })
    .returning()
  if (!user) throw new HttpError(500, "Failed to create user")

  const tokens = await issueTokens(user.id)
  const body: AuthResponse = { user: toUser(user), tokens }
  res.status(201).json(body)
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput
  const normalized = email.toLowerCase().trim()

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1)
  if (!user) throw new HttpError(401, "Invalid email or password")

  const valid = await argon2.verify(user.passwordHash, password)
  if (!valid) throw new HttpError(401, "Invalid email or password")

  // 2FA-enabled accounts get a short-lived pending token instead of real
  // tokens; POST /api/auth/2fa/verify exchanges it (+ TOTP code) for tokens.
  if (user.totpEnabled) {
    const body: Pending2faResponse = {
      requires2fa: true,
      pendingToken: await signPending2faToken(user.id),
    }
    res.json(body)
    return
  }

  const tokens = await issueTokens(user.id)
  const body: AuthResponse = { user: toUser(user), tokens }
  res.json(body)
}

// ---------------------------------------------------------------------------
// TOTP two-factor auth
// ---------------------------------------------------------------------------

/** Exchange a pending 2FA token + TOTP code for real tokens (login step 2). */
export async function twofaVerify(req: Request, res: Response) {
  const { pendingToken, code } = req.body as TwoFaVerifyInput

  const userId = await verifyPending2faToken(pendingToken)
  if (!userId) throw new HttpError(401, "Invalid or expired 2FA session — log in again")

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
    throw new HttpError(401, "Invalid or expired 2FA session — log in again")
  }

  if (!verifyTotpCode(user.totpSecretEncrypted, code)) {
    throw new HttpError(401, "Invalid verification code")
  }

  const tokens = await issueTokens(user.id)
  const body: AuthResponse = { user: toUser(user), tokens }
  res.json(body)
}

/** Generate a new TOTP secret for the signed-in user (not enabled yet). */
export async function twofaSetup(req: Request, res: Response) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, req.userId!))
    .limit(1)
  if (!user) throw new HttpError(404, "User not found")
  if (user.totpEnabled) throw new HttpError(409, "Two-factor auth is already enabled")

  const setup = generateTotpSecret(user.email)
  await db
    .update(schema.users)
    .set({ totpSecretEncrypted: setup.secretEncrypted, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))

  const body: TwoFaSetupResponse = { uri: setup.uri, manualCode: setup.manualCode }
  res.json(body)
}

/** Confirm the setup code from the authenticator app — turns 2FA on. */
export async function twofaEnable(req: Request, res: Response) {
  const { code } = req.body as TwoFaCodeInput

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, req.userId!))
    .limit(1)
  if (!user) throw new HttpError(404, "User not found")
  if (user.totpEnabled) throw new HttpError(409, "Two-factor auth is already enabled")
  if (!user.totpSecretEncrypted) {
    throw new HttpError(400, "Run 2FA setup first")
  }

  if (!verifyTotpCode(user.totpSecretEncrypted, code)) {
    throw new HttpError(401, "Invalid verification code")
  }

  await db
    .update(schema.users)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))

  res.json({ user: toUser({ ...user, totpEnabled: true }) })
}

/** Turn 2FA off (requires a valid current code). */
export async function twofaDisable(req: Request, res: Response) {
  const { code } = req.body as TwoFaCodeInput

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, req.userId!))
    .limit(1)
  if (!user) throw new HttpError(404, "User not found")
  if (!user.totpEnabled || !user.totpSecretEncrypted) {
    throw new HttpError(400, "Two-factor auth is not enabled")
  }

  if (!verifyTotpCode(user.totpSecretEncrypted, code)) {
    throw new HttpError(401, "Invalid verification code")
  }

  await db
    .update(schema.users)
    .set({ totpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))

  res.json({ user: toUser({ ...user, totpEnabled: false }) })
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshInput
  const tokenHash = hashRefreshToken(refreshToken)

  const [stored] = await db
    .select()
    .from(schema.refreshTokens)
    .where(
      and(
        eq(schema.refreshTokens.tokenHash, tokenHash),
        gt(schema.refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!stored) throw new HttpError(401, "Invalid or expired refresh token")

  // Rotate: delete the used token, issue a new pair.
  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.id, stored.id))
  const tokens = await issueTokens(stored.userId)
  res.json({ tokens })
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshInput
  await db
    .delete(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, hashRefreshToken(refreshToken)))
  res.status(204).end()
}

export async function me(req: Request, res: Response) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, req.userId!))
    .limit(1)
  if (!user) throw new HttpError(404, "User not found")
  res.json({ user: toUser(user) })
}

export async function registerPushToken(req: Request, res: Response) {
  const { token, platform } = req.body as PushTokenInput
  await db
    .insert(schema.pushTokens)
    .values({ userId: req.userId!, token, platform })
    .onConflictDoUpdate({
      target: schema.pushTokens.token,
      set: { userId: req.userId!, platform },
    })
  res.status(204).end()
}

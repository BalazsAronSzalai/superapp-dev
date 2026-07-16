// Shared Zod 4 schemas — hand-copied to mobile/src/lib/schemas/auth.schemas.ts
// Keep both files in sync (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
})

export const twoFaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
})

export const twoFaVerifySchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
})

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.string(),
  totpEnabled: z.boolean(),
})

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

export const authResponseSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
})

/** Login response when the account has 2FA enabled — verify to get tokens. */
export const pending2faResponseSchema = z.object({
  requires2fa: z.literal(true),
  pendingToken: z.string(),
})

/** Login can return either full tokens or a 2FA challenge. */
export const loginResponseSchema = z.union([authResponseSchema, pending2faResponseSchema])

export const twoFaSetupResponseSchema = z.object({
  /** otpauth:// URI for authenticator apps (QR-encodable). */
  uri: z.string(),
  /** Base32 secret for manual entry. */
  manualCode: z.string(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
export type PushTokenInput = z.infer<typeof pushTokenSchema>
export type TwoFaCodeInput = z.infer<typeof twoFaCodeSchema>
export type TwoFaVerifyInput = z.infer<typeof twoFaVerifySchema>
export type User = z.infer<typeof userSchema>
export type AuthTokens = z.infer<typeof authTokensSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
export type Pending2faResponse = z.infer<typeof pending2faResponseSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type TwoFaSetupResponse = z.infer<typeof twoFaSetupResponseSchema>

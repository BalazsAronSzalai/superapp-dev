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

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.string(),
})

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

export const authResponseSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
export type PushTokenInput = z.infer<typeof pushTokenSchema>
export type User = z.infer<typeof userSchema>
export type AuthTokens = z.infer<typeof authTokensSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>

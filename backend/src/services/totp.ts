import * as OTPAuth from "otpauth"
import { encryptConfig, decryptConfig } from "./crypto.js"

/**
 * TOTP (RFC 6238) two-factor auth service.
 *
 * Secrets are encrypted at rest with the same AES-256-GCM service used for
 * mail credentials (services/crypto.ts, keyed by CONFIG_ENCRYPTION_KEY).
 */

const ISSUER = "Superapp"
const TOTP_PARAMS = { algorithm: "SHA1", digits: 6, period: 30 } as const

export interface TotpSetup {
  /** Encrypted secret to persist on users.totp_secret_encrypted. */
  secretEncrypted: string
  /** otpauth:// URI for authenticator apps (QR-encodable). */
  uri: string
  /** Base32 secret for manual entry. */
  manualCode: string
}

export function generateTotpSecret(accountLabel: string): TotpSetup {
  const secret = new OTPAuth.Secret({ size: 20 })
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    secret,
    ...TOTP_PARAMS,
  })
  return {
    secretEncrypted: encryptConfig(secret.base32),
    uri: totp.toString(),
    manualCode: secret.base32,
  }
}

/** Validate a 6-digit code against the encrypted secret (±1 period skew). */
export function verifyTotpCode(secretEncrypted: string, code: string): boolean {
  let base32: string
  try {
    base32 = decryptConfig(secretEncrypted)
  } catch {
    return false
  }
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    secret: OTPAuth.Secret.fromBase32(base32),
    ...TOTP_PARAMS,
  })
  const delta = totp.validate({ token: code.trim(), window: 1 })
  return delta !== null
}

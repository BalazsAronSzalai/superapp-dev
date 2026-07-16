import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

/**
 * AES-256-GCM encryption for account credentials at rest
 * (accounts.config_encrypted). Keyed by CONFIG_ENCRYPTION_KEY.
 *
 * Wire format: base64(iv[12] || authTag[16] || ciphertext)
 */

function getKey(): Buffer {
  const raw = process.env.CONFIG_ENCRYPTION_KEY
  if (!raw) {
    throw new Error("CONFIG_ENCRYPTION_KEY environment variable is not set")
  }
  // Accept any string secret; derive a stable 32-byte key from it.
  return createHash("sha256").update(raw).digest()
}

export function encryptConfig(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decryptConfig(encoded: string): string {
  const key = getKey()
  const buf = Buffer.from(encoded, "base64")
  if (buf.length < 29) throw new Error("Invalid encrypted payload")
  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import { encryptConfig, decryptConfig } from "../src/services/crypto.js"

const ORIGINAL_KEY = process.env.CONFIG_ENCRYPTION_KEY

beforeAll(() => {
  process.env.CONFIG_ENCRYPTION_KEY = "jest-test-secret"
})

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.CONFIG_ENCRYPTION_KEY
  else process.env.CONFIG_ENCRYPTION_KEY = ORIGINAL_KEY
})

describe("crypto (AES-256-GCM config encryption)", () => {
  it("round-trips plaintext", () => {
    const secret = JSON.stringify({ host: "imap.example.com", pass: "p@ss" })
    expect(decryptConfig(encryptConfig(secret))).toBe(secret)
  })

  it("round-trips unicode", () => {
    const secret = "árvíztűrő tükörfúrógép 🚀"
    expect(decryptConfig(encryptConfig(secret))).toBe(secret)
  })

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptConfig("same input")).not.toBe(encryptConfig("same input"))
  })

  it("rejects tampered ciphertext (GCM auth)", () => {
    const encoded = encryptConfig("integrity matters")
    const buf = Buffer.from(encoded, "base64")
    buf[buf.length - 1]! ^= 0xff // flip a ciphertext bit
    expect(() => decryptConfig(buf.toString("base64"))).toThrow()
  })

  it("rejects payloads that are too short", () => {
    expect(() => decryptConfig(Buffer.from("short").toString("base64"))).toThrow(
      "Invalid encrypted payload",
    )
  })

  it("throws when CONFIG_ENCRYPTION_KEY is not set", () => {
    const saved = process.env.CONFIG_ENCRYPTION_KEY
    delete process.env.CONFIG_ENCRYPTION_KEY
    try {
      expect(() => encryptConfig("x")).toThrow("CONFIG_ENCRYPTION_KEY")
    } finally {
      process.env.CONFIG_ENCRYPTION_KEY = saved
    }
  })

  it("decrypts with the same key across processes (key is derived from the secret)", () => {
    // Encrypt, then decrypt after re-setting the same secret — simulates a
    // different process with identical env.
    const encoded = encryptConfig("stable derivation")
    process.env.CONFIG_ENCRYPTION_KEY = "jest-test-secret"
    expect(decryptConfig(encoded)).toBe("stable derivation")
  })
})

import { describe, it, expect } from "@jest/globals"
import { BASE_CURRENCY, FX_RATES, convert, toBase } from "../src/services/fx.js"

describe("fx", () => {
  it("uses HUF as the base currency", () => {
    expect(BASE_CURRENCY).toBe("HUF")
    expect(FX_RATES.HUF).toBe(1)
  })

  it("convert is identity for same currency", () => {
    expect(convert(123.45, "EUR", "EUR")).toBe(123.45)
  })

  it("converts EUR to HUF via the rate table", () => {
    expect(convert(2, "EUR", "HUF")).toBeCloseTo(2 * FX_RATES.EUR, 10)
  })

  it("cross-converts through the base (EUR → USD)", () => {
    expect(convert(10, "EUR", "USD")).toBeCloseTo((10 * FX_RATES.EUR) / FX_RATES.USD, 10)
  })

  it("toBase rounds to 2 decimals", () => {
    // 1.234 EUR * 395.5 = 488.047 → 488.05
    expect(toBase(1.234, "EUR")).toBe(488.05)
  })

  it("toBase is a no-op (plus rounding) for HUF", () => {
    expect(toBase(999.999, "HUF")).toBe(1000)
  })
})

/**
 * FX service for the Finance module (plan.md Phase 6 — multi-currency HUF/EUR).
 *
 * v1 uses a static rate table (HUF per one unit of currency). Analytics,
 * budgets, and dashboard totals convert everything into the base currency so
 * mixed-currency accounts aggregate cleanly. A live-rates provider (ECB/MNB
 * feed) can replace `FX_RATES` later without touching the callers.
 */
import type { FinanceCurrency } from "../shared/finance.schemas.js"

export const BASE_CURRENCY: FinanceCurrency = "HUF"

/** HUF per one unit of each supported currency (static v1 snapshot). */
export const FX_RATES: Record<FinanceCurrency, number> = {
  HUF: 1,
  EUR: 395.5,
  USD: 341.8,
}

/** Convert an amount between any two supported currencies. */
export function convert(
  amount: number,
  from: FinanceCurrency,
  to: FinanceCurrency,
): number {
  if (from === to) return amount
  const inBase = amount * FX_RATES[from]
  return inBase / FX_RATES[to]
}

/** Convert an amount into the base currency (HUF), rounded to 2 decimals. */
export function toBase(amount: number, from: FinanceCurrency): number {
  return Math.round(convert(amount, from, BASE_CURRENCY) * 100) / 100
}

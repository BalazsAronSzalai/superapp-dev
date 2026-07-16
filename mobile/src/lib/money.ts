// Currency formatting helpers for the Finance module (HUF/EUR/USD v1).
import type { FinanceCurrency, TransactionType } from "@/lib/schemas/finance.schemas"

/** HUF has no minor unit in practice; EUR/USD show cents. */
const FRACTION_DIGITS: Record<FinanceCurrency, number> = {
  HUF: 0,
  EUR: 2,
  USD: 2,
}

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: FinanceCurrency): Intl.NumberFormat {
  const cached = formatterCache.get(currency)
  if (cached) return cached
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: FRACTION_DIGITS[currency],
    maximumFractionDigits: FRACTION_DIGITS[currency],
  })
  formatterCache.set(currency, formatter)
  return formatter
}

/** "Ft 12,345" / "€12.50" style formatting with a Hermes-safe fallback. */
export function formatCurrency(amount: number, currency: FinanceCurrency): string {
  try {
    return getFormatter(currency).format(amount)
  } catch {
    const rounded =
      FRACTION_DIGITS[currency] === 0 ? Math.round(amount).toString() : amount.toFixed(2)
    return `${rounded} ${currency}`
  }
}

/** Signed amount for a transaction: debits negative, credits positive. */
export function formatSignedAmount(
  amount: number,
  currency: FinanceCurrency,
  type: TransactionType,
): string {
  const sign = type === "debit" ? "-" : "+"
  return `${sign}${formatCurrency(Math.abs(amount), currency)}`
}

/** Compact form for chart labels, e.g. 1_250_000 → "1.3M". */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return Math.round(amount).toString()
}

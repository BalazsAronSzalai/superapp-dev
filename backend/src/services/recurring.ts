/**
 * Recurring-payment detection for the Finance module (plan.md Phase 6).
 *
 * Groups debit transactions by normalized merchant + currency and flags a
 * group as a recurring series when the charges arrive on a steady cadence
 * with consistent amounts (subscriptions, rent, utilities). Detected series
 * feed the analytics screen and the "remind me" superapp integration that
 * creates a task before the next expected charge.
 *
 * Dependency-free heuristic on purpose — a smarter model can replace it
 * behind the same function signature later.
 */
import type {
  FinanceCurrency,
  TransactionCategory,
  TransactionType,
} from "../shared/finance.schemas.js"

export interface RecurringCandidateTxn {
  id: string
  merchant: string | null
  description: string | null
  amount: number
  currency: FinanceCurrency
  category: TransactionCategory | null
  type: TransactionType
  date: Date
}

export interface DetectedRecurringSeries {
  key: string
  merchant: string
  category: TransactionCategory | null
  currency: FinanceCurrency
  averageAmount: number
  intervalDays: number
  occurrences: number
  firstDate: Date
  lastDate: Date
  nextExpectedDate: Date
  /** Ids of the transactions in this series (for flagging is_recurring). */
  transactionIds: string[]
}

/** Minimum charges before a merchant counts as recurring. */
const MIN_OCCURRENCES = 3
/** Accepted cadence window in days (≈weekly … ≈quarterly). */
const MIN_INTERVAL_DAYS = 5
const MAX_INTERVAL_DAYS = 95
/** Each gap must sit within this fraction of the median gap (or ±4 days). */
const GAP_TOLERANCE = 0.35
const GAP_TOLERANCE_DAYS = 4
/** Each amount must sit within this fraction of the median amount. */
const AMOUNT_TOLERANCE = 0.3

const DAY_MS = 24 * 60 * 60 * 1000

function normalizeMerchant(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[\d#*]+/g, " ") // strip store numbers / masked digits
    .replace(/\s+/g, " ")
    .trim()
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** Detect recurring debit series in a set of transactions. */
export function detectRecurring(txns: RecurringCandidateTxn[]): DetectedRecurringSeries[] {
  // Recurring payments are outgoing; group debits by merchant + currency.
  const groups = new Map<string, RecurringCandidateTxn[]>()
  for (const t of txns) {
    if (t.type !== "debit") continue
    const label = (t.merchant ?? t.description ?? "").trim()
    if (!label) continue
    const key = `${normalizeMerchant(label)}|${t.currency}`
    if (normalizeMerchant(label).length < 2) continue
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }

  const series: DetectedRecurringSeries[] = []

  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue
    const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime())

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i]!.date.getTime() - sorted[i - 1]!.date.getTime()) / DAY_MS)
    }

    const medianGap = median(gaps)
    if (medianGap < MIN_INTERVAL_DAYS || medianGap > MAX_INTERVAL_DAYS) continue

    const gapsSteady = gaps.every(
      (g) =>
        Math.abs(g - medianGap) <= Math.max(medianGap * GAP_TOLERANCE, GAP_TOLERANCE_DAYS),
    )
    if (!gapsSteady) continue

    const amounts = sorted.map((t) => t.amount)
    const medianAmount = median(amounts)
    if (medianAmount <= 0) continue
    const amountsSteady = amounts.every(
      (a) => Math.abs(a - medianAmount) <= medianAmount * AMOUNT_TOLERANCE,
    )
    if (!amountsSteady) continue

    const last = sorted[sorted.length - 1]!
    const averageAmount =
      Math.round((amounts.reduce((s, a) => s + a, 0) / amounts.length) * 100) / 100

    series.push({
      key,
      merchant: (last.merchant ?? last.description ?? "").trim(),
      category: last.category,
      currency: last.currency,
      averageAmount,
      intervalDays: Math.round(medianGap),
      occurrences: sorted.length,
      firstDate: sorted[0]!.date,
      lastDate: last.date,
      nextExpectedDate: new Date(last.date.getTime() + Math.round(medianGap) * DAY_MS),
      transactionIds: sorted.map((t) => t.id),
    })
  }

  // Biggest average spend first — the list users care about most.
  return series.sort((a, b) => b.averageAmount - a.averageAmount)
}

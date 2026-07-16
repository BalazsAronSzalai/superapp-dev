// Shared Zod 4 schemas for the Finance module (plan.md Phase 6 — PFM-only v1).
// Hand-copied to mobile/src/lib/schemas/finance.schemas.ts — keep both in sync
// (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Multi-currency v1 scope per plan.md Phase 6 (HUF/EUR; USD as a bonus). */
export const FINANCE_CURRENCIES = ["HUF", "EUR", "USD"] as const
export type FinanceCurrency = (typeof FINANCE_CURRENCIES)[number]
export const currencySchema = z.enum(FINANCE_CURRENCIES)

export const FINANCE_ACCOUNT_TYPES = ["checking", "savings", "cash", "card"] as const
export type FinanceAccountType = (typeof FINANCE_ACCOUNT_TYPES)[number]

/** Rule-based categorization taxonomy (services/categorize.ts). */
export const TRANSACTION_CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "shopping",
  "entertainment",
  "subscriptions",
  "utilities",
  "housing",
  "health",
  "travel",
  "cash",
  "fees",
  "transfer",
  "income",
  "other",
] as const
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number]
export const categorySchema = z.enum(TRANSACTION_CATEGORIES)

export const TRANSACTION_TYPES = ["debit", "credit"] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

// ---------------------------------------------------------------------------
// Requests — accounts
// ---------------------------------------------------------------------------

export const createFinanceAccountSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  name: z.string().min(1).max(120),
  type: z.enum(FINANCE_ACCOUNT_TYPES).default("checking"),
  color: z.string().max(32).nullable().optional(),
  currency: currencySchema.default("HUF"),
  /** Opening balance. Signed; defaults to 0. */
  initialBalance: z.number().min(-1_000_000_000).max(1_000_000_000).default(0),
})

export const patchFinanceAccountSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    type: z.enum(FINANCE_ACCOUNT_TYPES).optional(),
    color: z.string().max(32).nullable().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Requests — transactions
// ---------------------------------------------------------------------------

export const createTransactionSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  accountId: z.uuid(),
  /** Always positive; direction comes from `type`. */
  amount: z.number().positive().max(1_000_000_000),
  type: z.enum(TRANSACTION_TYPES),
  /** ISO datetime. */
  date: z.iso.datetime({ offset: true }),
  merchant: z.string().max(200).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  /** Omit to let the rule-based engine categorize automatically. */
  category: categorySchema.optional(),
  /** Base64 data-URL of a compressed receipt photo (v1; no OCR). ~2 MB cap. */
  receiptUrl: z.string().max(2_800_000).nullable().optional(),
  notes: z.string().max(1_000).nullable().optional(),
})

export const patchTransactionSchema = z
  .object({
    amount: z.number().positive().max(1_000_000_000).optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    date: z.iso.datetime({ offset: true }).optional(),
    merchant: z.string().max(200).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    category: categorySchema.nullable().optional(),
    receiptUrl: z.string().max(2_800_000).nullable().optional(),
    notes: z.string().max(1_000).nullable().optional(),
    isRecurring: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Requests — cards (mock virtual card, freeze/unfreeze; plan.md Phase 6)
// ---------------------------------------------------------------------------

export const createCardSchema = z.object({
  id: z.uuid().optional(),
  financeAccountId: z.uuid(),
  label: z.string().min(1).max(60),
})

export const patchCardSchema = z
  .object({
    label: z.string().min(1).max(60).optional(),
    isFrozen: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Requests — budgets
// ---------------------------------------------------------------------------

export const createBudgetSchema = z.object({
  id: z.uuid().optional(),
  category: categorySchema,
  /** Monthly cap in the base currency (HUF). */
  monthlyLimit: z.number().positive().max(1_000_000_000),
})

export const patchBudgetSchema = z
  .object({
    category: categorySchema.optional(),
    monthlyLimit: z.number().positive().max(1_000_000_000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Requests — recurring-payment reminder (superapp integration → Tasks module)
// ---------------------------------------------------------------------------

export const createRecurringReminderSchema = z.object({
  merchant: z.string().min(1).max(200),
  amount: z.number().positive().max(1_000_000_000),
  currency: currencySchema,
  /** When the next payment is expected (ISO datetime). */
  dueDate: z.iso.datetime({ offset: true }),
})

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const financeAccountSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  name: z.string(),
  type: z.enum(FINANCE_ACCOUNT_TYPES),
  color: z.string().nullable(),
  currency: currencySchema,
  balance: z.number(),
  isArchived: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  updatedAt: z.string(),
})

export const transactionSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  amount: z.number(),
  currency: currencySchema,
  category: categorySchema.nullable(),
  type: z.enum(TRANSACTION_TYPES),
  date: z.string(),
  description: z.string().nullable(),
  merchant: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  isRecurring: z.boolean(),
  notes: z.string().nullable(),
  updatedAt: z.string(),
})

export const financeCardSchema = z.object({
  id: z.uuid(),
  financeAccountId: z.uuid(),
  label: z.string(),
  last4: z.string(),
  expiryMonth: z.number(),
  expiryYear: z.number(),
  isFrozen: z.boolean(),
  updatedAt: z.string(),
})

export const budgetSchema = z.object({
  id: z.uuid(),
  category: categorySchema,
  /** Cap + spend both expressed in the base currency (HUF). */
  monthlyLimit: z.number(),
  spent: z.number(),
  currency: currencySchema,
})

/** One detected recurring series (services/recurring.ts). */
export const recurringSeriesSchema = z.object({
  /** Stable grouping key (normalized merchant + currency). */
  key: z.string(),
  merchant: z.string(),
  category: categorySchema.nullable(),
  currency: currencySchema,
  averageAmount: z.number(),
  /** Median gap between charges, in days (7 ≈ weekly, 30 ≈ monthly). */
  intervalDays: z.number(),
  occurrences: z.number(),
  firstDate: z.string(),
  lastDate: z.string(),
  nextExpectedDate: z.string(),
})

export const categorySpendSchema = z.object({
  category: categorySchema,
  /** Total spend for the period in base currency (HUF). */
  total: z.number(),
})

export const monthSpendSchema = z.object({
  /** "YYYY-MM" */
  month: z.string(),
  income: z.number(),
  spending: z.number(),
})

export const financeSummarySchema = z.object({
  baseCurrency: currencySchema,
  /** Sum of active account balances converted to base currency. */
  totalBalance: z.number(),
  /** "YYYY-MM" the per-category / income-spending figures refer to. */
  month: z.string(),
  monthIncome: z.number(),
  monthSpending: z.number(),
  spendingByCategory: z.array(categorySpendSchema),
  /** Last 6 months, oldest first. */
  monthlyTrend: z.array(monthSpendSchema),
})

export const fxRatesSchema = z.object({
  base: currencySchema,
  /** HUF per one unit of each currency. */
  rates: z.record(currencySchema, z.number()),
})

export const financeAccountsResponseSchema = z.object({
  accounts: z.array(financeAccountSchema),
})
export const financeAccountDetailResponseSchema = z.object({
  account: financeAccountSchema,
})
export const transactionsResponseSchema = z.object({
  transactions: z.array(transactionSchema),
})
export const transactionDetailResponseSchema = z.object({
  transaction: transactionSchema,
})
export const financeCardsResponseSchema = z.object({
  cards: z.array(financeCardSchema),
})
export const financeCardDetailResponseSchema = z.object({
  card: financeCardSchema,
})
export const budgetsResponseSchema = z.object({
  budgets: z.array(budgetSchema),
})
export const budgetDetailResponseSchema = z.object({
  budget: budgetSchema,
})
export const recurringResponseSchema = z.object({
  series: z.array(recurringSeriesSchema),
})
export const financeSummaryResponseSchema = z.object({
  summary: financeSummarySchema,
})
export const recurringReminderResponseSchema = z.object({
  task: z.object({
    id: z.uuid(),
    title: z.string(),
    dueDate: z.string().nullable(),
  }),
})

export type CreateFinanceAccountInput = z.infer<typeof createFinanceAccountSchema>
export type PatchFinanceAccountInput = z.infer<typeof patchFinanceAccountSchema>
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type PatchTransactionInput = z.infer<typeof patchTransactionSchema>
export type CreateCardInput = z.infer<typeof createCardSchema>
export type PatchCardInput = z.infer<typeof patchCardSchema>
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>
export type PatchBudgetInput = z.infer<typeof patchBudgetSchema>
export type CreateRecurringReminderInput = z.infer<typeof createRecurringReminderSchema>
export type FinanceAccount = z.infer<typeof financeAccountSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type FinanceCard = z.infer<typeof financeCardSchema>
export type Budget = z.infer<typeof budgetSchema>
export type RecurringSeries = z.infer<typeof recurringSeriesSchema>
export type CategorySpend = z.infer<typeof categorySpendSchema>
export type MonthSpend = z.infer<typeof monthSpendSchema>
export type FinanceSummary = z.infer<typeof financeSummarySchema>
export type FxRates = z.infer<typeof fxRatesSchema>
export type FinanceAccountsResponse = z.infer<typeof financeAccountsResponseSchema>
export type FinanceAccountDetailResponse = z.infer<typeof financeAccountDetailResponseSchema>
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>
export type TransactionDetailResponse = z.infer<typeof transactionDetailResponseSchema>
export type FinanceCardsResponse = z.infer<typeof financeCardsResponseSchema>
export type FinanceCardDetailResponse = z.infer<typeof financeCardDetailResponseSchema>
export type BudgetsResponse = z.infer<typeof budgetsResponseSchema>
export type BudgetDetailResponse = z.infer<typeof budgetDetailResponseSchema>
export type RecurringResponse = z.infer<typeof recurringResponseSchema>
export type FinanceSummaryResponse = z.infer<typeof financeSummaryResponseSchema>
export type RecurringReminderResponse = z.infer<typeof recurringReminderResponseSchema>

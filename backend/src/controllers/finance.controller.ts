import type { Request, Response } from "express"
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm"
import { randomUUID, randomInt } from "node:crypto"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import { categorizeTransaction } from "../services/categorize.js"
import { detectRecurring, type RecurringCandidateTxn } from "../services/recurring.js"
import { BASE_CURRENCY, FX_RATES, toBase } from "../services/fx.js"
import {
  FINANCE_CURRENCIES,
  TRANSACTION_CATEGORIES,
  type Budget,
  type CreateBudgetInput,
  type CreateCardInput,
  type CreateFinanceAccountInput,
  type CreateRecurringReminderInput,
  type CreateTransactionInput,
  type FinanceAccount,
  type FinanceCard,
  type FinanceCurrency,
  type MonthSpend,
  type PatchBudgetInput,
  type PatchCardInput,
  type PatchFinanceAccountInput,
  type PatchTransactionInput,
  type Transaction,
  type TransactionCategory,
} from "../shared/finance.schemas.js"

/** Express 5 types route params as string | string[]; normalize to string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

function asCurrency(value: string): FinanceCurrency {
  return (FINANCE_CURRENCIES as readonly string[]).includes(value)
    ? (value as FinanceCurrency)
    : "HUF"
}

function asCategory(value: string | null): TransactionCategory | null {
  if (value == null) return null
  return (TRANSACTION_CATEGORIES as readonly string[]).includes(value)
    ? (value as TransactionCategory)
    : "other"
}

// ---------------------------------------------------------------------------
// Ownership helpers
// ---------------------------------------------------------------------------

async function getOwnedAccount(userId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(schema.financeAccounts)
    .where(
      and(eq(schema.financeAccounts.id, accountId), eq(schema.financeAccounts.userId, userId)),
    )
    .limit(1)
  if (!account) throw new HttpError(404, "Account not found")
  return account
}

/** Fetch a transaction joined with its (owned) account. */
async function getOwnedTransaction(userId: string, transactionId: string) {
  const [row] = await db
    .select({
      transaction: schema.transactions,
      account: schema.financeAccounts,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.financeAccounts,
      eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
    )
    .where(
      and(
        eq(schema.transactions.id, transactionId),
        eq(schema.financeAccounts.userId, userId),
      ),
    )
    .limit(1)
  if (!row) throw new HttpError(404, "Transaction not found")
  return row
}

async function getOwnedCard(userId: string, cardId: string) {
  const [card] = await db
    .select()
    .from(schema.financeCards)
    .where(and(eq(schema.financeCards.id, cardId), eq(schema.financeCards.userId, userId)))
    .limit(1)
  if (!card) throw new HttpError(404, "Card not found")
  return card
}

async function getOwnedBudget(userId: string, budgetId: string) {
  const [budget] = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.id, budgetId), eq(schema.budgets.userId, userId)))
    .limit(1)
  if (!budget) throw new HttpError(404, "Budget not found")
  return budget
}

// ---------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------

function toAccountDto(row: typeof schema.financeAccounts.$inferSelect): FinanceAccount {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    type: row.type,
    color: row.color,
    currency: asCurrency(row.currency),
    balance: Number(row.balance),
    isArchived: row.isArchived,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toTransactionDto(row: typeof schema.transactions.$inferSelect): Transaction {
  return {
    id: row.id,
    accountId: row.financeAccountId,
    amount: Number(row.amount),
    currency: asCurrency(row.currency),
    category: asCategory(row.category),
    type: row.type,
    date: row.date.toISOString(),
    description: row.description,
    merchant: row.merchant,
    receiptUrl: row.receiptUrl,
    isRecurring: row.isRecurring,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toCardDto(row: typeof schema.financeCards.$inferSelect): FinanceCard {
  return {
    id: row.id,
    financeAccountId: row.financeAccountId,
    label: row.label,
    last4: row.last4,
    expiryMonth: row.expiryMonth,
    expiryYear: row.expiryYear,
    isFrozen: row.isFrozen,
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Balance bookkeeping
// ---------------------------------------------------------------------------

/** Signed balance effect of a transaction: credits add, debits subtract. */
function signedDelta(amount: number, type: "debit" | "credit"): number {
  return type === "credit" ? amount : -amount
}

async function applyBalanceDelta(accountId: string, delta: number) {
  if (delta === 0) return
  await db
    .update(schema.financeAccounts)
    .set({
      balance: sql`${schema.financeAccounts.balance} + ${delta.toFixed(2)}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.financeAccounts.id, accountId))
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listAccounts(req: Request, res: Response) {
  const includeArchived = req.query.includeArchived === "true"
  const where = [eq(schema.financeAccounts.userId, req.userId!)]
  if (!includeArchived) where.push(eq(schema.financeAccounts.isArchived, false))

  const rows = await db
    .select()
    .from(schema.financeAccounts)
    .where(and(...where))
    .orderBy(desc(schema.financeAccounts.updatedAt))
  res.json({ accounts: rows.map(toAccountDto) })
}

export async function createAccount(req: Request, res: Response) {
  const input = req.body as CreateFinanceAccountInput
  const [account] = await db
    .insert(schema.financeAccounts)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      provider: "manual",
      name: input.name,
      type: input.type,
      color: input.color ?? null,
      currency: input.currency,
      balance: input.initialBalance.toFixed(2),
    })
    .returning()
  if (!account) throw new HttpError(500, "Failed to create account")
  res.status(201).json({ account: toAccountDto(account) })
}

export async function patchAccount(req: Request, res: Response) {
  const input = req.body as PatchFinanceAccountInput
  const account = await getOwnedAccount(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.financeAccounts.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) set.name = input.name
  if (input.type !== undefined) set.type = input.type
  if (input.color !== undefined) set.color = input.color
  if (input.isArchived !== undefined) set.isArchived = input.isArchived

  const [updated] = await db
    .update(schema.financeAccounts)
    .set(set)
    .where(eq(schema.financeAccounts.id, account.id))
    .returning()
  res.json({ account: toAccountDto(updated!) })
}

export async function deleteAccount(req: Request, res: Response) {
  const account = await getOwnedAccount(req.userId!, param(req.params.id))
  // transactions + finance_cards have ON DELETE CASCADE.
  await db.delete(schema.financeAccounts).where(eq(schema.financeAccounts.id, account.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function listTransactions(req: Request, res: Response) {
  const accountId = req.query.accountId as string | undefined
  const category = req.query.category as string | undefined
  const type = req.query.type as string | undefined
  const from = req.query.from as string | undefined
  const to = req.query.to as string | undefined
  const q = ((req.query.q as string | undefined) ?? "").trim()
  const limit = Math.min(Number.parseInt((req.query.limit as string) ?? "100", 10) || 100, 500)

  const where = [eq(schema.financeAccounts.userId, req.userId!)]
  if (accountId) {
    await getOwnedAccount(req.userId!, accountId)
    where.push(eq(schema.transactions.financeAccountId, accountId))
  }
  if (category) where.push(eq(schema.transactions.category, category))
  if (type === "debit" || type === "credit") {
    where.push(eq(schema.transactions.type, type))
  }
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) where.push(gte(schema.transactions.date, d))
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) where.push(lte(schema.transactions.date, d))
  }
  if (q.length > 0) {
    const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    where.push(
      or(
        ilike(schema.transactions.merchant, pattern),
        ilike(schema.transactions.description, pattern),
        ilike(schema.transactions.notes, pattern),
      )!,
    )
  }

  const rows = await db
    .select({ transaction: schema.transactions })
    .from(schema.transactions)
    .innerJoin(
      schema.financeAccounts,
      eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
    )
    .where(and(...where))
    .orderBy(desc(schema.transactions.date))
    .limit(limit)

  res.json({ transactions: rows.map((r) => toTransactionDto(r.transaction)) })
}

export async function createTransaction(req: Request, res: Response) {
  const input = req.body as CreateTransactionInput
  const account = await getOwnedAccount(req.userId!, input.accountId)
  if (account.isArchived) throw new HttpError(400, "Account is archived")

  const category =
    input.category ?? categorizeTransaction(input.merchant, input.description, input.type)

  const [transaction] = await db
    .insert(schema.transactions)
    .values({
      id: input.id ?? randomUUID(),
      financeAccountId: account.id,
      amount: input.amount.toFixed(2),
      currency: account.currency,
      category,
      type: input.type,
      date: new Date(input.date),
      description: input.description ?? null,
      merchant: input.merchant ?? null,
      receiptUrl: input.receiptUrl ?? null,
      notes: input.notes ?? null,
    })
    .returning()
  if (!transaction) throw new HttpError(500, "Failed to create transaction")

  await applyBalanceDelta(account.id, signedDelta(input.amount, input.type))
  res.status(201).json({ transaction: toTransactionDto(transaction) })
}

export async function getTransaction(req: Request, res: Response) {
  const { transaction } = await getOwnedTransaction(req.userId!, param(req.params.id))
  res.json({ transaction: toTransactionDto(transaction) })
}

export async function patchTransaction(req: Request, res: Response) {
  const input = req.body as PatchTransactionInput
  const { transaction } = await getOwnedTransaction(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.transactions.$inferInsert> = { updatedAt: new Date() }
  if (input.amount !== undefined) set.amount = input.amount.toFixed(2)
  if (input.type !== undefined) set.type = input.type
  if (input.date !== undefined) set.date = new Date(input.date)
  if (input.merchant !== undefined) set.merchant = input.merchant
  if (input.description !== undefined) set.description = input.description
  if (input.category !== undefined) set.category = input.category
  if (input.receiptUrl !== undefined) set.receiptUrl = input.receiptUrl
  if (input.notes !== undefined) set.notes = input.notes
  if (input.isRecurring !== undefined) set.isRecurring = input.isRecurring

  const [updated] = await db
    .update(schema.transactions)
    .set(set)
    .where(eq(schema.transactions.id, transaction.id))
    .returning()

  // Rebalance when the amount or direction changed.
  const oldDelta = signedDelta(Number(transaction.amount), transaction.type)
  const newDelta = signedDelta(Number(updated!.amount), updated!.type)
  if (oldDelta !== newDelta) {
    await applyBalanceDelta(transaction.financeAccountId, newDelta - oldDelta)
  }

  res.json({ transaction: toTransactionDto(updated!) })
}

export async function deleteTransaction(req: Request, res: Response) {
  const { transaction } = await getOwnedTransaction(req.userId!, param(req.params.id))
  await db.delete(schema.transactions).where(eq(schema.transactions.id, transaction.id))
  // Revert the balance effect.
  await applyBalanceDelta(
    transaction.financeAccountId,
    -signedDelta(Number(transaction.amount), transaction.type),
  )
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Cards (mock virtual card with persisted freeze state)
// ---------------------------------------------------------------------------

export async function listCards(req: Request, res: Response) {
  const rows = await db
    .select()
    .from(schema.financeCards)
    .where(eq(schema.financeCards.userId, req.userId!))
    .orderBy(desc(schema.financeCards.updatedAt))
  res.json({ cards: rows.map(toCardDto) })
}

export async function createCard(req: Request, res: Response) {
  const input = req.body as CreateCardInput
  const account = await getOwnedAccount(req.userId!, input.financeAccountId)

  // Mock issuing: random last4, expiry 4 years out (no real PAN anywhere).
  const now = new Date()
  const [card] = await db
    .insert(schema.financeCards)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      financeAccountId: account.id,
      label: input.label,
      last4: String(randomInt(0, 10_000)).padStart(4, "0"),
      expiryMonth: now.getMonth() + 1,
      expiryYear: now.getFullYear() + 4,
    })
    .returning()
  if (!card) throw new HttpError(500, "Failed to create card")
  res.status(201).json({ card: toCardDto(card) })
}

export async function patchCard(req: Request, res: Response) {
  const input = req.body as PatchCardInput
  const card = await getOwnedCard(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.financeCards.$inferInsert> = { updatedAt: new Date() }
  if (input.label !== undefined) set.label = input.label
  if (input.isFrozen !== undefined) set.isFrozen = input.isFrozen

  const [updated] = await db
    .update(schema.financeCards)
    .set(set)
    .where(eq(schema.financeCards.id, card.id))
    .returning()
  res.json({ card: toCardDto(updated!) })
}

export async function deleteCard(req: Request, res: Response) {
  const card = await getOwnedCard(req.userId!, param(req.params.id))
  await db.delete(schema.financeCards).where(eq(schema.financeCards.id, card.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Budgets (monthly caps per category, tracked in base currency)
// ---------------------------------------------------------------------------

/** Sum current-month debit spend per category (converted to HUF). */
async function currentMonthSpendByCategory(
  userId: string,
): Promise<Map<string, number>> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const rows = await db
    .select({
      category: schema.transactions.category,
      amount: schema.transactions.amount,
      currency: schema.transactions.currency,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.financeAccounts,
      eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
    )
    .where(
      and(
        eq(schema.financeAccounts.userId, userId),
        eq(schema.transactions.type, "debit"),
        gte(schema.transactions.date, monthStart),
      ),
    )

  const spend = new Map<string, number>()
  for (const r of rows) {
    const key = r.category ?? "other"
    const huf = toBase(Number(r.amount), asCurrency(r.currency))
    spend.set(key, (spend.get(key) ?? 0) + huf)
  }
  return spend
}

function toBudgetDto(row: typeof schema.budgets.$inferSelect, spent: number): Budget {
  return {
    id: row.id,
    category: asCategory(row.category) ?? "other",
    monthlyLimit: Number(row.monthlyLimit),
    spent: Math.round(spent * 100) / 100,
    currency: BASE_CURRENCY,
  }
}

export async function listBudgets(req: Request, res: Response) {
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.userId, req.userId!))
    .orderBy(desc(schema.budgets.monthlyLimit))
  const spend = await currentMonthSpendByCategory(req.userId!)
  res.json({ budgets: rows.map((b) => toBudgetDto(b, spend.get(b.category) ?? 0)) })
}

export async function createBudget(req: Request, res: Response) {
  const input = req.body as CreateBudgetInput

  const [existing] = await db
    .select({ id: schema.budgets.id })
    .from(schema.budgets)
    .where(
      and(eq(schema.budgets.userId, req.userId!), eq(schema.budgets.category, input.category)),
    )
    .limit(1)
  if (existing) throw new HttpError(409, "A budget for this category already exists")

  const now = new Date()
  const [budget] = await db
    .insert(schema.budgets)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      category: input.category,
      monthlyLimit: input.monthlyLimit.toFixed(2),
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    })
    .returning()
  if (!budget) throw new HttpError(500, "Failed to create budget")
  const spend = await currentMonthSpendByCategory(req.userId!)
  res.status(201).json({ budget: toBudgetDto(budget, spend.get(budget.category) ?? 0) })
}

export async function patchBudget(req: Request, res: Response) {
  const input = req.body as PatchBudgetInput
  const budget = await getOwnedBudget(req.userId!, param(req.params.id))

  if (input.category !== undefined && input.category !== budget.category) {
    const [existing] = await db
      .select({ id: schema.budgets.id })
      .from(schema.budgets)
      .where(
        and(
          eq(schema.budgets.userId, req.userId!),
          eq(schema.budgets.category, input.category),
        ),
      )
      .limit(1)
    if (existing) throw new HttpError(409, "A budget for this category already exists")
  }

  const set: Partial<typeof schema.budgets.$inferInsert> = { updatedAt: new Date() }
  if (input.category !== undefined) set.category = input.category
  if (input.monthlyLimit !== undefined) set.monthlyLimit = input.monthlyLimit.toFixed(2)

  const [updated] = await db
    .update(schema.budgets)
    .set(set)
    .where(eq(schema.budgets.id, budget.id))
    .returning()
  const spend = await currentMonthSpendByCategory(req.userId!)
  res.json({ budget: toBudgetDto(updated!, spend.get(updated!.category) ?? 0) })
}

export async function deleteBudget(req: Request, res: Response) {
  const budget = await getOwnedBudget(req.userId!, param(req.params.id))
  await db.delete(schema.budgets).where(eq(schema.budgets.id, budget.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** "YYYY-MM" key in UTC. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export async function getSummary(req: Request, res: Response) {
  const monthParam = (req.query.month as string | undefined) ?? ""
  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() // 0-based
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam)
  if (m) {
    year = Number(m[1])
    month = Number(m[2]) - 1
    if (month < 0 || month > 11) throw new HttpError(400, "Invalid month")
  }
  const selectedKey = `${year}-${String(month + 1).padStart(2, "0")}`

  // Total balance across active accounts, converted to HUF.
  const accounts = await db
    .select()
    .from(schema.financeAccounts)
    .where(
      and(
        eq(schema.financeAccounts.userId, req.userId!),
        eq(schema.financeAccounts.isArchived, false),
      ),
    )
  const totalBalance =
    Math.round(
      accounts.reduce(
        (sum, a) => sum + toBase(Number(a.balance), asCurrency(a.currency)),
        0,
      ) * 100,
    ) / 100

  // One fetch covers the selected month + 6-month trend window.
  const trendStart = new Date(Date.UTC(year, month - 5, 1))
  const windowStart = trendStart.getTime() < Date.UTC(year, month, 1) ? trendStart : new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 1))

  const rows = await db
    .select({ transaction: schema.transactions })
    .from(schema.transactions)
    .innerJoin(
      schema.financeAccounts,
      eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
    )
    .where(
      and(
        eq(schema.financeAccounts.userId, req.userId!),
        gte(schema.transactions.date, windowStart),
        lte(schema.transactions.date, monthEnd),
      ),
    )
    .limit(10_000)

  let monthIncome = 0
  let monthSpending = 0
  const byCategory = new Map<string, number>()
  const trend = new Map<string, { income: number; spending: number }>()
  // Seed the 6 trend buckets (oldest first) so empty months render as 0.
  const trendKeys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const key = monthKey(new Date(Date.UTC(year, month - i, 1)))
    trendKeys.push(key)
    trend.set(key, { income: 0, spending: 0 })
  }

  for (const { transaction: t } of rows) {
    if (t.date.getTime() >= monthEnd.getTime()) continue
    const huf = toBase(Number(t.amount), asCurrency(t.currency))
    const key = monthKey(t.date)

    const bucket = trend.get(key)
    if (bucket) {
      if (t.type === "credit") bucket.income += huf
      else bucket.spending += huf
    }

    if (key === selectedKey) {
      if (t.type === "credit") {
        monthIncome += huf
      } else {
        monthSpending += huf
        const cat = t.category ?? "other"
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + huf)
      }
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const monthlyTrend: MonthSpend[] = trendKeys.map((key) => ({
    month: key,
    income: round2(trend.get(key)!.income),
    spending: round2(trend.get(key)!.spending),
  }))

  res.json({
    summary: {
      baseCurrency: BASE_CURRENCY,
      totalBalance,
      month: selectedKey,
      monthIncome: round2(monthIncome),
      monthSpending: round2(monthSpending),
      spendingByCategory: [...byCategory.entries()]
        .map(([category, total]) => ({ category, total: round2(total) }))
        .sort((a, b) => b.total - a.total),
      monthlyTrend,
    },
  })
}

export async function getRates(_req: Request, res: Response) {
  res.json({ base: BASE_CURRENCY, rates: FX_RATES })
}

// ---------------------------------------------------------------------------
// Recurring-payment detection (+ Tasks-module reminder integration)
// ---------------------------------------------------------------------------

export async function listRecurring(req: Request, res: Response) {
  // Look back 12 months — enough to establish monthly + quarterly cadences.
  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - 12)

  const rows = await db
    .select({ transaction: schema.transactions })
    .from(schema.transactions)
    .innerJoin(
      schema.financeAccounts,
      eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
    )
    .where(
      and(
        eq(schema.financeAccounts.userId, req.userId!),
        gte(schema.transactions.date, since),
      ),
    )
    .limit(10_000)

  const candidates: RecurringCandidateTxn[] = rows.map(({ transaction: t }) => ({
    id: t.id,
    merchant: t.merchant,
    description: t.description,
    amount: Number(t.amount),
    currency: asCurrency(t.currency),
    category: asCategory(t.category),
    type: t.type,
    date: t.date,
  }))

  const series = detectRecurring(candidates)

  // Best-effort: persist the is_recurring flag on matched transactions.
  const matchedIds = series.flatMap((s) => s.transactionIds)
  if (matchedIds.length > 0) {
    await db
      .update(schema.transactions)
      .set({ isRecurring: true })
      .where(
        and(
          inArray(schema.transactions.id, matchedIds),
          eq(schema.transactions.isRecurring, false),
        ),
      )
  }

  res.json({
    series: series.map((s) => ({
      key: s.key,
      merchant: s.merchant,
      category: s.category,
      currency: s.currency,
      averageAmount: s.averageAmount,
      intervalDays: s.intervalDays,
      occurrences: s.occurrences,
      firstDate: s.firstDate.toISOString(),
      lastDate: s.lastDate.toISOString(),
      nextExpectedDate: s.nextExpectedDate.toISOString(),
    })),
  })
}

/**
 * Superapp integration (plan.md Phase 6): create a To-Do reminder for an
 * upcoming recurring payment. The task lands in the Tasks module (and, via
 * the Phase 4 task overlay, in Calendar views too).
 */
export async function createRecurringReminder(req: Request, res: Response) {
  const input = req.body as CreateRecurringReminderInput

  const formatted =
    input.currency === "HUF"
      ? `${Math.round(input.amount).toLocaleString("hu-HU")} Ft`
      : `${input.amount.toFixed(2)} ${input.currency}`
  const title = `Pay ${input.merchant} (~${formatted})`
  const dueDate = new Date(input.dueDate)

  const [task] = await db
    .insert(schema.tasks)
    .values({
      id: randomUUID(),
      userId: req.userId!,
      title,
      description: `Recurring payment reminder created from Finance.`,
      dueDate,
      tagsJson: ["finance", "recurring"],
    })
    .returning()
  if (!task) throw new HttpError(500, "Failed to create reminder task")

  res.status(201).json({
    task: {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate?.toISOString() ?? null,
    },
  })
}

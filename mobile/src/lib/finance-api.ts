// Typed API calls for the Finance module (backend: /api/finance/*).
import { api } from "./api"
import type {
  BudgetDetailResponse,
  BudgetsResponse,
  CreateBudgetInput,
  CreateCardInput,
  CreateFinanceAccountInput,
  CreateRecurringReminderInput,
  CreateTransactionInput,
  FinanceAccountDetailResponse,
  FinanceAccountsResponse,
  FinanceCardDetailResponse,
  FinanceCardsResponse,
  FinanceSummaryResponse,
  FxRates,
  PatchBudgetInput,
  PatchCardInput,
  PatchFinanceAccountInput,
  PatchTransactionInput,
  RecurringReminderResponse,
  RecurringResponse,
  TransactionDetailResponse,
  TransactionsResponse,
} from "./schemas/finance.schemas"

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listFinanceAccounts(includeArchived = false) {
  const query = includeArchived ? "?includeArchived=true" : ""
  return api<FinanceAccountsResponse>(`/api/finance/accounts${query}`)
}

export async function createFinanceAccount(input: CreateFinanceAccountInput) {
  return api<FinanceAccountDetailResponse>("/api/finance/accounts", {
    method: "POST",
    body: input,
  })
}

export async function patchFinanceAccount(id: string, input: PatchFinanceAccountInput) {
  return api<FinanceAccountDetailResponse>(`/api/finance/accounts/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteFinanceAccount(id: string) {
  return api<void>(`/api/finance/accounts/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface ListTransactionsParams {
  accountId?: string
  category?: string
  type?: "debit" | "credit"
  /** ISO datetime lower bound (inclusive). */
  from?: string
  /** ISO datetime upper bound (inclusive). */
  to?: string
  /** Free-text search across merchant/description/notes. */
  q?: string
  limit?: number
}

export async function listTransactions(params: ListTransactionsParams = {}) {
  const qs = new URLSearchParams()
  if (params.accountId) qs.set("accountId", params.accountId)
  if (params.category) qs.set("category", params.category)
  if (params.type) qs.set("type", params.type)
  if (params.from) qs.set("from", params.from)
  if (params.to) qs.set("to", params.to)
  if (params.q) qs.set("q", params.q)
  if (params.limit) qs.set("limit", String(params.limit))
  const query = qs.toString()
  return api<TransactionsResponse>(`/api/finance/transactions${query ? `?${query}` : ""}`)
}

export async function createTransaction(input: CreateTransactionInput) {
  return api<TransactionDetailResponse>("/api/finance/transactions", {
    method: "POST",
    body: input,
  })
}

export async function getTransaction(id: string) {
  return api<TransactionDetailResponse>(`/api/finance/transactions/${id}`)
}

export async function patchTransaction(id: string, input: PatchTransactionInput) {
  return api<TransactionDetailResponse>(`/api/finance/transactions/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteTransaction(id: string) {
  return api<void>(`/api/finance/transactions/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Cards (mock virtual card, freeze/unfreeze)
// ---------------------------------------------------------------------------

export async function listCards() {
  return api<FinanceCardsResponse>("/api/finance/cards")
}

export async function createCard(input: CreateCardInput) {
  return api<FinanceCardDetailResponse>("/api/finance/cards", { method: "POST", body: input })
}

export async function patchCard(id: string, input: PatchCardInput) {
  return api<FinanceCardDetailResponse>(`/api/finance/cards/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteCard(id: string) {
  return api<void>(`/api/finance/cards/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export async function listBudgets() {
  return api<BudgetsResponse>("/api/finance/budgets")
}

export async function createBudget(input: CreateBudgetInput) {
  return api<BudgetDetailResponse>("/api/finance/budgets", { method: "POST", body: input })
}

export async function patchBudget(id: string, input: PatchBudgetInput) {
  return api<BudgetDetailResponse>(`/api/finance/budgets/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteBudget(id: string) {
  return api<void>(`/api/finance/budgets/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Analytics + FX + recurring
// ---------------------------------------------------------------------------

export async function getFinanceSummary(month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : ""
  return api<FinanceSummaryResponse>(`/api/finance/analytics/summary${query}`)
}

export async function getFxRates() {
  return api<FxRates>("/api/finance/rates")
}

export async function listRecurring() {
  return api<RecurringResponse>("/api/finance/recurring")
}

export async function createRecurringReminder(input: CreateRecurringReminderInput) {
  return api<RecurringReminderResponse>("/api/finance/recurring/reminder", {
    method: "POST",
    body: input,
  })
}

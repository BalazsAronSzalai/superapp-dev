// TanStack Query 5 hooks for the Finance module.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as financeApi from "@/lib/finance-api"
import type { ListTransactionsParams } from "@/lib/finance-api"
import type {
  CreateBudgetInput,
  CreateCardInput,
  CreateFinanceAccountInput,
  CreateRecurringReminderInput,
  CreateTransactionInput,
  PatchBudgetInput,
  PatchCardInput,
  PatchFinanceAccountInput,
  PatchTransactionInput,
} from "@/lib/schemas/finance.schemas"

export const financeKeys = {
  all: ["finance"] as const,
  accounts: () => [...financeKeys.all, "accounts"] as const,
  transactions: () => [...financeKeys.all, "transactions"] as const,
  transactionList: (params: ListTransactionsParams) =>
    [
      ...financeKeys.transactions(),
      params.accountId ?? "all",
      params.category ?? "any",
      params.type ?? "any",
      params.from ?? "",
      params.to ?? "",
      params.q ?? "",
    ] as const,
  transaction: (id: string) => [...financeKeys.all, "transaction", id] as const,
  cards: () => [...financeKeys.all, "cards"] as const,
  budgets: () => [...financeKeys.all, "budgets"] as const,
  summary: (month?: string) => [...financeKeys.all, "summary", month ?? "current"] as const,
  rates: () => [...financeKeys.all, "rates"] as const,
  recurring: () => [...financeKeys.all, "recurring"] as const,
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function useFinanceAccounts(includeArchived = false) {
  return useQuery({
    queryKey: [...financeKeys.accounts(), includeArchived] as const,
    queryFn: () => financeApi.listFinanceAccounts(includeArchived),
    select: (d) => d.accounts,
  })
}

export function useCreateFinanceAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFinanceAccountInput) => financeApi.createFinanceAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
    },
  })
}

export function usePatchFinanceAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchFinanceAccountInput }) =>
      financeApi.patchFinanceAccount(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
    },
  })
}

export function useDeleteFinanceAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteFinanceAccount(id),
    onSuccess: () => {
      // Transactions + cards cascade with the account — refresh everything.
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Transactions (mutations touch balances → invalidate accounts + analytics)
// ---------------------------------------------------------------------------

export function useTransactions(params: ListTransactionsParams = {}) {
  return useQuery({
    queryKey: financeKeys.transactionList(params),
    queryFn: () => financeApi.listTransactions(params),
    select: (d) => d.transactions,
  })
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.transaction(id ?? ""),
    queryFn: () => financeApi.getTransaction(id!),
    select: (d) => d.transaction,
    enabled: !!id,
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => financeApi.createTransaction(input),
    onSuccess: (data) => {
      queryClient.setQueryData(financeKeys.transaction(data.transaction.id), data)
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
    },
  })
}

export function usePatchTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTransactionInput }) =>
      financeApi.patchTransaction(id, input),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(financeKeys.transaction(id), data)
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function useFinanceCards() {
  return useQuery({
    queryKey: financeKeys.cards(),
    queryFn: financeApi.listCards,
    select: (d) => d.cards,
  })
}

export function useCreateCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCardInput) => financeApi.createCard(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.cards() })
    },
  })
}

export function usePatchCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchCardInput }) =>
      financeApi.patchCard(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.cards() })
    },
  })
}

export function useDeleteCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.cards() })
    },
  })
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export function useBudgets() {
  return useQuery({
    queryKey: financeKeys.budgets(),
    queryFn: financeApi.listBudgets,
    select: (d) => d.budgets,
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBudgetInput) => financeApi.createBudget(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() })
    },
  })
}

export function usePatchBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchBudgetInput }) =>
      financeApi.patchBudget(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() })
    },
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() })
    },
  })
}

// ---------------------------------------------------------------------------
// Analytics + FX + recurring
// ---------------------------------------------------------------------------

export function useFinanceSummary(month?: string) {
  return useQuery({
    queryKey: financeKeys.summary(month),
    queryFn: () => financeApi.getFinanceSummary(month),
    select: (d) => d.summary,
  })
}

export function useFxRates() {
  return useQuery({
    queryKey: financeKeys.rates(),
    queryFn: financeApi.getFxRates,
    // Static v1 snapshot server-side — no need to refetch aggressively.
    staleTime: 60 * 60 * 1000,
  })
}

export function useRecurring() {
  return useQuery({
    queryKey: financeKeys.recurring(),
    queryFn: financeApi.listRecurring,
    select: (d) => d.series,
  })
}

export function useCreateRecurringReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRecurringReminderInput) =>
      financeApi.createRecurringReminder(input),
    onSuccess: () => {
      // The reminder lands in the Tasks module.
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import {
  createFinanceAccountSchema,
  patchFinanceAccountSchema,
  createTransactionSchema,
  patchTransactionSchema,
  createCardSchema,
  patchCardSchema,
  createBudgetSchema,
  patchBudgetSchema,
  createRecurringReminderSchema,
} from "../shared/finance.schemas.js"
import {
  listAccounts,
  createAccount,
  patchAccount,
  deleteAccount,
  listTransactions,
  createTransaction,
  getTransaction,
  patchTransaction,
  deleteTransaction,
  listCards,
  createCard,
  patchCard,
  deleteCard,
  listBudgets,
  createBudget,
  patchBudget,
  deleteBudget,
  getSummary,
  getRates,
  listRecurring,
  createRecurringReminder,
} from "../controllers/finance.controller.js"

export const financeRouter = Router()

financeRouter.use(requireAuth)

// Accounts.
financeRouter.get("/accounts", listAccounts)
financeRouter.post("/accounts", validateBody(createFinanceAccountSchema), createAccount)
financeRouter.patch("/accounts/:id", validateBody(patchFinanceAccountSchema), patchAccount)
financeRouter.delete("/accounts/:id", deleteAccount)

// Transactions.
financeRouter.get("/transactions", listTransactions)
financeRouter.post("/transactions", validateBody(createTransactionSchema), createTransaction)
financeRouter.get("/transactions/:id", getTransaction)
financeRouter.patch("/transactions/:id", validateBody(patchTransactionSchema), patchTransaction)
financeRouter.delete("/transactions/:id", deleteTransaction)

// Cards (mock virtual card, freeze/unfreeze).
financeRouter.get("/cards", listCards)
financeRouter.post("/cards", validateBody(createCardSchema), createCard)
financeRouter.patch("/cards/:id", validateBody(patchCardSchema), patchCard)
financeRouter.delete("/cards/:id", deleteCard)

// Budgets.
financeRouter.get("/budgets", listBudgets)
financeRouter.post("/budgets", validateBody(createBudgetSchema), createBudget)
financeRouter.patch("/budgets/:id", validateBody(patchBudgetSchema), patchBudget)
financeRouter.delete("/budgets/:id", deleteBudget)

// Analytics + FX.
financeRouter.get("/analytics/summary", getSummary)
financeRouter.get("/rates", getRates)

// Recurring-payment detection + Tasks-module reminder integration.
financeRouter.get("/recurring", listRecurring)
financeRouter.post(
  "/recurring/reminder",
  validateBody(createRecurringReminderSchema),
  createRecurringReminder,
)

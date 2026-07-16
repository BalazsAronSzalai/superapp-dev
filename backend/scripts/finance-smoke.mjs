// Smoke test for the finance module API (run against a locally started server).
// Usage: node scripts/finance-smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3999"

let failures = 0
function check(name, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL"
  if (!ok) failures++
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ""}`)
}

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

const DAY_MS = 24 * 60 * 60 * 1000
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY_MS).toISOString()

// 1. Register a fresh user
const email = `finance-smoke-${Date.now()}@test.dev`
const reg = await req("/api/auth/register", {
  method: "POST",
  body: { email, password: "Sm0ke-test-pass!", name: "Finance Smoke" },
})
check("register user", reg.status === 201 || reg.status === 200, `status ${reg.status}`)
const token = reg.json?.tokens?.accessToken
check("access token issued", typeof token === "string" && token.length > 20)

// 2. Auth guard
const unauth = await req("/api/finance/accounts")
check("finance endpoints require auth", unauth.status === 401, `status ${unauth.status}`)

// 3. Accounts — empty list, validation, create HUF + EUR
const emptyAcc = await req("/api/finance/accounts", { token })
check(
  "list accounts (empty)",
  emptyAcc.status === 200 && Array.isArray(emptyAcc.json?.accounts) && emptyAcc.json.accounts.length === 0,
  `status ${emptyAcc.status}`,
)

const badAcc = await req("/api/finance/accounts", { method: "POST", token, body: { name: "" } })
check("zod validation rejects bad account", badAcc.status === 400, `status ${badAcc.status}`)

const accA = await req("/api/finance/accounts", {
  method: "POST",
  token,
  body: { name: "OTP Checking", type: "checking", currency: "HUF", initialBalance: 100000 },
})
check(
  "create HUF checking account",
  accA.status === 201 && accA.json?.account?.balance === 100000 && accA.json.account.currency === "HUF",
  `status ${accA.status}`,
)
const accAId = accA.json?.account?.id

const accB = await req("/api/finance/accounts", {
  method: "POST",
  token,
  body: { name: "Revolut Savings", type: "savings", currency: "EUR", initialBalance: 100 },
})
check("create EUR savings account", accB.status === 201 && accB.json?.account?.currency === "EUR", `status ${accB.status}`)
const accBId = accB.json?.account?.id

const renamed = await req(`/api/finance/accounts/${accAId}`, {
  method: "PATCH",
  token,
  body: { name: "OTP Main", color: "#0a7d4f" },
})
check(
  "patch account name + color",
  renamed.status === 200 && renamed.json?.account?.name === "OTP Main" && renamed.json.account.color === "#0a7d4f",
  `status ${renamed.status}`,
)

// 4. Transactions — auto-categorization + balance bookkeeping
const txnGroceries = await req("/api/finance/transactions", {
  method: "POST",
  token,
  body: { accountId: accAId, amount: 12000, type: "debit", date: iso(), merchant: "Lidl Budapest" },
})
check(
  "create debit auto-categorized as groceries",
  txnGroceries.status === 201 && txnGroceries.json?.transaction?.category === "groceries",
  `status ${txnGroceries.status}, category ${txnGroceries.json?.transaction?.category}`,
)
const txnGroceriesId = txnGroceries.json?.transaction?.id

const txnSalary = await req("/api/finance/transactions", {
  method: "POST",
  token,
  body: {
    accountId: accAId,
    amount: 500000,
    type: "credit",
    date: iso(),
    merchant: "Acme Kft",
    description: "Monthly salary",
  },
})
check(
  "create credit auto-categorized as income",
  txnSalary.status === 201 && txnSalary.json?.transaction?.category === "income",
  `status ${txnSalary.status}, category ${txnSalary.json?.transaction?.category}`,
)
const txnSalaryId = txnSalary.json?.transaction?.id

let accounts = await req("/api/finance/accounts", { token })
let balA = accounts.json?.accounts?.find((a) => a.id === accAId)?.balance
check("balance updated by debit + credit", balA === 100000 - 12000 + 500000, `balance ${balA}`)

const badTxn = await req("/api/finance/transactions", {
  method: "POST",
  token,
  body: { accountId: accAId, amount: -5, type: "debit", date: iso() },
})
check("zod validation rejects bad transaction", badTxn.status === 400, `status ${badTxn.status}`)

// Archived accounts refuse new transactions.
await req(`/api/finance/accounts/${accBId}`, { method: "PATCH", token, body: { isArchived: true } })
const archivedTxn = await req("/api/finance/transactions", {
  method: "POST",
  token,
  body: { accountId: accBId, amount: 10, type: "debit", date: iso() },
})
check("archived account rejects transactions", archivedTxn.status === 400, `status ${archivedTxn.status}`)

const activeOnly = await req("/api/finance/accounts", { token })
check(
  "archived account hidden by default",
  activeOnly.status === 200 && !activeOnly.json?.accounts?.some((a) => a.id === accBId),
)
const withArchived = await req("/api/finance/accounts?includeArchived=true", { token })
check(
  "includeArchived returns archived account",
  withArchived.status === 200 && withArchived.json?.accounts?.some((a) => a.id === accBId),
)
await req(`/api/finance/accounts/${accBId}`, { method: "PATCH", token, body: { isArchived: false } })

// 5. Transaction listing + filters
const allTxns = await req("/api/finance/transactions", { token })
check("list transactions", allTxns.status === 200 && allTxns.json?.transactions?.length === 2, `${allTxns.json?.transactions?.length} txn(s)`)

const byCategory = await req("/api/finance/transactions?category=groceries", { token })
check(
  "category filter works",
  byCategory.status === 200 && byCategory.json?.transactions?.length === 1 && byCategory.json.transactions[0].id === txnGroceriesId,
)

const byType = await req("/api/finance/transactions?type=credit", { token })
check(
  "type filter works",
  byType.status === 200 && byType.json?.transactions?.length === 1 && byType.json.transactions[0].id === txnSalaryId,
)

const byQuery = await req("/api/finance/transactions?q=lidl", { token })
check(
  "text search filter works",
  byQuery.status === 200 && byQuery.json?.transactions?.length === 1 && byQuery.json.transactions[0].id === txnGroceriesId,
)

const byAccount = await req(`/api/finance/transactions?accountId=${accAId}`, { token })
check("accountId filter works", byAccount.status === 200 && byAccount.json?.transactions?.length === 2)

const detail = await req(`/api/finance/transactions/${txnGroceriesId}`, { token })
check(
  "transaction detail",
  detail.status === 200 && detail.json?.transaction?.merchant === "Lidl Budapest",
  `status ${detail.status}`,
)

// 6. Patch transaction — rebalances the account
const patchedTxn = await req(`/api/finance/transactions/${txnGroceriesId}`, {
  method: "PATCH",
  token,
  body: { amount: 10000, notes: "corrected receipt" },
})
check("patch transaction amount", patchedTxn.status === 200 && patchedTxn.json?.transaction?.amount === 10000)

accounts = await req("/api/finance/accounts", { token })
balA = accounts.json?.accounts?.find((a) => a.id === accAId)?.balance
check("patch rebalances account", balA === 100000 - 10000 + 500000, `balance ${balA}`)

// 7. Cards — mock issue, freeze/unfreeze
const card = await req("/api/finance/cards", {
  method: "POST",
  token,
  body: { financeAccountId: accAId, label: "Daily card" },
})
check(
  "create virtual card with mock last4",
  card.status === 201 && /^\d{4}$/.test(card.json?.card?.last4 ?? "") && card.json.card.isFrozen === false,
  `status ${card.status}, last4 ${card.json?.card?.last4}`,
)
const cardId = card.json?.card?.id

const frozen = await req(`/api/finance/cards/${cardId}`, { method: "PATCH", token, body: { isFrozen: true } })
check("freeze card", frozen.status === 200 && frozen.json?.card?.isFrozen === true)

const cards = await req("/api/finance/cards", { token })
check("list cards", cards.status === 200 && cards.json?.cards?.length === 1)

// 8. Budgets — spent tracked in base currency, duplicate rejected
const budget = await req("/api/finance/budgets", {
  method: "POST",
  token,
  body: { category: "groceries", monthlyLimit: 50000 },
})
check(
  "create budget with current-month spend",
  budget.status === 201 && budget.json?.budget?.spent === 10000 && budget.json.budget.currency === "HUF",
  `status ${budget.status}, spent ${budget.json?.budget?.spent}`,
)
const budgetId = budget.json?.budget?.id

const dupBudget = await req("/api/finance/budgets", {
  method: "POST",
  token,
  body: { category: "groceries", monthlyLimit: 1000 },
})
check("duplicate category budget rejected", dupBudget.status === 409, `status ${dupBudget.status}`)

const patchedBudget = await req(`/api/finance/budgets/${budgetId}`, {
  method: "PATCH",
  token,
  body: { monthlyLimit: 60000 },
})
check("patch budget limit", patchedBudget.status === 200 && patchedBudget.json?.budget?.monthlyLimit === 60000)

// 9. Analytics summary — FX conversion + month aggregates
const summary = await req("/api/finance/analytics/summary", { token })
const s = summary.json?.summary
// 590,000 HUF + 100 EUR * 395.5 = 629,550 HUF
check(
  "summary total balance converts EUR to HUF",
  summary.status === 200 && s?.totalBalance === 590000 + 100 * 395.5,
  `total ${s?.totalBalance}`,
)
check("summary month income", s?.monthIncome === 500000, `income ${s?.monthIncome}`)
check("summary month spending", s?.monthSpending === 10000, `spending ${s?.monthSpending}`)
check(
  "summary spending by category",
  s?.spendingByCategory?.some((c) => c.category === "groceries" && c.total === 10000),
)
check("summary trend has 6 months", s?.monthlyTrend?.length === 6 && s.monthlyTrend[5].month === s.month)

const badMonth = await req("/api/finance/analytics/summary?month=2026-13", { token })
check("summary rejects invalid month", badMonth.status === 400, `status ${badMonth.status}`)

// 10. FX rates endpoint
const rates = await req("/api/finance/rates", { token })
check(
  "fx rates endpoint",
  rates.status === 200 && rates.json?.base === "HUF" && rates.json?.rates?.EUR === 395.5,
  `status ${rates.status}`,
)

// 11. Recurring detection — 3 Netflix charges ~30 days apart
for (const daysAgo of [60, 30, 0]) {
  await req("/api/finance/transactions", {
    method: "POST",
    token,
    body: { accountId: accAId, amount: 4990, type: "debit", date: iso(-daysAgo), merchant: "Netflix" },
  })
}
const recurring = await req("/api/finance/recurring", { token })
const series = recurring.json?.series?.find((x) => x.merchant === "Netflix")
check(
  "recurring series detected",
  recurring.status === 200 && series?.occurrences === 3 && series?.category === "subscriptions",
  `status ${recurring.status}, ${recurring.json?.series?.length} series`,
)
check(
  "recurring cadence ~30 days",
  series != null && series.intervalDays >= 28 && series.intervalDays <= 32,
  `interval ${series?.intervalDays}`,
)
check("recurring average amount", series?.averageAmount === 4990, `avg ${series?.averageAmount}`)

const flagged = await req("/api/finance/transactions?q=netflix", { token })
check(
  "matched transactions flagged is_recurring",
  flagged.status === 200 && flagged.json?.transactions?.length === 3 && flagged.json.transactions.every((t) => t.isRecurring),
)

// 12. Superapp integration — reminder task lands in the Tasks module
const reminder = await req("/api/finance/recurring/reminder", {
  method: "POST",
  token,
  body: {
    merchant: series?.merchant ?? "Netflix",
    amount: series?.averageAmount ?? 4990,
    currency: "HUF",
    dueDate: series?.nextExpectedDate ?? iso(30),
  },
})
check(
  "create recurring reminder task",
  reminder.status === 201 && reminder.json?.task?.title?.includes("Netflix"),
  `status ${reminder.status}, title ${reminder.json?.task?.title}`,
)

const tasks = await req("/api/tasks", { token })
check(
  "reminder visible in Tasks module",
  tasks.status === 200 && tasks.json?.tasks?.some((t) => t.id === reminder.json?.task?.id),
  `status ${tasks.status}`,
)

// 13. Cross-user isolation
const reg2 = await req("/api/auth/register", {
  method: "POST",
  body: { email: `finance-smoke-b-${Date.now()}@test.dev`, password: "Sm0ke-test-pass!", name: "Finance Smoke B" },
})
const token2 = reg2.json?.tokens?.accessToken
const foreignAcc = await req(`/api/finance/accounts/${accAId}`, { method: "PATCH", token: token2, body: { name: "hax" } })
check("cross-user account access rejected", foreignAcc.status === 404, `status ${foreignAcc.status}`)
const foreignTxn = await req(`/api/finance/transactions/${txnGroceriesId}`, { token: token2 })
check("cross-user transaction access rejected", foreignTxn.status === 404, `status ${foreignTxn.status}`)
const foreignCard = await req(`/api/finance/cards/${cardId}`, { method: "PATCH", token: token2, body: { isFrozen: false } })
check("cross-user card access rejected", foreignCard.status === 404, `status ${foreignCard.status}`)

// 14. Delete transaction — reverts the balance effect
const delTxn = await req(`/api/finance/transactions/${txnSalaryId}`, { method: "DELETE", token })
check("delete transaction", delTxn.status === 204, `status ${delTxn.status}`)
accounts = await req("/api/finance/accounts", { token })
balA = accounts.json?.accounts?.find((a) => a.id === accAId)?.balance
// 100,000 - 10,000 (groceries) - 3 × 4,990 (netflix) = 75,030
check("delete reverts balance", balA === 100000 - 10000 - 3 * 4990, `balance ${balA}`)

// 15. Cleanup deletes — budget, card, account (cascades txns + cards)
const delBudget = await req(`/api/finance/budgets/${budgetId}`, { method: "DELETE", token })
check("delete budget", delBudget.status === 204, `status ${delBudget.status}`)

const delAcc = await req(`/api/finance/accounts/${accAId}`, { method: "DELETE", token })
check("delete account", delAcc.status === 204, `status ${delAcc.status}`)

const orphanTxns = await req(`/api/finance/transactions?accountId=${accAId}`, { token })
check("deleted account 404s on transaction filter", orphanTxns.status === 404, `status ${orphanTxns.status}`)
const goneCards = await req("/api/finance/cards", { token })
check("account deletion cascades cards", goneCards.status === 200 && goneCards.json?.cards?.length === 0)
const remaining = await req("/api/finance/transactions", { token })
check("account deletion cascades transactions", remaining.status === 200 && remaining.json?.transactions?.length === 0)

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
console.log(`SMOKE_TEST_EMAILS:${email},${reg2.json?.user?.email ?? ""}`)
process.exit(failures === 0 ? 0 : 1)

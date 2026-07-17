// Smoke test for the superapp glue layer API: /api/search, /api/links,
// /api/today (run against a locally started server).
//
// Mail threads cannot be created via the API without a live IMAP account, so
// this script seeds a mail account + thread directly in the database. It
// therefore requires DATABASE_URL (same one the server uses).
//
// Usage: node --env-file=.env scripts/glue-smoke.mjs [baseUrl]
import { randomUUID } from "node:crypto"
import { neon } from "@neondatabase/serverless"

const BASE = process.argv[2] ?? "http://localhost:3999"

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (used to seed a mail thread). Run with --env-file=.env")
  process.exit(1)
}
const sqlDb = neon(process.env.DATABASE_URL)

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
const now = new Date()
const todayUtc = now.toISOString().slice(0, 10)
const atUtc = (offsetDays, hour) => {
  const d = new Date(now.getTime() + offsetDays * DAY_MS)
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0),
  ).toISOString()
}

// ---------------------------------------------------------------------------
// 1. Register a fresh user + auth guards
// ---------------------------------------------------------------------------

const email = `glue-smoke-${Date.now()}@test.dev`
const reg = await req("/api/auth/register", {
  method: "POST",
  body: { email, password: "Sm0ke-test-pass!", name: "Glue Smoke" },
})
check("register user", reg.status === 201 || reg.status === 200, `status ${reg.status}`)
const token = reg.json?.tokens?.accessToken
check("access token issued", typeof token === "string" && token.length > 20)
const userId = reg.json?.user?.id

const unauthSearch = await req("/api/search?q=x")
check("search requires auth", unauthSearch.status === 401, `status ${unauthSearch.status}`)
const unauthLinks = await req("/api/links?type=task&id=x")
check("links require auth", unauthLinks.status === 401, `status ${unauthLinks.status}`)
const unauthToday = await req("/api/today")
check("today requires auth", unauthToday.status === 401, `status ${unauthToday.status}`)

// ---------------------------------------------------------------------------
// 2. Seed cross-module data via each module's API
// ---------------------------------------------------------------------------

// Calendar: one-off event today + daily recurring event anchored yesterday.
const cal = await req("/api/calendar/calendars", {
  method: "POST",
  token,
  body: { name: "Glue Cal", color: "#0a7d4f" },
})
const calId = cal.json?.calendar?.id
check("create calendar", cal.status === 201 && !!calId, `status ${cal.status}`)

const event = await req("/api/calendar/events", {
  method: "POST",
  token,
  body: {
    calendarId: calId,
    title: "Glue Sync Meeting",
    location: "Room 42",
    startTime: atUtc(0, 10),
    endTime: atUtc(0, 11),
  },
})
const eventId = event.json?.event?.id
check("create one-off event today", event.status === 201 && !!eventId, `status ${event.status}`)

const recurring = await req("/api/calendar/events", {
  method: "POST",
  token,
  body: {
    calendarId: calId,
    title: "Glue Standup",
    startTime: atUtc(-1, 9),
    endTime: new Date(new Date(atUtc(-1, 9)).getTime() + 15 * 60 * 1000).toISOString(),
    rrule: "FREQ=DAILY",
  },
})
check("create daily recurring event", recurring.status === 201, `status ${recurring.status}`)

// Tasks: due today + overdue.
const task = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Review glue quarterly report", dueDate: atUtc(0, 17) },
})
const taskId = task.json?.task?.id
check("create task due today", task.status === 201 && !!taskId, `status ${task.status}`)

const overdue = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Glue overdue invoice", dueDate: atUtc(-2, 12) },
})
const overdueId = overdue.json?.task?.id
check("create overdue task", overdue.status === 201 && !!overdueId, `status ${overdue.status}`)

// Notes.
const note = await req("/api/notes", {
  method: "POST",
  token,
  body: {
    title: "Glue architecture notes",
    content: {
      type: "doc",
      content: [{ id: "b1", type: "paragraph", text: "Cross-module glue linking design." }],
    },
  },
})
const noteId = note.json?.note?.id
check("create note", note.status === 201 && !!noteId, `status ${note.status}`)

// Finance: account + this-month debit + groceries budget.
const finAcc = await req("/api/finance/accounts", {
  method: "POST",
  token,
  body: { name: "Glue Checking", type: "checking", currency: "HUF", initialBalance: 100000 },
})
const finAccId = finAcc.json?.account?.id
check("create finance account", finAcc.status === 201 && !!finAccId, `status ${finAcc.status}`)

const txn = await req("/api/finance/transactions", {
  method: "POST",
  token,
  body: {
    accountId: finAccId,
    amount: 12000,
    type: "debit",
    date: now.toISOString(),
    merchant: "Glue Grocery Mart",
    category: "groceries",
  },
})
const txnId = txn.json?.transaction?.id
check("create debit transaction", txn.status === 201 && !!txnId, `status ${txn.status}`)

const budget = await req("/api/finance/budgets", {
  method: "POST",
  token,
  body: { category: "groceries", monthlyLimit: 50000 },
})
check("create groceries budget", budget.status === 201, `status ${budget.status}`)

// Mail: seed account + unread inbox thread directly in the DB (no IMAP here).
const mailAccountId = randomUUID()
const threadId = randomUUID()
await sqlDb`
  INSERT INTO accounts (id, user_id, type, provider, config_encrypted, email_addr)
  VALUES (${mailAccountId}, ${userId}, 'mail', 'imap', 'smoke-test-placeholder', ${email})
`
await sqlDb`
  INSERT INTO mail_threads (id, account_id, subject, snippet, last_message_at, is_unread, folder)
  VALUES (${threadId}, ${mailAccountId}, 'Glue project kickoff', 'Kickoff agenda for the glue project.', NOW(), true, 'inbox')
`
check("seed mail account + unread thread (via DB)", true)

// ---------------------------------------------------------------------------
// 3. Universal search
// ---------------------------------------------------------------------------

const noQ = await req("/api/search", { token })
check("search rejects missing q", noQ.status === 400, `status ${noQ.status}`)

const s = await req("/api/search?q=Glue", { token })
check("search returns 200", s.status === 200, `status ${s.status}`)
check(
  "search finds mail thread",
  s.json?.mail?.some((r) => r.id === threadId && r.entityType === "thread"),
  `${s.json?.mail?.length ?? 0} mail hit(s)`,
)
check(
  "search finds tasks",
  s.json?.tasks?.some((r) => r.id === taskId) && s.json?.tasks?.some((r) => r.id === overdueId),
  `${s.json?.tasks?.length ?? 0} task hit(s)`,
)
check(
  "search finds event",
  s.json?.events?.some((r) => r.id === eventId),
  `${s.json?.events?.length ?? 0} event hit(s)`,
)
check(
  "search finds note",
  s.json?.notes?.some((r) => r.id === noteId),
  `${s.json?.notes?.length ?? 0} note hit(s)`,
)
check(
  "search finds transaction",
  s.json?.transactions?.some((r) => r.id === txnId),
  `${s.json?.transactions?.length ?? 0} transaction hit(s)`,
)

const sLower = await req("/api/search?q=glue%20grocery", { token })
check(
  "search is case-insensitive",
  sLower.status === 200 && sLower.json?.transactions?.some((r) => r.id === txnId),
  `status ${sLower.status}`,
)

const sTyped = await req("/api/search?q=Glue&types=tasks", { token })
check(
  "types filter limits result buckets",
  sTyped.status === 200 &&
    sTyped.json?.tasks?.length > 0 &&
    sTyped.json?.mail?.length === 0 &&
    sTyped.json?.events?.length === 0 &&
    sTyped.json?.notes?.length === 0 &&
    sTyped.json?.transactions?.length === 0,
  `status ${sTyped.status}`,
)

// Notes content-text search (not just titles).
const sBody = await req("/api/search?q=linking%20design&types=notes", { token })
check(
  "search matches note body text",
  sBody.status === 200 && sBody.json?.notes?.some((r) => r.id === noteId),
  `status ${sBody.status}`,
)

// ---------------------------------------------------------------------------
// 4. Links
// ---------------------------------------------------------------------------

const badLink = await req("/api/links", {
  method: "POST",
  token,
  body: { sourceType: "task", sourceId: "not-a-uuid", targetType: "note", targetId: noteId },
})
check("zod validation rejects bad link body", badLink.status === 400, `status ${badLink.status}`)

const selfLink = await req("/api/links", {
  method: "POST",
  token,
  body: { sourceType: "task", sourceId: taskId, targetType: "task", targetId: taskId },
})
check("self-link rejected", selfLink.status === 400, `status ${selfLink.status}`)

const ghostLink = await req("/api/links", {
  method: "POST",
  token,
  body: { sourceType: "task", sourceId: taskId, targetType: "note", targetId: randomUUID() },
})
check("link to nonexistent entity is 404", ghostLink.status === 404, `status ${ghostLink.status}`)

const link = await req("/api/links", {
  method: "POST",
  token,
  body: { sourceType: "task", sourceId: taskId, targetType: "note", targetId: noteId },
})
const linkId = link.json?.link?.id
check(
  "create task→note link",
  link.status === 201 && !!linkId && link.json?.link?.other?.title === "Glue architecture notes",
  `status ${link.status}`,
)

const dupe = await req("/api/links", {
  method: "POST",
  token,
  body: { sourceType: "task", sourceId: taskId, targetType: "note", targetId: noteId },
})
check(
  "duplicate link is idempotent (200, same id)",
  dupe.status === 200 && dupe.json?.link?.id === linkId,
  `status ${dupe.status}`,
)

const fromTask = await req(`/api/links?type=task&id=${taskId}`, { token })
check(
  "list links from source side (other = note)",
  fromTask.status === 200 &&
    fromTask.json?.links?.some((l) => l.id === linkId && l.other?.type === "note" && l.other?.id === noteId),
  `status ${fromTask.status}`,
)

const fromNote = await req(`/api/links?type=note&id=${noteId}`, { token })
check(
  "list links from target side (other = task)",
  fromNote.status === 200 &&
    fromNote.json?.links?.some((l) => l.id === linkId && l.other?.type === "task" && l.other?.id === taskId),
  `status ${fromNote.status}`,
)

const badList = await req("/api/links?type=banana&id=x", { token })
check("list links rejects bad type", badList.status === 400, `status ${badList.status}`)

// Email → task conversion.
const e2tGhost = await req("/api/links/email-to-task", {
  method: "POST",
  token,
  body: { threadId: randomUUID() },
})
check("email-to-task 404 on unknown thread", e2tGhost.status === 404, `status ${e2tGhost.status}`)

const e2t = await req("/api/links/email-to-task", {
  method: "POST",
  token,
  body: { threadId },
})
const e2tTaskId = e2t.json?.task?.id
check(
  "email-to-task creates task titled from subject",
  e2t.status === 201 && e2t.json?.task?.title === "Glue project kickoff",
  `status ${e2t.status}, title ${e2t.json?.task?.title}`,
)
check(
  "email-to-task returns thread→task link",
  e2t.json?.link?.sourceType === "thread" &&
    e2t.json?.link?.sourceId === threadId &&
    e2t.json?.link?.targetId === e2tTaskId,
)

const threadLinks = await req(`/api/links?type=thread&id=${threadId}`, { token })
check(
  "thread links list shows converted task",
  threadLinks.status === 200 && threadLinks.json?.links?.some((l) => l.other?.id === e2tTaskId),
  `status ${threadLinks.status}`,
)

// ---------------------------------------------------------------------------
// 5. Today dashboard
// ---------------------------------------------------------------------------

const badTz = await req("/api/today?tz=Not/AZone", { token })
check("today rejects invalid tz", badTz.status === 400, `status ${badTz.status}`)
const badDate = await req("/api/today?date=17-07-2026", { token })
check("today rejects invalid date", badDate.status === 400, `status ${badDate.status}`)

const today = await req(`/api/today?tz=UTC&date=${todayUtc}`, { token })
check("today returns 200 with date echo", today.status === 200 && today.json?.date === todayUtc, `status ${today.status}`)
check(
  "today includes one-off event",
  today.json?.events?.some((e) => e.id === eventId && e.calendarColor === "#0a7d4f"),
  `${today.json?.events?.length ?? 0} event(s)`,
)
check(
  "today expands recurring event occurrence",
  today.json?.events?.some((e) => e.title === "Glue Standup" && e.startTime.startsWith(todayUtc)),
)
check(
  "today lists due task (not overdue)",
  today.json?.tasks?.some((t) => t.id === taskId && t.isOverdue === false),
  `${today.json?.tasks?.length ?? 0} task(s)`,
)
check(
  "today flags overdue task",
  today.json?.tasks?.some((t) => t.id === overdueId && t.isOverdue === true),
)
check("today unread count ≥ 1", (today.json?.unreadCount ?? 0) >= 1, `unreadCount ${today.json?.unreadCount}`)
check(
  "today lists unread thread",
  today.json?.unreadThreads?.some((t) => t.id === threadId && t.subject === "Glue project kickoff"),
)
check(
  "today budget shows spent amount",
  today.json?.budgets?.some((b) => b.category === "groceries" && b.spent === 12000 && b.monthlyLimit === 50000),
  JSON.stringify(today.json?.budgets ?? []),
)
check("today month spend ≥ 12000 HUF", (today.json?.monthSpend ?? 0) >= 12000, `monthSpend ${today.json?.monthSpend}`)

// ---------------------------------------------------------------------------
// 6. Cross-user isolation
// ---------------------------------------------------------------------------

const reg2 = await req("/api/auth/register", {
  method: "POST",
  body: { email: `glue-smoke-b-${Date.now()}@test.dev`, password: "Sm0ke-test-pass!", name: "Glue Smoke B" },
})
const token2 = reg2.json?.tokens?.accessToken

const foreignSearch = await req("/api/search?q=Glue", { token: token2 })
check(
  "cross-user search sees nothing",
  foreignSearch.status === 200 &&
    ["mail", "tasks", "events", "notes", "transactions"].every(
      (k) => foreignSearch.json?.[k]?.length === 0,
    ),
  `status ${foreignSearch.status}`,
)

const foreignLink = await req("/api/links", {
  method: "POST",
  token: token2,
  body: { sourceType: "task", sourceId: taskId, targetType: "note", targetId: noteId },
})
check("cross-user link creation rejected (404)", foreignLink.status === 404, `status ${foreignLink.status}`)

const foreignList = await req(`/api/links?type=task&id=${taskId}`, { token: token2 })
check(
  "cross-user link listing is empty",
  foreignList.status === 200 && foreignList.json?.links?.length === 0,
  `status ${foreignList.status}`,
)

const foreignE2t = await req("/api/links/email-to-task", {
  method: "POST",
  token: token2,
  body: { threadId },
})
check("cross-user email-to-task rejected (404)", foreignE2t.status === 404, `status ${foreignE2t.status}`)

// ---------------------------------------------------------------------------
// 7. Delete link + dangling-entity behavior
// ---------------------------------------------------------------------------

const delLink = await req(`/api/links/${linkId}`, { method: "DELETE", token })
check("delete link", delLink.status === 204, `status ${delLink.status}`)
const delAgain = await req(`/api/links/${linkId}`, { method: "DELETE", token })
check("delete link twice is 404", delAgain.status === 404, `status ${delAgain.status}`)

// Deleting the converted task hides the thread→task link (dangling far side).
const delTask = await req(`/api/tasks/${e2tTaskId}`, { method: "DELETE", token })
check("delete converted task", delTask.status === 204, `status ${delTask.status}`)
const threadLinksAfter = await req(`/api/links?type=thread&id=${threadId}`, { token })
check(
  "links to deleted entities are hidden",
  threadLinksAfter.status === 200 &&
    !threadLinksAfter.json?.links?.some((l) => l.other?.id === e2tTaskId),
  `status ${threadLinksAfter.status}`,
)

// ---------------------------------------------------------------------------
// Cleanup: remove both smoke users (cascades to all seeded rows).
// ---------------------------------------------------------------------------

await sqlDb`DELETE FROM users WHERE email LIKE 'glue-smoke-%@test.dev'`
console.log("Cleanup: removed smoke-test users (cascade).")

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)

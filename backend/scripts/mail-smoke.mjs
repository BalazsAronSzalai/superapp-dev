// Smoke test for the mail module API (run against a locally started server).
// Usage: node scripts/mail-smoke.mjs [baseUrl]
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

// 1. Register a fresh user
const email = `mail-smoke-${Date.now()}@test.dev`
const reg = await req("/api/auth/register", {
  method: "POST",
  body: { email, password: "Sm0ke-test-pass!", name: "Mail Smoke" },
})
check("register user", reg.status === 201 || reg.status === 200, `status ${reg.status}`)
const token = reg.json?.tokens?.accessToken
check("access token issued", typeof token === "string" && token.length > 20)

// 2. Auth guard: mail endpoints reject unauthenticated requests
const unauth = await req("/api/mail/accounts")
check("mail endpoints require auth", unauth.status === 401, `status ${unauth.status}`)

// 3. List accounts (empty)
const accounts = await req("/api/mail/accounts", { token })
check(
  "list mail accounts (empty)",
  accounts.status === 200 && Array.isArray(accounts.json?.accounts) && accounts.json.accounts.length === 0,
  `status ${accounts.status}`,
)

// 4. Create account with bogus creds -> IMAP verification must fail (4xx/5xx, not 201)
const badAccount = await req("/api/mail/accounts", {
  method: "POST",
  token,
  body: {
    email: "nobody@invalid-host.test",
    imapHost: "imap.invalid-host.test",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.invalid-host.test",
    smtpPort: 465,
    smtpSecure: true,
    username: "nobody@invalid-host.test",
    password: "wrong-password",
  },
})
check(
  "bogus IMAP creds rejected",
  badAccount.status >= 400,
  `status ${badAccount.status}: ${JSON.stringify(badAccount.json)?.slice(0, 120)}`,
)

// 5. Validation: bad request body -> 400
const invalidBody = await req("/api/mail/accounts", {
  method: "POST",
  token,
  body: { email: "not-an-email" },
})
check("zod validation rejects bad body", invalidBody.status === 400, `status ${invalidBody.status}`)

// 6. Threads list (empty inbox)
const threads = await req("/api/mail/threads?folder=inbox", { token })
check(
  "list threads (empty inbox)",
  threads.status === 200 && Array.isArray(threads.json?.threads) && threads.json.threads.length === 0,
  `status ${threads.status}`,
)

// 7. Unread count
const unread = await req("/api/mail/threads/unread-count", { token })
check("unread count", unread.status === 200 && unread.json?.count === 0, `status ${unread.status}, ${JSON.stringify(unread.json)}`)

// 8. Search
const search = await req("/api/mail/search?q=hello", { token })
check(
  "search returns empty list",
  search.status === 200 && Array.isArray(search.json?.threads),
  `status ${search.status}`,
)

// 9. Send with unknown account -> 404/400
const badSend = await req("/api/mail/send", {
  method: "POST",
  token,
  body: {
    accountId: "00000000-0000-0000-0000-000000000000",
    to: ["someone@example.com"],
    subject: "hi",
    bodyText: "hello",
  },
})
check("send with unknown account rejected", badSend.status >= 400, `status ${badSend.status}`)

// 10. Process-scheduled endpoint responds
const processScheduled = await req("/api/mail/process-scheduled", { method: "POST", token })
check(
  "process-scheduled responds",
  processScheduled.status === 200,
  `status ${processScheduled.status}, ${JSON.stringify(processScheduled.json)}`,
)

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)

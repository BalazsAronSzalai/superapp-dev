// Smoke test for the calendar module API (run against a locally started server).
// Usage: node scripts/calendar-smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3999"

let failures = 0
function check(name, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL"
  if (!ok) failures++
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ""}`)
}

async function req(path, { method = "GET", token, body, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (raw) {
    const text = await res.text()
    return { status: res.status, text, headers: res.headers }
  }
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

// 1. Register a fresh user
const email = `cal-smoke-${Date.now()}@test.dev`
const reg = await req("/api/auth/register", {
  method: "POST",
  body: { email, password: "Sm0ke-test-pass!", name: "Cal Smoke" },
})
check("register user", reg.status === 201 || reg.status === 200, `status ${reg.status}`)
const token = reg.json?.tokens?.accessToken
check("access token issued", typeof token === "string" && token.length > 20)

// 2. Auth guard
const unauth = await req("/api/calendar/calendars")
check("calendar endpoints require auth", unauth.status === 401, `status ${unauth.status}`)

// 3. Calendars — empty, create, patch
const empty = await req("/api/calendar/calendars", { token })
check(
  "list calendars (empty)",
  empty.status === 200 && Array.isArray(empty.json?.calendars) && empty.json.calendars.length === 0,
  `status ${empty.status}`,
)

const created = await req("/api/calendar/calendars", {
  method: "POST",
  token,
  body: { name: "Personal", color: "#0A84FF" },
})
check("create calendar", created.status === 201 && created.json?.calendar?.name === "Personal", `status ${created.status}`)
const calId = created.json?.calendar?.id

const patchedCal = await req(`/api/calendar/calendars/${calId}`, {
  method: "PATCH",
  token,
  body: { name: "Personal Life" },
})
check("patch calendar", patchedCal.status === 200 && patchedCal.json?.calendar?.name === "Personal Life", `status ${patchedCal.status}`)

// 4. Validation — bad body -> 400
const invalidBody = await req("/api/calendar/events", { method: "POST", token, body: { title: "" } })
check("zod validation rejects bad body", invalidBody.status === 400, `status ${invalidBody.status}`)

const badRange = await req("/api/calendar/events", { token })
check("events range requires start/end", badRange.status === 400, `status ${badRange.status}`)

// 5. Events — create one-off + all-day + recurring
const now = new Date()
const dayMs = 86_400_000
const tomorrow9 = new Date(now.getTime() + dayMs)
tomorrow9.setUTCHours(9, 0, 0, 0)
const tomorrow10 = new Date(tomorrow9.getTime() + 3_600_000)

const oneOff = await req("/api/calendar/events", {
  method: "POST",
  token,
  body: {
    calendarId: calId,
    title: "Dentist",
    startTime: tomorrow9.toISOString(),
    endTime: tomorrow10.toISOString(),
    location: "Main St 12",
    reminderMinutes: 30,
    timezone: "Europe/Budapest",
  },
})
check("create one-off event", oneOff.status === 201 && oneOff.json?.event?.title === "Dentist", `status ${oneOff.status}`)
const oneOffId = oneOff.json?.event?.id

const allDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3))
const allDay = await req("/api/calendar/events", {
  method: "POST",
  token,
  body: {
    calendarId: calId,
    title: "Conference",
    startTime: allDayStart.toISOString(),
    endTime: new Date(allDayStart.getTime() + dayMs).toISOString(),
    allDay: true,
  },
})
check("create all-day event", allDay.status === 201 && allDay.json?.event?.allDay === true, `status ${allDay.status}`)

const weeklyAnchor = new Date(now.getTime() - 7 * dayMs)
weeklyAnchor.setUTCHours(18, 0, 0, 0)
const recurring = await req("/api/calendar/events", {
  method: "POST",
  token,
  body: {
    calendarId: calId,
    title: "Gym",
    startTime: weeklyAnchor.toISOString(),
    endTime: new Date(weeklyAnchor.getTime() + 3_600_000).toISOString(),
    rrule: "FREQ=WEEKLY",
  },
})
check("create recurring event", recurring.status === 201 && recurring.json?.event?.rrule === "FREQ=WEEKLY", `status ${recurring.status}`)
const recurringId = recurring.json?.event?.id

const endBeforeStart = await req("/api/calendar/events", {
  method: "POST",
  token,
  body: {
    calendarId: calId,
    title: "Backwards",
    startTime: tomorrow10.toISOString(),
    endTime: tomorrow9.toISOString(),
  },
})
check("end-before-start rejected", endBeforeStart.status === 400, `status ${endBeforeStart.status}`)

// 6. Range query expands recurrence
const rangeStart = new Date(now.getTime() - dayMs)
const rangeEnd = new Date(now.getTime() + 14 * dayMs)
const range = await req(
  `/api/calendar/events?start=${encodeURIComponent(rangeStart.toISOString())}&end=${encodeURIComponent(rangeEnd.toISOString())}`,
  { token },
)
const gymOccurrences = range.json?.events?.filter((e) => e.id === recurringId) ?? []
check(
  "range query returns events",
  range.status === 200 && range.json?.events?.some((e) => e.id === oneOffId),
  `status ${range.status}, ${range.json?.events?.length} event(s)`,
)
check(
  "recurring event expands to 2 occurrences in 15-day window",
  gymOccurrences.length === 2,
  `${gymOccurrences.length} occurrence(s)`,
)
check(
  "expanded occurrence flagged isRecurringInstance",
  gymOccurrences.some((e) => e.isRecurringInstance === true),
)

// 7. Task overlay (superapp integration)
const taskDue = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Pay rent", dueDate: new Date(now.getTime() + 2 * dayMs).toISOString() },
})
check("create dated task", taskDue.status === 201, `status ${taskDue.status}`)

const withTasks = await req(
  `/api/calendar/events?start=${encodeURIComponent(rangeStart.toISOString())}&end=${encodeURIComponent(rangeEnd.toISOString())}&includeTasks=true`,
  { token },
)
check(
  "includeTasks overlays dated tasks",
  withTasks.status === 200 && withTasks.json?.tasks?.some((t) => t.title === "Pay rent" && t.isDue === true),
  `status ${withTasks.status}, ${withTasks.json?.tasks?.length ?? 0} task(s)`,
)

// 8. Event detail + patch + calendarId filter
const detail = await req(`/api/calendar/events/${oneOffId}`, { token })
check("event detail", detail.status === 200 && detail.json?.event?.location === "Main St 12", `status ${detail.status}`)

const patchedEvent = await req(`/api/calendar/events/${oneOffId}`, {
  method: "PATCH",
  token,
  body: { title: "Dentist (moved)", reminderMinutes: 60 },
})
check(
  "patch event",
  patchedEvent.status === 200 && patchedEvent.json?.event?.title === "Dentist (moved)" && patchedEvent.json.event.reminderMinutes === 60,
  `status ${patchedEvent.status}`,
)

const filtered = await req(
  `/api/calendar/events?start=${encodeURIComponent(rangeStart.toISOString())}&end=${encodeURIComponent(rangeEnd.toISOString())}&calendarId=${calId}`,
  { token },
)
check("calendarId filter works", filtered.status === 200 && filtered.json?.events?.length > 0, `status ${filtered.status}`)

// 9. Search
const search = await req(`/api/calendar/search?q=dentist`, { token })
check(
  "search finds event by title",
  search.status === 200 && search.json?.events?.some((e) => e.id === oneOffId),
  `status ${search.status}`,
)
const searchShort = await req(`/api/calendar/search?q=d`, { token })
check("search rejects short query", searchShort.status === 400, `status ${searchShort.status}`)

// 10. Export .ics
const exported = await req(`/api/calendar/calendars/${calId}/export.ics`, { token, raw: true })
check(
  "export .ics",
  exported.status === 200 &&
    exported.text.includes("BEGIN:VCALENDAR") &&
    exported.text.includes("SUMMARY:Dentist (moved)") &&
    exported.text.includes("RRULE:FREQ=WEEKLY"),
  `status ${exported.status}`,
)

// 11. Import .ics into a second calendar (with dedupe)
const cal2 = await req("/api/calendar/calendars", { method: "POST", token, body: { name: "Imported" } })
const cal2Id = cal2.json?.calendar?.id
const imp1 = await req("/api/calendar/import", {
  method: "POST",
  token,
  body: { calendarId: cal2Id, ics: exported.text },
})
check("import .ics", imp1.status === 200 && imp1.json?.imported === 3, `status ${imp1.status}, ${JSON.stringify(imp1.json)}`)
const imp2 = await req("/api/calendar/import", {
  method: "POST",
  token,
  body: { calendarId: cal2Id, ics: exported.text },
})
check("re-import dedupes by UID", imp2.status === 200 && imp2.json?.imported === 0 && imp2.json?.skipped === 3, `status ${imp2.status}, ${JSON.stringify(imp2.json)}`)

// 12. Calendar list includes event counts
const listAfter = await req("/api/calendar/calendars", { token })
const cal1Row = listAfter.json?.calendars?.find((c) => c.id === calId)
check("calendar list has event counts", listAfter.status === 200 && cal1Row?.eventCount === 3, `count ${cal1Row?.eventCount}`)

// 13. Cross-user isolation
const reg2 = await req("/api/auth/register", {
  method: "POST",
  body: { email: `cal-smoke-b-${Date.now()}@test.dev`, password: "Sm0ke-test-pass!", name: "Cal Smoke B" },
})
const token2 = reg2.json?.tokens?.accessToken
const foreignEvent = await req(`/api/calendar/events/${oneOffId}`, { token: token2 })
check("cross-user event access rejected", foreignEvent.status === 404, `status ${foreignEvent.status}`)
const foreignCal = await req(`/api/calendar/calendars/${calId}`, { method: "PATCH", token: token2, body: { name: "hax" } })
check("cross-user calendar access rejected", foreignCal.status === 404, `status ${foreignCal.status}`)

// 14. Delete event, then delete calendar cascades
const delEvent = await req(`/api/calendar/events/${oneOffId}`, { method: "DELETE", token })
check("delete event", delEvent.status === 204, `status ${delEvent.status}`)

const delCal = await req(`/api/calendar/calendars/${calId}`, { method: "DELETE", token })
check("delete calendar", delCal.status === 204, `status ${delCal.status}`)
const goneRecurring = await req(`/api/calendar/events/${recurringId}`, { token })
check("events cascade with calendar deletion", goneRecurring.status === 404, `status ${goneRecurring.status}`)

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
console.log(`SMOKE_TEST_EMAILS:${email},${reg2.json?.user?.email ?? ""}`)
process.exit(failures === 0 ? 0 : 1)

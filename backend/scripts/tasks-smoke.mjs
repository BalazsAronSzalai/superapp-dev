// Smoke test for the tasks module API (run against a locally started server).
// Usage: node scripts/tasks-smoke.mjs [baseUrl]
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
const email = `tasks-smoke-${Date.now()}@test.dev`
const reg = await req("/api/auth/register", {
  method: "POST",
  body: { email, password: "Sm0ke-test-pass!", name: "Tasks Smoke" },
})
check("register user", reg.status === 201 || reg.status === 200, `status ${reg.status}`)
const token = reg.json?.tokens?.accessToken
check("access token issued", typeof token === "string" && token.length > 20)

// 2. Auth guard
const unauth = await req("/api/tasks/lists")
check("tasks endpoints require auth", unauth.status === 401, `status ${unauth.status}`)

// 3. Lists — empty, create, patch
const empty = await req("/api/tasks/lists", { token })
check(
  "list task lists (empty)",
  empty.status === 200 && Array.isArray(empty.json?.lists) && empty.json.lists.length === 0,
  `status ${empty.status}`,
)

const createdList = await req("/api/tasks/lists", {
  method: "POST",
  token,
  body: { name: "Errands", color: "#FF9500", sortOrder: 0 },
})
check("create list", createdList.status === 201 && createdList.json?.list?.name === "Errands", `status ${createdList.status}`)
const listId = createdList.json?.list?.id

const patchedList = await req(`/api/tasks/lists/${listId}`, {
  method: "PATCH",
  token,
  body: { name: "Errands & Chores" },
})
check("patch list", patchedList.status === 200 && patchedList.json?.list?.name === "Errands & Chores", `status ${patchedList.status}`)

// 4. Validation — bad body -> 400
const invalidBody = await req("/api/tasks", { method: "POST", token, body: { title: "" } })
check("zod validation rejects bad body", invalidBody.status === 400, `status ${invalidBody.status}`)

// 5. Create tasks across views
const now = new Date()
const todayIso = now.toISOString()
const nextWeekIso = new Date(now.getTime() + 7 * 86_400_000).toISOString()

const todayTask = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Buy milk", listId, scheduledDate: todayIso, priority: 2, tags: ["errand"] },
})
check("create today task", todayTask.status === 201 && todayTask.json?.task?.tags?.[0] === "errand", `status ${todayTask.status}`)
const todayTaskId = todayTask.json?.task?.id

const upcomingTask = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Dentist appointment", dueDate: nextWeekIso },
})
check("create upcoming task", upcomingTask.status === 201, `status ${upcomingTask.status}`)

const anytimeTask = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Clean garage" },
})
check("create anytime task", anytimeTask.status === 201, `status ${anytimeTask.status}`)

const somedayTask = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Learn piano", isSomeday: true },
})
check("create someday task", somedayTask.status === 201 && somedayTask.json?.task?.isSomeday === true, `status ${somedayTask.status}`)

// 6. Subtask
const subtask = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Get oat milk", parentTaskId: todayTaskId },
})
check("create subtask", subtask.status === 201, `status ${subtask.status}`)

const nested = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Too deep", parentTaskId: subtask.json?.task?.id },
})
check("nested subtasks rejected", nested.status === 400, `status ${nested.status}`)

// 7. Views
const vToday = await req("/api/tasks?view=today", { token })
check(
  "today view surfaces scheduled task",
  vToday.status === 200 && vToday.json?.tasks?.some((t) => t.id === todayTaskId),
  `status ${vToday.status}, ${vToday.json?.tasks?.length} task(s)`,
)
check(
  "today view includes subtask counts",
  vToday.json?.tasks?.find((t) => t.id === todayTaskId)?.subtaskCount === 1,
)

const vUpcoming = await req("/api/tasks?view=upcoming", { token })
check(
  "upcoming view has future-dated task only",
  vUpcoming.status === 200 &&
    vUpcoming.json?.tasks?.length === 1 &&
    vUpcoming.json.tasks[0].title === "Dentist appointment",
  `status ${vUpcoming.status}, ${vUpcoming.json?.tasks?.length} task(s)`,
)

const vAnytime = await req("/api/tasks?view=anytime", { token })
check(
  "anytime view has undated task only",
  vAnytime.status === 200 && vAnytime.json?.tasks?.length === 1 && vAnytime.json.tasks[0].title === "Clean garage",
  `status ${vAnytime.status}, ${vAnytime.json?.tasks?.length} task(s)`,
)

const vSomeday = await req("/api/tasks?view=someday", { token })
check(
  "someday view has parked task only",
  vSomeday.status === 200 && vSomeday.json?.tasks?.length === 1 && vSomeday.json.tasks[0].title === "Learn piano",
  `status ${vSomeday.status}, ${vSomeday.json?.tasks?.length} task(s)`,
)

const byList = await req(`/api/tasks?listId=${listId}`, { token })
check(
  "listId query returns list tasks",
  byList.status === 200 && byList.json?.tasks?.length === 1 && byList.json.tasks[0].id === todayTaskId,
  `status ${byList.status}`,
)

const badView = await req("/api/tasks?view=bogus", { token })
check("invalid view rejected", badView.status === 400, `status ${badView.status}`)

// 8. Counts
const counts = await req("/api/tasks/counts", { token })
check("today count = 1", counts.status === 200 && counts.json?.today === 1, `status ${counts.status}, ${JSON.stringify(counts.json)}`)

// 9. Task detail with subtasks
const detail = await req(`/api/tasks/${todayTaskId}`, { token })
check(
  "task detail includes subtasks",
  detail.status === 200 && detail.json?.subtasks?.length === 1 && detail.json.subtasks[0].title === "Get oat milk",
  `status ${detail.status}`,
)

// 10. Patch task
const patched = await req(`/api/tasks/${todayTaskId}`, {
  method: "PATCH",
  token,
  body: { priority: 3, tags: ["errand", "grocery"] },
})
check(
  "patch task",
  patched.status === 200 && patched.json?.task?.priority === 3 && patched.json.task.tags.length === 2,
  `status ${patched.status}`,
)

// 11. Recurring task: complete spawns next occurrence
const recurring = await req("/api/tasks", {
  method: "POST",
  token,
  body: { title: "Water plants", scheduledDate: todayIso, rrule: "FREQ=DAILY" },
})
check("create recurring task", recurring.status === 201, `status ${recurring.status}`)
const recurringId = recurring.json?.task?.id

const completedRecurring = await req(`/api/tasks/${recurringId}/complete`, { method: "POST", token })
check(
  "complete recurring task spawns next occurrence",
  completedRecurring.status === 200 &&
    completedRecurring.json?.task?.isCompleted === true &&
    completedRecurring.json?.nextTask?.id &&
    new Date(completedRecurring.json.nextTask.scheduledDate) > now,
  `status ${completedRecurring.status}, nextTask: ${completedRecurring.json?.nextTask?.scheduledDate ?? "none"}`,
)

// 12. Complete parent completes subtasks; logbook shows it
const completedParent = await req(`/api/tasks/${todayTaskId}/complete`, { method: "POST", token })
check(
  "complete parent task (non-recurring, no nextTask)",
  completedParent.status === 200 && completedParent.json?.nextTask === null,
  `status ${completedParent.status}`,
)
const detailAfter = await req(`/api/tasks/${todayTaskId}`, { token })
check(
  "subtask auto-completed with parent",
  detailAfter.json?.subtasks?.[0]?.isCompleted === true,
)

const vLogbook = await req("/api/tasks?view=logbook", { token })
check(
  "logbook shows completed tasks",
  vLogbook.status === 200 && vLogbook.json?.tasks?.some((t) => t.id === todayTaskId),
  `status ${vLogbook.status}, ${vLogbook.json?.tasks?.length} task(s)`,
)

// 13. Uncomplete
const uncompleted = await req(`/api/tasks/${todayTaskId}/uncomplete`, { method: "POST", token })
check("uncomplete task", uncompleted.status === 200 && uncompleted.json?.task?.isCompleted === false, `status ${uncompleted.status}`)

// 14. Delete list — tasks fall back to no list (ON DELETE SET NULL)
const delList = await req(`/api/tasks/lists/${listId}`, { method: "DELETE", token })
check("delete list", delList.status === 204, `status ${delList.status}`)
const orphaned = await req(`/api/tasks/${todayTaskId}`, { token })
check("task survives list deletion with null listId", orphaned.status === 200 && orphaned.json?.task?.listId === null, `status ${orphaned.status}`)

// 15. Delete task removes subtasks
const delTask = await req(`/api/tasks/${todayTaskId}`, { method: "DELETE", token })
check("delete task", delTask.status === 204, `status ${delTask.status}`)
const goneSub = await req(`/api/tasks/${detailAfter.json?.subtasks?.[0]?.id}`, { token })
check("subtask deleted with parent", goneSub.status === 404, `status ${goneSub.status}`)

// 16. Cross-user isolation: 404 for other users' tasks (fresh user sees nothing)
const reg2 = await req("/api/auth/register", {
  method: "POST",
  body: { email: `tasks-smoke-b-${Date.now()}@test.dev`, password: "Sm0ke-test-pass!", name: "Tasks Smoke B" },
})
const token2 = reg2.json?.tokens?.accessToken
const foreign = await req(`/api/tasks/${recurringId}`, { token: token2 })
check("cross-user task access rejected", foreign.status === 404, `status ${foreign.status}`)

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
console.log(`SMOKE_TEST_EMAILS:${email},${reg2.json?.user?.email ?? ""}`)
process.exit(failures === 0 ? 0 : 1)

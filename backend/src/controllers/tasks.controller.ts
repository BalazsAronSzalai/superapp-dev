import type { Request, Response } from "express"
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import { nextOccurrence } from "../services/recurrence.js"
import {
  TASK_VIEWS,
  type CreateTaskInput,
  type CreateTaskListInput,
  type PatchTaskInput,
  type PatchTaskListInput,
  type Task,
  type TaskList,
  type TaskView,
} from "../shared/task.schemas.js"

/** Express 5 types route params as string | string[]; normalize to string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOwnedList(userId: string, listId: string) {
  const [list] = await db
    .select()
    .from(schema.taskLists)
    .where(and(eq(schema.taskLists.id, listId), eq(schema.taskLists.userId, userId)))
    .limit(1)
  if (!list) throw new HttpError(404, "List not found")
  return list
}

async function getOwnedTask(userId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)))
    .limit(1)
  if (!task) throw new HttpError(404, "Task not found")
  return task
}

function toListDto(row: typeof schema.taskLists.$inferSelect, taskCount?: number): TaskList {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sortOrder,
    taskCount,
  }
}

function toTaskDto(
  row: typeof schema.tasks.$inferSelect,
  subtaskCounts?: { total: number; completed: number },
): Task {
  return {
    id: row.id,
    listId: row.listId,
    parentTaskId: row.parentTaskId,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate?.toISOString() ?? null,
    scheduledDate: row.scheduledDate?.toISOString() ?? null,
    priority: row.priority,
    rrule: row.rrule,
    isSomeday: row.isSomeday,
    tags: (row.tagsJson as string[]) ?? [],
    isCompleted: row.isCompleted,
    completedAt: row.completedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
    subtaskCount: subtaskCounts?.total,
    completedSubtaskCount: subtaskCounts?.completed,
  }
}

/** Subtask totals per parent task, for list-row progress display. */
async function subtaskCountsFor(
  taskIds: string[],
): Promise<Map<string, { total: number; completed: number }>> {
  if (taskIds.length === 0) return new Map()
  const rows = await db
    .select({
      parentTaskId: schema.tasks.parentTaskId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${schema.tasks.isCompleted})::int`,
    })
    .from(schema.tasks)
    .where(inArray(schema.tasks.parentTaskId, taskIds))
    .groupBy(schema.tasks.parentTaskId)
  return new Map(
    rows
      .filter((r) => r.parentTaskId != null)
      .map((r) => [r.parentTaskId!, { total: r.total, completed: r.completed }]),
  )
}

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function listTaskLists(req: Request, res: Response) {
  const lists = await db
    .select()
    .from(schema.taskLists)
    .where(eq(schema.taskLists.userId, req.userId!))
    .orderBy(asc(schema.taskLists.sortOrder), asc(schema.taskLists.name))

  // Open top-level task count per list.
  const counts = await db
    .select({
      listId: schema.tasks.listId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.userId, req.userId!),
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.parentTaskId),
      ),
    )
    .groupBy(schema.tasks.listId)
  const countMap = new Map(counts.filter((c) => c.listId != null).map((c) => [c.listId!, c.count]))

  res.json({ lists: lists.map((l) => toListDto(l, countMap.get(l.id) ?? 0)) })
}

export async function createTaskList(req: Request, res: Response) {
  const input = req.body as CreateTaskListInput
  const [list] = await db
    .insert(schema.taskLists)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      name: input.name,
      color: input.color ?? null,
      sortOrder: input.sortOrder,
    })
    .returning()
  if (!list) throw new HttpError(500, "Failed to create list")
  res.status(201).json({ list: toListDto(list, 0) })
}

export async function patchTaskList(req: Request, res: Response) {
  const input = req.body as PatchTaskListInput
  const list = await getOwnedList(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.taskLists.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) set.name = input.name
  if (input.color !== undefined) set.color = input.color
  if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder

  const [updated] = await db
    .update(schema.taskLists)
    .set(set)
    .where(eq(schema.taskLists.id, list.id))
    .returning()
  res.json({ list: toListDto(updated!) })
}

export async function deleteTaskList(req: Request, res: Response) {
  const list = await getOwnedList(req.userId!, param(req.params.id))
  // tasks.list_id has ON DELETE SET NULL — tasks fall back to the inbox/anytime.
  await db.delete(schema.taskLists).where(eq(schema.taskLists.id, list.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Tasks — views + list queries
// ---------------------------------------------------------------------------

export async function listTasks(req: Request, res: Response) {
  const view = req.query.view as string | undefined
  const listId = req.query.listId as string | undefined

  if (listId) {
    await getOwnedList(req.userId!, listId)
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.userId, req.userId!),
          eq(schema.tasks.listId, listId),
          eq(schema.tasks.isCompleted, false),
          isNull(schema.tasks.parentTaskId),
        ),
      )
      .orderBy(asc(schema.tasks.sortOrder), asc(schema.tasks.updatedAt))
    const counts = await subtaskCountsFor(rows.map((t) => t.id))
    res.json({ tasks: rows.map((t) => toTaskDto(t, counts.get(t.id))) })
    return
  }

  if (!view || !TASK_VIEWS.includes(view as TaskView)) {
    throw new HttpError(400, "Query param 'view' or 'listId' is required")
  }

  const base = [eq(schema.tasks.userId, req.userId!), isNull(schema.tasks.parentTaskId)]
  const todayEnd = endOfToday()

  let rows: (typeof schema.tasks.$inferSelect)[]

  if (view === "logbook") {
    rows = await db
      .select()
      .from(schema.tasks)
      .where(and(...base, eq(schema.tasks.isCompleted, true)))
      .orderBy(desc(schema.tasks.completedAt))
      .limit(200)
  } else if (view === "someday") {
    rows = await db
      .select()
      .from(schema.tasks)
      .where(and(...base, eq(schema.tasks.isCompleted, false), eq(schema.tasks.isSomeday, true)))
      .orderBy(asc(schema.tasks.sortOrder), asc(schema.tasks.updatedAt))
  } else if (view === "today") {
    rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          ...base,
          eq(schema.tasks.isCompleted, false),
          eq(schema.tasks.isSomeday, false),
          or(
            lte(schema.tasks.scheduledDate, todayEnd),
            lte(schema.tasks.dueDate, todayEnd),
          )!,
        ),
      )
      .orderBy(
        desc(schema.tasks.priority),
        sql`coalesce(${schema.tasks.dueDate}, ${schema.tasks.scheduledDate}) asc nulls last`,
        asc(schema.tasks.sortOrder),
      )
  } else if (view === "upcoming") {
    rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          ...base,
          eq(schema.tasks.isCompleted, false),
          eq(schema.tasks.isSomeday, false),
          // Not already surfaced in Today:
          or(isNull(schema.tasks.scheduledDate), gt(schema.tasks.scheduledDate, todayEnd))!,
          or(isNull(schema.tasks.dueDate), gt(schema.tasks.dueDate, todayEnd))!,
          // …but has at least one future date:
          or(gt(schema.tasks.scheduledDate, todayEnd), gt(schema.tasks.dueDate, todayEnd))!,
        ),
      )
      .orderBy(
        sql`coalesce(${schema.tasks.scheduledDate}, ${schema.tasks.dueDate}) asc`,
        asc(schema.tasks.sortOrder),
      )
  } else {
    // anytime — actionable, no dates, not parked in Someday.
    rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          ...base,
          eq(schema.tasks.isCompleted, false),
          eq(schema.tasks.isSomeday, false),
          isNull(schema.tasks.scheduledDate),
          isNull(schema.tasks.dueDate),
        ),
      )
      .orderBy(desc(schema.tasks.priority), asc(schema.tasks.sortOrder), asc(schema.tasks.updatedAt))
  }

  const counts = await subtaskCountsFor(rows.map((t) => t.id))
  res.json({ tasks: rows.map((t) => toTaskDto(t, counts.get(t.id))) })
}

export async function taskCounts(req: Request, res: Response) {
  const todayEnd = endOfToday()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.userId, req.userId!),
        isNull(schema.tasks.parentTaskId),
        eq(schema.tasks.isCompleted, false),
        eq(schema.tasks.isSomeday, false),
        or(lte(schema.tasks.scheduledDate, todayEnd), lte(schema.tasks.dueDate, todayEnd))!,
      ),
    )
  res.json({ today: row?.count ?? 0 })
}

// ---------------------------------------------------------------------------
// Tasks — CRUD
// ---------------------------------------------------------------------------

export async function createTask(req: Request, res: Response) {
  const input = req.body as CreateTaskInput

  if (input.listId) await getOwnedList(req.userId!, input.listId)
  if (input.parentTaskId) {
    const parent = await getOwnedTask(req.userId!, input.parentTaskId)
    if (parent.parentTaskId) throw new HttpError(400, "Subtasks cannot be nested")
  }

  const [task] = await db
    .insert(schema.tasks)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      listId: input.listId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
      priority: input.priority,
      rrule: input.rrule ?? null,
      isSomeday: input.isSomeday,
      tagsJson: input.tags,
      sortOrder: input.sortOrder,
    })
    .returning()
  if (!task) throw new HttpError(500, "Failed to create task")
  res.status(201).json({ task: toTaskDto(task) })
}

export async function getTask(req: Request, res: Response) {
  const task = await getOwnedTask(req.userId!, param(req.params.id))
  const subtasks = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.parentTaskId, task.id))
    .orderBy(asc(schema.tasks.sortOrder), asc(schema.tasks.updatedAt))
  const counts = await subtaskCountsFor([task.id])
  res.json({
    task: toTaskDto(task, counts.get(task.id)),
    subtasks: subtasks.map((t) => toTaskDto(t)),
  })
}

export async function patchTask(req: Request, res: Response) {
  const input = req.body as PatchTaskInput
  const task = await getOwnedTask(req.userId!, param(req.params.id))

  if (input.listId) await getOwnedList(req.userId!, input.listId)

  const set: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: new Date() }
  if (input.listId !== undefined) set.listId = input.listId
  if (input.title !== undefined) set.title = input.title
  if (input.description !== undefined) set.description = input.description
  if (input.dueDate !== undefined) set.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.scheduledDate !== undefined) {
    set.scheduledDate = input.scheduledDate ? new Date(input.scheduledDate) : null
  }
  if (input.priority !== undefined) set.priority = input.priority
  if (input.rrule !== undefined) set.rrule = input.rrule
  if (input.isSomeday !== undefined) set.isSomeday = input.isSomeday
  if (input.tags !== undefined) set.tagsJson = input.tags
  if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder

  const [updated] = await db
    .update(schema.tasks)
    .set(set)
    .where(eq(schema.tasks.id, task.id))
    .returning()
  const counts = await subtaskCountsFor([task.id])
  res.json({ task: toTaskDto(updated!, counts.get(task.id)) })
}

export async function deleteTask(req: Request, res: Response) {
  const task = await getOwnedTask(req.userId!, param(req.params.id))
  // parent_task_id has no FK — remove subtasks explicitly.
  await db.delete(schema.tasks).where(eq(schema.tasks.parentTaskId, task.id))
  await db.delete(schema.tasks).where(eq(schema.tasks.id, task.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Complete / uncomplete (recurrence-aware)
// ---------------------------------------------------------------------------

export async function completeTask(req: Request, res: Response) {
  const task = await getOwnedTask(req.userId!, param(req.params.id))
  if (task.isCompleted) {
    res.json({ task: toTaskDto(task), nextTask: null })
    return
  }

  const now = new Date()
  const [completed] = await db
    .update(schema.tasks)
    .set({ isCompleted: true, completedAt: now, updatedAt: now })
    .where(eq(schema.tasks.id, task.id))
    .returning()

  // Completing a parent also completes its open subtasks (Things behavior).
  if (!task.parentTaskId) {
    await db
      .update(schema.tasks)
      .set({ isCompleted: true, completedAt: now, updatedAt: now })
      .where(and(eq(schema.tasks.parentTaskId, task.id), eq(schema.tasks.isCompleted, false)))
  }

  // Recurring top-level task → spawn the next occurrence.
  let nextTask: Task | null = null
  const anchor = task.dueDate ?? task.scheduledDate
  if (task.rrule && anchor && !task.parentTaskId) {
    const next = nextOccurrence(task.rrule, anchor, now)
    if (next) {
      const deltaMs = next.getTime() - anchor.getTime()
      const newId = randomUUID()
      const [spawned] = await db
        .insert(schema.tasks)
        .values({
          id: newId,
          userId: task.userId,
          listId: task.listId,
          parentTaskId: null,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate ? new Date(task.dueDate.getTime() + deltaMs) : null,
          scheduledDate: task.scheduledDate
            ? new Date(task.scheduledDate.getTime() + deltaMs)
            : null,
          priority: task.priority,
          rrule: task.rrule,
          isSomeday: false,
          tagsJson: (task.tagsJson as string[]) ?? [],
          sortOrder: task.sortOrder,
        })
        .returning()
      if (spawned) {
        // Carry open subtasks over to the next occurrence.
        const subtasks = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.parentTaskId, task.id))
        for (const sub of subtasks) {
          await db.insert(schema.tasks).values({
            id: randomUUID(),
            userId: sub.userId,
            listId: sub.listId,
            parentTaskId: newId,
            title: sub.title,
            description: sub.description,
            priority: sub.priority,
            tagsJson: (sub.tagsJson as string[]) ?? [],
            sortOrder: sub.sortOrder,
          })
        }
        nextTask = toTaskDto(spawned)
      }
    }
  }

  res.json({ task: toTaskDto(completed!), nextTask })
}

export async function uncompleteTask(req: Request, res: Response) {
  const task = await getOwnedTask(req.userId!, param(req.params.id))
  const [updated] = await db
    .update(schema.tasks)
    .set({ isCompleted: false, completedAt: null, updatedAt: new Date() })
    .where(eq(schema.tasks.id, task.id))
    .returning()
  res.json({ task: toTaskDto(updated!) })
}

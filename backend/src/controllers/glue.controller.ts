import type { Request, Response } from "express"
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import { occurrencesBetween } from "../services/recurrence.js"
import { BASE_CURRENCY, toBase } from "../services/fx.js"
import {
  ENTITY_LINK_TYPES,
  SEARCH_TYPES,
  type CreateLinkInput,
  type EmailToTaskInput,
  type EntityLink,
  type EntityLinkType,
  type LinkedEntity,
  type SearchResponse,
  type SearchResultItem,
  type SearchType,
  type TodayResponse,
} from "../shared/glue.schemas.js"

/** Express 5 types route params as string | string[]; normalize to string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

function escapeLike(q: string): string {
  return q.replace(/[%_\\]/g, (c) => `\\${c}`)
}

// ---------------------------------------------------------------------------
// Entity resolution (ownership check + display title), shared by links code
// ---------------------------------------------------------------------------

/**
 * Resolve an entity by type + id, scoped to the user. Returns a display
 * title, or null when the entity doesn't exist or isn't owned by the user.
 */
async function resolveEntity(
  userId: string,
  type: EntityLinkType,
  id: string,
): Promise<LinkedEntity | null> {
  switch (type) {
    case "thread": {
      const [row] = await db
        .select({ subject: schema.mailThreads.subject })
        .from(schema.mailThreads)
        .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
        .where(and(eq(schema.mailThreads.id, id), eq(schema.accounts.userId, userId)))
        .limit(1)
      return row ? { type, id, title: row.subject || "(no subject)" } : null
    }
    case "email": {
      const [row] = await db
        .select({ subject: schema.mailThreads.subject })
        .from(schema.emails)
        .innerJoin(schema.mailThreads, eq(schema.emails.threadId, schema.mailThreads.id))
        .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
        .where(and(eq(schema.emails.id, id), eq(schema.accounts.userId, userId)))
        .limit(1)
      return row ? { type, id, title: row.subject || "(no subject)" } : null
    }
    case "task": {
      const [row] = await db
        .select({ title: schema.tasks.title })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
        .limit(1)
      return row ? { type, id, title: row.title } : null
    }
    case "event": {
      const [row] = await db
        .select({ title: schema.events.title })
        .from(schema.events)
        .innerJoin(schema.calendars, eq(schema.events.calendarId, schema.calendars.id))
        .where(and(eq(schema.events.id, id), eq(schema.calendars.userId, userId)))
        .limit(1)
      return row ? { type, id, title: row.title } : null
    }
    case "note": {
      const [row] = await db
        .select({ title: schema.notes.title })
        .from(schema.notes)
        .where(and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)))
        .limit(1)
      return row ? { type, id, title: row.title || "Untitled note" } : null
    }
    case "transaction": {
      const [row] = await db
        .select({
          description: schema.transactions.description,
          merchant: schema.transactions.merchant,
          amount: schema.transactions.amount,
        })
        .from(schema.transactions)
        .innerJoin(
          schema.financeAccounts,
          eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
        )
        .where(and(eq(schema.transactions.id, id), eq(schema.financeAccounts.userId, userId)))
        .limit(1)
      return row
        ? { type, id, title: row.merchant ?? row.description ?? `Transaction (${row.amount})` }
        : null
    }
    case "budget": {
      const [row] = await db
        .select({ category: schema.budgets.category })
        .from(schema.budgets)
        .where(and(eq(schema.budgets.id, id), eq(schema.budgets.userId, userId)))
        .limit(1)
      return row ? { type, id, title: `Budget: ${row.category}` } : null
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/search
// ---------------------------------------------------------------------------

const SEARCH_MAX_PER_TYPE = 20

export async function search(req: Request, res: Response) {
  const q = ((req.query.q as string | undefined) ?? "").trim()
  if (q.length < 1) throw new HttpError(400, "Query param 'q' is required")

  const typesRaw = ((req.query.types as string | undefined) ?? "").trim()
  const requested = typesRaw
    ? (typesRaw.split(",").map((t) => t.trim()) as SearchType[]).filter((t) =>
        (SEARCH_TYPES as readonly string[]).includes(t),
      )
    : [...SEARCH_TYPES]

  const limit = Math.min(
    Math.max(Number.parseInt((req.query.limit as string) ?? "10", 10) || 10, 1),
    SEARCH_MAX_PER_TYPE,
  )

  const pattern = `%${escapeLike(q)}%`
  const userId = req.userId!

  const empty: SearchResultItem[] = []
  const [mail, tasks, events, notes, transactions] = await Promise.all([
    requested.includes("mail")
      ? db
          .select({
            id: schema.mailThreads.id,
            subject: schema.mailThreads.subject,
            snippet: schema.mailThreads.snippet,
            lastMessageAt: schema.mailThreads.lastMessageAt,
          })
          .from(schema.mailThreads)
          .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
          .where(
            and(
              eq(schema.accounts.userId, userId),
              or(
                ilike(schema.mailThreads.subject, pattern),
                ilike(schema.mailThreads.snippet, pattern),
              ),
            ),
          )
          .orderBy(desc(schema.mailThreads.lastMessageAt))
          .limit(limit)
      : Promise.resolve([]),
    requested.includes("tasks")
      ? db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            description: schema.tasks.description,
            dueDate: schema.tasks.dueDate,
          })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.userId, userId),
              or(
                ilike(schema.tasks.title, pattern),
                ilike(schema.tasks.description, pattern),
              ),
            ),
          )
          .orderBy(desc(schema.tasks.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    requested.includes("events")
      ? db
          .select({
            id: schema.events.id,
            title: schema.events.title,
            location: schema.events.location,
            startTime: schema.events.startTime,
          })
          .from(schema.events)
          .innerJoin(schema.calendars, eq(schema.events.calendarId, schema.calendars.id))
          .where(
            and(
              eq(schema.calendars.userId, userId),
              or(
                ilike(schema.events.title, pattern),
                ilike(schema.events.location, pattern),
              ),
            ),
          )
          .orderBy(desc(schema.events.startTime))
          .limit(limit)
      : Promise.resolve([]),
    requested.includes("notes")
      ? db
          .select({
            id: schema.notes.id,
            title: schema.notes.title,
            contentText: schema.notes.contentText,
            updatedAt: schema.notes.updatedAt,
          })
          .from(schema.notes)
          .where(
            and(
              eq(schema.notes.userId, userId),
              or(
                ilike(schema.notes.title, pattern),
                ilike(schema.notes.contentText, pattern),
              ),
            ),
          )
          .orderBy(desc(schema.notes.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    requested.includes("transactions")
      ? db
          .select({
            id: schema.transactions.id,
            description: schema.transactions.description,
            merchant: schema.transactions.merchant,
            amount: schema.transactions.amount,
            currency: schema.transactions.currency,
            date: schema.transactions.date,
          })
          .from(schema.transactions)
          .innerJoin(
            schema.financeAccounts,
            eq(schema.transactions.financeAccountId, schema.financeAccounts.id),
          )
          .where(
            and(
              eq(schema.financeAccounts.userId, userId),
              or(
                ilike(schema.transactions.description, pattern),
                ilike(schema.transactions.merchant, pattern),
              ),
            ),
          )
          .orderBy(desc(schema.transactions.date))
          .limit(limit)
      : Promise.resolve([]),
  ])

  const body: SearchResponse = {
    mail: mail.map((t) => ({
      id: t.id,
      entityType: "thread",
      title: t.subject || "(no subject)",
      subtitle: t.snippet || null,
      date: t.lastMessageAt?.toISOString() ?? null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      entityType: "task",
      title: t.title,
      subtitle: t.description,
      date: t.dueDate?.toISOString() ?? null,
    })),
    events: events.map((e) => ({
      id: e.id,
      entityType: "event",
      title: e.title,
      subtitle: e.location,
      date: e.startTime.toISOString(),
    })),
    notes: notes.map((n) => ({
      id: n.id,
      entityType: "note",
      title: n.title || "Untitled note",
      subtitle: n.contentText ? n.contentText.slice(0, 120) : null,
      date: n.updatedAt.toISOString(),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      entityType: "transaction",
      title: t.merchant ?? t.description ?? "Transaction",
      subtitle: `${Number(t.amount)} ${t.currency}`,
      date: t.date.toISOString(),
    })),
  }
  res.json(body)
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

function toLinkDto(
  row: typeof schema.entityLinks.$inferSelect,
  other: LinkedEntity,
): EntityLink {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    targetType: row.targetType,
    targetId: row.targetId,
    other,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function createLink(req: Request, res: Response) {
  const input = req.body as CreateLinkInput
  const userId = req.userId!

  if (input.sourceType === input.targetType && input.sourceId === input.targetId) {
    throw new HttpError(400, "Cannot link an entity to itself")
  }

  const [source, target] = await Promise.all([
    resolveEntity(userId, input.sourceType, input.sourceId),
    resolveEntity(userId, input.targetType, input.targetId),
  ])
  if (!source) throw new HttpError(404, "Source entity not found")
  if (!target) throw new HttpError(404, "Target entity not found")

  // Idempotent on the unique tuple: insert, then read back on conflict.
  const inserted = await db
    .insert(schema.entityLinks)
    .values({
      id: input.id ?? randomUUID(),
      userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
    })
    .onConflictDoNothing()
    .returning()

  let link = inserted[0]
  let created = true
  if (!link) {
    created = false
    const [existing] = await db
      .select()
      .from(schema.entityLinks)
      .where(
        and(
          eq(schema.entityLinks.userId, userId),
          eq(schema.entityLinks.sourceType, input.sourceType),
          eq(schema.entityLinks.sourceId, input.sourceId),
          eq(schema.entityLinks.targetType, input.targetType),
          eq(schema.entityLinks.targetId, input.targetId),
        ),
      )
      .limit(1)
    if (!existing) throw new HttpError(500, "Failed to create link")
    link = existing
  }

  res.status(created ? 201 : 200).json({ link: toLinkDto(link, target) })
}

export async function listLinks(req: Request, res: Response) {
  const type = ((req.query.type as string | undefined) ?? "").trim() as EntityLinkType
  const id = ((req.query.id as string | undefined) ?? "").trim()
  if (!(ENTITY_LINK_TYPES as readonly string[]).includes(type) || !id) {
    throw new HttpError(400, "Query params 'type' and 'id' are required")
  }
  const userId = req.userId!

  // Both directions: links where the entity is the source OR the target.
  const rows = await db
    .select()
    .from(schema.entityLinks)
    .where(
      and(
        eq(schema.entityLinks.userId, userId),
        or(
          and(eq(schema.entityLinks.sourceType, type), eq(schema.entityLinks.sourceId, id)),
          and(eq(schema.entityLinks.targetType, type), eq(schema.entityLinks.targetId, id)),
        ),
      ),
    )
    .orderBy(desc(schema.entityLinks.createdAt))

  const links: EntityLink[] = []
  for (const row of rows) {
    const isSource = row.sourceType === type && row.sourceId === id
    const otherType = isSource ? row.targetType : row.sourceType
    const otherId = isSource ? row.targetId : row.sourceId
    const other = await resolveEntity(userId, otherType, otherId)
    // Skip links whose far side no longer exists (deleted entity).
    if (other) links.push(toLinkDto(row, other))
  }

  res.json({ links })
}

export async function deleteLink(req: Request, res: Response) {
  const id = param(req.params.id)
  const deleted = await db
    .delete(schema.entityLinks)
    .where(and(eq(schema.entityLinks.id, id), eq(schema.entityLinks.userId, req.userId!)))
    .returning({ id: schema.entityLinks.id })
  if (deleted.length === 0) throw new HttpError(404, "Link not found")
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// POST /api/links/email-to-task
// ---------------------------------------------------------------------------

export async function emailToTask(req: Request, res: Response) {
  const input = req.body as EmailToTaskInput
  const userId = req.userId!

  const [thread] = await db
    .select({
      id: schema.mailThreads.id,
      subject: schema.mailThreads.subject,
      snippet: schema.mailThreads.snippet,
    })
    .from(schema.mailThreads)
    .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
    .where(and(eq(schema.mailThreads.id, input.threadId), eq(schema.accounts.userId, userId)))
    .limit(1)
  if (!thread) throw new HttpError(404, "Thread not found")

  // Sequential insert + link (neon-http has no interactive transactions);
  // the link insert is idempotent, so retries are safe.
  const title = thread.subject || "(no subject)"
  const description = [thread.snippet, `From email: /mail/thread/${thread.id}`]
    .filter(Boolean)
    .join("\n\n")

  const [task] = await db
    .insert(schema.tasks)
    .values({
      id: randomUUID(),
      userId,
      listId: input.listId ?? null,
      title: title.slice(0, 500),
      description: description.slice(0, 10_000),
    })
    .returning()
  if (!task) throw new HttpError(500, "Failed to create task")

  const [link] = await db
    .insert(schema.entityLinks)
    .values({
      userId,
      sourceType: "thread",
      sourceId: thread.id,
      targetType: "task",
      targetId: task.id,
    })
    .onConflictDoNothing()
    .returning()

  res.status(201).json({
    task: {
      id: task.id,
      listId: task.listId,
      parentTaskId: task.parentTaskId,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate?.toISOString() ?? null,
      scheduledDate: task.scheduledDate?.toISOString() ?? null,
      priority: task.priority,
      rrule: task.rrule,
      isSomeday: task.isSomeday,
      tags: (task.tagsJson as string[]) ?? [],
      isCompleted: task.isCompleted,
      completedAt: task.completedAt?.toISOString() ?? null,
      sortOrder: task.sortOrder,
      updatedAt: task.updatedAt.toISOString(),
    },
    link: link
      ? toLinkDto(link, { type: "task", id: task.id, title: task.title })
      : null,
  })
}

// ---------------------------------------------------------------------------
// GET /api/today
// ---------------------------------------------------------------------------

/** Offset of `tz` from UTC (ms) at the given instant, via Intl. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = dtf.formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  )
  return asUtc - instant.getTime()
}

/** [start, end) of the local day `dateStr` (YYYY-MM-DD) in timezone `tz`. */
function dayRange(dateStr: string, tz: string): { start: Date; end: Date } {
  const utcMidnight = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(utcMidnight.getTime())) {
    throw new HttpError(400, "Invalid 'date' (expected YYYY-MM-DD)")
  }
  let offset: number
  try {
    offset = tzOffsetMs(utcMidnight, tz)
  } catch {
    throw new HttpError(400, "Invalid 'tz' (expected IANA timezone name)")
  }
  // Refine once to handle DST transitions near midnight.
  let start = new Date(utcMidnight.getTime() - offset)
  offset = tzOffsetMs(start, tz)
  start = new Date(utcMidnight.getTime() - offset)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export async function getToday(req: Request, res: Response) {
  const userId = req.userId!
  const tz = ((req.query.tz as string | undefined) ?? "UTC").trim() || "UTC"
  const now = new Date()
  const defaultDate = (() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now)
    } catch {
      throw new HttpError(400, "Invalid 'tz' (expected IANA timezone name)")
    }
  })()
  const dateStr = ((req.query.date as string | undefined) ?? defaultDate).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new HttpError(400, "Invalid 'date' (expected YYYY-MM-DD)")
  }
  const { start, end } = dayRange(dateStr, tz)

  const calendarIds = (
    await db
      .select({ id: schema.calendars.id })
      .from(schema.calendars)
      .where(eq(schema.calendars.userId, userId))
  ).map((r) => r.id)

  const [oneOffEvents, recurringEvents, dueTasks, unreadCountRows, unreadThreads, budgets, spendRows] =
    await Promise.all([
      // One-off events overlapping today.
      calendarIds.length > 0
        ? db
            .select({ event: schema.events, calendarColor: schema.calendars.color })
            .from(schema.events)
            .innerJoin(schema.calendars, eq(schema.events.calendarId, schema.calendars.id))
            .where(
              and(
                inArray(schema.events.calendarId, calendarIds),
                isNull(schema.events.rrule),
                lt(schema.events.startTime, end),
                gt(schema.events.endTime, start),
              ),
            )
            .orderBy(asc(schema.events.startTime))
        : Promise.resolve([]),
      // Recurring events anchored on or before today's end — expand below.
      calendarIds.length > 0
        ? db
            .select({ event: schema.events, calendarColor: schema.calendars.color })
            .from(schema.events)
            .innerJoin(schema.calendars, eq(schema.events.calendarId, schema.calendars.id))
            .where(
              and(
                inArray(schema.events.calendarId, calendarIds),
                isNotNull(schema.events.rrule),
                lt(schema.events.startTime, end),
              ),
            )
        : Promise.resolve([]),
      // Tasks due today or overdue (incomplete, not someday).
      db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.isCompleted, false),
            eq(schema.tasks.isSomeday, false),
            isNull(schema.tasks.parentTaskId),
            or(
              lt(schema.tasks.dueDate, end),
              and(gte(schema.tasks.scheduledDate, start), lt(schema.tasks.scheduledDate, end)),
            ),
          ),
        )
        .orderBy(asc(schema.tasks.dueDate))
        .limit(50),
      // Unread mail count across the user's accounts.
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.mailThreads)
        .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
        .where(
          and(
            eq(schema.accounts.userId, userId),
            eq(schema.mailThreads.isUnread, true),
            eq(schema.mailThreads.folder, "inbox"),
          ),
        ),
      // 5 most recent unread threads.
      db
        .select({
          id: schema.mailThreads.id,
          subject: schema.mailThreads.subject,
          snippet: schema.mailThreads.snippet,
          lastMessageAt: schema.mailThreads.lastMessageAt,
        })
        .from(schema.mailThreads)
        .innerJoin(schema.accounts, eq(schema.mailThreads.accountId, schema.accounts.id))
        .where(
          and(
            eq(schema.accounts.userId, userId),
            eq(schema.mailThreads.isUnread, true),
            eq(schema.mailThreads.folder, "inbox"),
          ),
        )
        .orderBy(desc(schema.mailThreads.lastMessageAt))
        .limit(5),
      // Budgets.
      db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.userId, userId))
        .orderBy(desc(schema.budgets.monthlyLimit)),
      // Month-to-date debit spend (mirrors finance controller logic).
      db
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
            gte(
              schema.transactions.date,
              new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
            ),
          ),
        ),
    ])

  // Expand recurring events into today's occurrences.
  const events = oneOffEvents.map(({ event, calendarColor }) => ({
    id: event.id,
    title: event.title,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    allDay: event.allDay,
    location: event.location,
    calendarColor,
  }))
  for (const { event, calendarColor } of recurringEvents) {
    const durationMs = event.endTime.getTime() - event.startTime.getTime()
    for (const occStart of occurrencesBetween(event.rrule!, event.startTime, start, end)) {
      if (occStart.getTime() >= end.getTime()) continue
      events.push({
        id: event.id,
        title: event.title,
        startTime: occStart.toISOString(),
        endTime: new Date(occStart.getTime() + durationMs).toISOString(),
        allDay: event.allDay,
        location: event.location,
        calendarColor,
      })
    }
  }
  events.sort((a, b) => a.startTime.localeCompare(b.startTime))

  // Month spend per category + total (base currency).
  const spendByCategory = new Map<string, number>()
  let monthSpend = 0
  for (const r of spendRows) {
    const huf = toBase(Number(r.amount), r.currency as Parameters<typeof toBase>[1])
    monthSpend += huf
    const key = r.category ?? "other"
    spendByCategory.set(key, (spendByCategory.get(key) ?? 0) + huf)
  }

  const body: TodayResponse = {
    date: dateStr,
    events,
    tasks: dueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      priority: t.priority,
      isOverdue: t.dueDate != null && t.dueDate.getTime() < start.getTime(),
    })),
    unreadCount: unreadCountRows[0]?.count ?? 0,
    unreadThreads: unreadThreads.map((t) => ({
      id: t.id,
      subject: t.subject || "(no subject)",
      snippet: t.snippet,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    })),
    monthSpend: Math.round(monthSpend * 100) / 100,
    budgets: budgets.map((b) => ({
      id: b.id,
      category: b.category,
      monthlyLimit: Number(b.monthlyLimit),
      spent: Math.round((spendByCategory.get(b.category) ?? 0) * 100) / 100,
      currency: BASE_CURRENCY,
    })),
  }
  res.json(body)
}

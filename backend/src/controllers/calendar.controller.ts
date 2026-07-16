import type { Request, Response } from "express"
import { and, asc, eq, gte, ilike, inArray, isNull, isNotNull, lte, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import { occurrencesBetween } from "../services/recurrence.js"
import { buildIcs, parseIcs } from "../services/ics.js"
import type {
  Calendar,
  CalendarEvent,
  CalendarTask,
  CreateCalendarInput,
  CreateEventInput,
  ImportIcsInput,
  PatchCalendarInput,
  PatchEventInput,
} from "../shared/calendar.schemas.js"

/** Express 5 types route params as string | string[]; normalize to string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

/** Widest allowed events query window (guards recurrence expansion cost). */
const MAX_RANGE_DAYS = 400

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOwnedCalendar(userId: string, calendarId: string) {
  const [cal] = await db
    .select()
    .from(schema.calendars)
    .where(and(eq(schema.calendars.id, calendarId), eq(schema.calendars.userId, userId)))
    .limit(1)
  if (!cal) throw new HttpError(404, "Calendar not found")
  return cal
}

/** Event lookup scoped through calendar ownership. */
async function getOwnedEvent(userId: string, eventId: string) {
  const [row] = await db
    .select({ event: schema.events })
    .from(schema.events)
    .innerJoin(schema.calendars, eq(schema.events.calendarId, schema.calendars.id))
    .where(and(eq(schema.events.id, eventId), eq(schema.calendars.userId, userId)))
    .limit(1)
  if (!row) throw new HttpError(404, "Event not found")
  return row.event
}

function toCalendarDto(row: typeof schema.calendars.$inferSelect, eventCount?: number): Calendar {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    externalId: row.externalId,
    eventCount,
  }
}

function toEventDto(
  row: typeof schema.events.$inferSelect,
  occurrence?: { start: Date; end: Date },
): CalendarEvent {
  return {
    id: row.id,
    calendarId: row.calendarId,
    title: row.title,
    description: row.description,
    startTime: (occurrence?.start ?? row.startTime).toISOString(),
    endTime: (occurrence?.end ?? row.endTime).toISOString(),
    allDay: row.allDay,
    location: row.location,
    rrule: row.rrule,
    reminderMinutes: row.reminderMinutes,
    timezone: row.timezone,
    externalId: row.externalId,
    updatedAt: row.updatedAt.toISOString(),
    isRecurringInstance: occurrence ? true : undefined,
  }
}

function parseRange(req: Request): { start: Date; end: Date } {
  const startRaw = req.query.start as string | undefined
  const endRaw = req.query.end as string | undefined
  if (!startRaw || !endRaw) {
    throw new HttpError(400, "Query params 'start' and 'end' (ISO datetimes) are required")
  }
  const start = new Date(startRaw)
  const end = new Date(endRaw)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "Invalid 'start' or 'end' datetime")
  }
  if (end.getTime() < start.getTime()) {
    throw new HttpError(400, "'end' must not be before 'start'")
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new HttpError(400, `Range must not exceed ${MAX_RANGE_DAYS} days`)
  }
  return { start, end }
}

async function ownedCalendarIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.calendars.id })
    .from(schema.calendars)
    .where(eq(schema.calendars.userId, userId))
  return rows.map((r) => r.id)
}

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export async function listCalendars(req: Request, res: Response) {
  const calendars = await db
    .select()
    .from(schema.calendars)
    .where(eq(schema.calendars.userId, req.userId!))
    .orderBy(asc(schema.calendars.name))

  const ids = calendars.map((c) => c.id)
  const countMap = new Map<string, number>()
  if (ids.length > 0) {
    const counts = await db
      .select({ calendarId: schema.events.calendarId, count: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(inArray(schema.events.calendarId, ids))
      .groupBy(schema.events.calendarId)
    for (const c of counts) countMap.set(c.calendarId, c.count)
  }

  res.json({ calendars: calendars.map((c) => toCalendarDto(c, countMap.get(c.id) ?? 0)) })
}

export async function createCalendar(req: Request, res: Response) {
  const input = req.body as CreateCalendarInput
  const [cal] = await db
    .insert(schema.calendars)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      name: input.name,
      color: input.color ?? null,
    })
    .returning()
  if (!cal) throw new HttpError(500, "Failed to create calendar")
  res.status(201).json({ calendar: toCalendarDto(cal, 0) })
}

export async function patchCalendar(req: Request, res: Response) {
  const input = req.body as PatchCalendarInput
  const cal = await getOwnedCalendar(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.calendars.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) set.name = input.name
  if (input.color !== undefined) set.color = input.color

  const [updated] = await db
    .update(schema.calendars)
    .set(set)
    .where(eq(schema.calendars.id, cal.id))
    .returning()
  res.json({ calendar: toCalendarDto(updated!) })
}

export async function deleteCalendar(req: Request, res: Response) {
  const cal = await getOwnedCalendar(req.userId!, param(req.params.id))
  // events.calendar_id has ON DELETE CASCADE — events go with the calendar.
  await db.delete(schema.calendars).where(eq(schema.calendars.id, cal.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Events — range query (expands recurrences; optionally overlays tasks)
// ---------------------------------------------------------------------------

export async function listEvents(req: Request, res: Response) {
  const { start, end } = parseRange(req)
  const calendarIdFilter = req.query.calendarId as string | undefined
  const includeTasks = req.query.includeTasks === "true" || req.query.includeTasks === "1"

  let calendarIds: string[]
  if (calendarIdFilter) {
    await getOwnedCalendar(req.userId!, calendarIdFilter)
    calendarIds = [calendarIdFilter]
  } else {
    calendarIds = await ownedCalendarIds(req.userId!)
  }

  const events: CalendarEvent[] = []

  if (calendarIds.length > 0) {
    // One-off events overlapping the window.
    const oneOff = await db
      .select()
      .from(schema.events)
      .where(
        and(
          inArray(schema.events.calendarId, calendarIds),
          isNull(schema.events.rrule),
          lte(schema.events.startTime, end),
          gte(schema.events.endTime, start),
        ),
      )
      .orderBy(asc(schema.events.startTime))
    for (const row of oneOff) events.push(toEventDto(row))

    // Recurring events anchored on or before the window's end — expand.
    const recurring = await db
      .select()
      .from(schema.events)
      .where(
        and(
          inArray(schema.events.calendarId, calendarIds),
          isNotNull(schema.events.rrule),
          lte(schema.events.startTime, end),
        ),
      )
    for (const row of recurring) {
      const durationMs = row.endTime.getTime() - row.startTime.getTime()
      // Expand from a window widened by the duration so events that started
      // before `start` but still overlap it are included.
      const expandStart = new Date(start.getTime() - durationMs)
      const starts = occurrencesBetween(row.rrule!, row.startTime, expandStart, end)
      for (const occStart of starts) {
        const occEnd = new Date(occStart.getTime() + durationMs)
        if (occEnd.getTime() < start.getTime()) continue
        const isMaster = occStart.getTime() === row.startTime.getTime()
        events.push(toEventDto(row, isMaster ? undefined : { start: occStart, end: occEnd }))
      }
    }

    events.sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  // Superapp integration (plan.md Phase 4): surface tasks with dates in range.
  let tasks: CalendarTask[] | undefined
  if (includeTasks) {
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.userId, req.userId!),
          isNull(schema.tasks.parentTaskId),
          eq(schema.tasks.isCompleted, false),
          or(
            and(gte(schema.tasks.dueDate, start), lte(schema.tasks.dueDate, end)),
            and(gte(schema.tasks.scheduledDate, start), lte(schema.tasks.scheduledDate, end)),
          )!,
        ),
      )
      .orderBy(asc(schema.tasks.dueDate), asc(schema.tasks.scheduledDate))
    tasks = rows.map((t) => ({
      id: t.id,
      title: t.title,
      date: (t.dueDate ?? t.scheduledDate!).toISOString(),
      isDue: t.dueDate != null,
      priority: t.priority,
      isCompleted: t.isCompleted,
    }))
  }

  res.json({ events, ...(tasks !== undefined ? { tasks } : {}) })
}

// ---------------------------------------------------------------------------
// Events — CRUD
// ---------------------------------------------------------------------------

export async function createEvent(req: Request, res: Response) {
  const input = req.body as CreateEventInput
  await getOwnedCalendar(req.userId!, input.calendarId)

  const [event] = await db
    .insert(schema.events)
    .values({
      id: input.id ?? randomUUID(),
      calendarId: input.calendarId,
      title: input.title,
      description: input.description ?? null,
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
      allDay: input.allDay,
      location: input.location ?? null,
      rrule: input.rrule ?? null,
      reminderMinutes: input.reminderMinutes ?? null,
      timezone: input.timezone ?? null,
    })
    .returning()
  if (!event) throw new HttpError(500, "Failed to create event")
  res.status(201).json({ event: toEventDto(event) })
}

export async function getEvent(req: Request, res: Response) {
  const event = await getOwnedEvent(req.userId!, param(req.params.id))
  res.json({ event: toEventDto(event) })
}

export async function patchEvent(req: Request, res: Response) {
  const input = req.body as PatchEventInput
  const event = await getOwnedEvent(req.userId!, param(req.params.id))

  if (input.calendarId) await getOwnedCalendar(req.userId!, input.calendarId)

  const set: Partial<typeof schema.events.$inferInsert> = { updatedAt: new Date() }
  if (input.calendarId !== undefined) set.calendarId = input.calendarId
  if (input.title !== undefined) set.title = input.title
  if (input.description !== undefined) set.description = input.description
  if (input.startTime !== undefined) set.startTime = new Date(input.startTime)
  if (input.endTime !== undefined) set.endTime = new Date(input.endTime)
  if (input.allDay !== undefined) set.allDay = input.allDay
  if (input.location !== undefined) set.location = input.location
  if (input.rrule !== undefined) set.rrule = input.rrule
  if (input.reminderMinutes !== undefined) set.reminderMinutes = input.reminderMinutes
  if (input.timezone !== undefined) set.timezone = input.timezone

  const nextStart = set.startTime ?? event.startTime
  const nextEnd = set.endTime ?? event.endTime
  if (nextEnd.getTime() < nextStart.getTime()) {
    throw new HttpError(400, "endTime must not be before startTime")
  }

  const [updated] = await db
    .update(schema.events)
    .set(set)
    .where(eq(schema.events.id, event.id))
    .returning()
  res.json({ event: toEventDto(updated!) })
}

export async function deleteEvent(req: Request, res: Response) {
  const event = await getOwnedEvent(req.userId!, param(req.params.id))
  await db.delete(schema.events).where(eq(schema.events.id, event.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchEvents(req: Request, res: Response) {
  const q = ((req.query.q as string | undefined) ?? "").trim()
  if (q.length < 2) throw new HttpError(400, "Query param 'q' must be at least 2 characters")

  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`
  const rows = await db
    .select({ event: schema.events })
    .from(schema.events)
    .innerJoin(schema.calendars, eq(schema.events.calendarId, schema.calendars.id))
    .where(
      and(
        eq(schema.calendars.userId, req.userId!),
        or(
          ilike(schema.events.title, pattern),
          ilike(schema.events.location, pattern),
          ilike(schema.events.description, pattern),
        )!,
      ),
    )
    .orderBy(asc(schema.events.startTime))
    .limit(100)

  res.json({ events: rows.map((r) => toEventDto(r.event)) })
}

// ---------------------------------------------------------------------------
// .ics export / import
// ---------------------------------------------------------------------------

export async function exportCalendarIcs(req: Request, res: Response) {
  const cal = await getOwnedCalendar(req.userId!, param(req.params.id))
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.calendarId, cal.id))
    .orderBy(asc(schema.events.startTime))

  const ics = buildIcs(
    cal.name,
    rows.map((e) => ({
      uid: e.externalId ?? `${e.id}@superapp`,
      title: e.title,
      description: e.description,
      location: e.location,
      start: e.startTime,
      end: e.endTime,
      allDay: e.allDay,
      rrule: e.rrule,
    })),
  )

  res
    .set("Content-Type", "text/calendar; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="${cal.name.replace(/[^\w.-]+/g, "_")}.ics"`)
    .send(ics)
}

export async function importIcs(req: Request, res: Response) {
  const input = req.body as ImportIcsInput
  const cal = await getOwnedCalendar(req.userId!, input.calendarId)

  const parsed = parseIcs(input.ics)
  if (parsed.length === 0) {
    res.json({ imported: 0, skipped: 0 })
    return
  }

  // Dedupe against previously imported events by UID (external_id).
  const uids = parsed.map((e) => e.uid)
  const existing = await db
    .select({ externalId: schema.events.externalId })
    .from(schema.events)
    .where(and(eq(schema.events.calendarId, cal.id), inArray(schema.events.externalId, uids)))
  const seen = new Set(existing.map((e) => e.externalId))

  let imported = 0
  let skipped = 0
  for (const ev of parsed) {
    if (seen.has(ev.uid)) {
      skipped++
      continue
    }
    await db.insert(schema.events).values({
      id: randomUUID(),
      calendarId: cal.id,
      title: ev.title,
      description: ev.description,
      startTime: ev.start,
      endTime: ev.end,
      allDay: ev.allDay,
      location: ev.location,
      rrule: ev.rrule,
      externalId: ev.uid,
    })
    seen.add(ev.uid)
    imported++
  }

  res.json({ imported, skipped })
}

// Shared Zod 4 schemas for the Calendar module (plan.md Phase 4).
// Hand-copied from backend/src/shared/calendar.schemas.ts — keep both in sync
// (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

// ---------------------------------------------------------------------------
// Requests — calendars
// ---------------------------------------------------------------------------

export const createCalendarSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  name: z.string().min(1).max(120),
  color: z.string().max(32).optional(),
})

export const patchCalendarSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    color: z.string().max(32).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Requests — events
// ---------------------------------------------------------------------------

export const createEventSchema = z
  .object({
    /** Client-generated UUID (offline-first sync, plan.md §0.3). */
    id: z.uuid().optional(),
    calendarId: z.uuid(),
    title: z.string().min(1).max(500),
    description: z.string().max(10_000).nullable().optional(),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    allDay: z.boolean().default(false),
    location: z.string().max(500).nullable().optional(),
    /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE". */
    rrule: z.string().max(500).nullable().optional(),
    /** Minutes before start to remind (null = no reminder). */
    reminderMinutes: z.number().int().min(0).max(40_320).nullable().optional(),
    /** IANA timezone the event was created in, e.g. "Europe/Budapest". */
    timezone: z.string().max(64).nullable().optional(),
  })
  .refine((v) => new Date(v.endTime).getTime() >= new Date(v.startTime).getTime(), {
    message: "endTime must not be before startTime",
    path: ["endTime"],
  })

export const patchEventSchema = z
  .object({
    calendarId: z.uuid().optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10_000).nullable().optional(),
    startTime: z.iso.datetime().optional(),
    endTime: z.iso.datetime().optional(),
    allDay: z.boolean().optional(),
    location: z.string().max(500).nullable().optional(),
    rrule: z.string().max(500).nullable().optional(),
    reminderMinutes: z.number().int().min(0).max(40_320).nullable().optional(),
    timezone: z.string().max(64).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

export const importIcsSchema = z.object({
  calendarId: z.uuid(),
  /** Raw .ics file text (VCALENDAR with VEVENTs). */
  ics: z.string().min(1).max(2_000_000),
})

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const calendarSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
  externalId: z.string().nullable(),
  /** Number of (non-expanded) events in this calendar. */
  eventCount: z.number().optional(),
})

export const eventSchema = z.object({
  id: z.uuid(),
  calendarId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  rrule: z.string().nullable(),
  reminderMinutes: z.number().nullable(),
  timezone: z.string().nullable(),
  externalId: z.string().nullable(),
  updatedAt: z.string(),
  /**
   * True when this row is an expanded instance of a recurring event —
   * startTime/endTime are the occurrence's, id is the master event's.
   */
  isRecurringInstance: z.boolean().optional(),
})

/** Compact task shape surfaced inside calendar views (superapp integration). */
export const calendarTaskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** The date the task appears under (dueDate ?? scheduledDate). */
  date: z.string(),
  isDue: z.boolean(),
  priority: z.number(),
  isCompleted: z.boolean(),
})

export const calendarsResponseSchema = z.object({
  calendars: z.array(calendarSchema),
})

export const eventsRangeResponseSchema = z.object({
  events: z.array(eventSchema),
  /** Present when includeTasks=true was requested. */
  tasks: z.array(calendarTaskSchema).optional(),
})

export const eventDetailResponseSchema = z.object({
  event: eventSchema,
})

export const importIcsResponseSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
})

export type CreateCalendarInput = z.infer<typeof createCalendarSchema>
export type PatchCalendarInput = z.infer<typeof patchCalendarSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type PatchEventInput = z.infer<typeof patchEventSchema>
export type ImportIcsInput = z.infer<typeof importIcsSchema>
export type Calendar = z.infer<typeof calendarSchema>
export type CalendarEvent = z.infer<typeof eventSchema>
export type CalendarTask = z.infer<typeof calendarTaskSchema>
export type CalendarsResponse = z.infer<typeof calendarsResponseSchema>
export type EventsRangeResponse = z.infer<typeof eventsRangeResponseSchema>
export type EventDetailResponse = z.infer<typeof eventDetailResponseSchema>
export type ImportIcsResponse = z.infer<typeof importIcsResponseSchema>

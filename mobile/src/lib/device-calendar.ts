/**
 * Device-calendar sync for the Calendar module (plan.md Phase 4).
 *
 * Device-first sync via expo-calendar (iOS EventKit / Android Calendar
 * Provider): reads the user's existing device calendars (iCloud, Google, …)
 * and imports their events into an app calendar through the backend's
 * .ics import endpoint. The backend dedupes on the ICS UID (stored as
 * events.external_id per calendar), so re-running a sync only inserts
 * events it hasn't seen yet — no OAuth provider sync needed.
 *
 * One-way (device → app) for now; writing app events back to the device
 * is deferred (see dev_log.md).
 */
import { Platform } from "react-native"
import * as ExpoCalendar from "expo-calendar"

import { importIcs } from "./calendar-api"
import type { ImportIcsResponse } from "./schemas/calendar.schemas"

export interface DeviceCalendar {
  id: string
  title: string
  color: string | null
  /** e.g. "iCloud", "Google", "Local" */
  source: string | null
}

export interface DeviceEvent {
  /** Stable device identifier — becomes the ICS UID / events.external_id. */
  id: string
  title: string
  notes: string | null
  location: string | null
  start: Date
  end: Date
  allDay: boolean
  /** RFC 5545 RRULE string derived from the device recurrence rule, or null. */
  rrule: string | null
}

/** Device calendars exist only on native — Expo web has no EventKit/Provider. */
export function isDeviceCalendarAvailable(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android"
}

/** Ask for read access to device calendars. Returns true when granted. */
export async function requestDeviceCalendarAccess(): Promise<boolean> {
  if (!isDeviceCalendarAvailable()) return false
  const { status } = await ExpoCalendar.requestCalendarPermissionsAsync()
  return status === "granted"
}

/** List the user's device calendars (assumes permission was granted). */
export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  if (!isDeviceCalendarAvailable()) return []
  const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT)
  return calendars.map((c) => ({
    id: c.id,
    title: c.title,
    color: c.color ?? null,
    source: typeof c.source === "object" && c.source ? (c.source.name ?? null) : null,
  }))
}

/** Map an expo-calendar recurrence rule to a minimal RRULE string. */
function toRrule(rule: ExpoCalendar.RecurrenceRule | null | undefined): string | null {
  if (!rule?.frequency) return null
  const freq = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" }[
    String(rule.frequency).toLowerCase() as "daily" | "weekly" | "monthly" | "yearly"
  ]
  if (!freq) return null
  const parts = [`FREQ=${freq}`]
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  return parts.join(";")
}

/** Read events from the given device calendars within a datetime window. */
export async function getDeviceEvents(
  calendarIds: string[],
  start: Date,
  end: Date,
): Promise<DeviceEvent[]> {
  if (!isDeviceCalendarAvailable() || calendarIds.length === 0) return []
  const events = await ExpoCalendar.getEventsAsync(calendarIds, start, end)
  return events
    .filter((e) => e.title && e.startDate && e.endDate)
    .map((e) => ({
      id: String(e.id),
      title: e.title,
      notes: e.notes ?? null,
      location: e.location ?? null,
      start: new Date(e.startDate as string | Date),
      end: new Date(e.endDate as string | Date),
      allDay: !!e.allDay,
      rrule: toRrule(e.recurrenceRule),
    }))
}

// ---------------------------------------------------------------------------
// ICS assembly (mirrors backend/src/services/ics.ts export subset)
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

function toIcsDateTime(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function toIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

/** Escape per RFC 5545 §3.3.11 (TEXT). */
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

/** Build a VCALENDAR payload from device events for the backend importer. */
export function buildIcsFromDeviceEvents(calendarName: string, events: DeviceEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//superapp//device-sync//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]
  const now = toIcsDateTime(new Date())
  for (const ev of events) {
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:device-${escapeText(ev.id)}`)
    lines.push(`DTSTAMP:${now}`)
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.start)}`)
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(ev.end)}`)
    } else {
      lines.push(`DTSTART:${toIcsDateTime(ev.start)}`)
      lines.push(`DTEND:${toIcsDateTime(ev.end)}`)
    }
    lines.push(`SUMMARY:${escapeText(ev.title)}`)
    if (ev.notes) lines.push(`DESCRIPTION:${escapeText(ev.notes)}`)
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`)
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n") + "\r\n"
}

/** Default sync window: 30 days back, 90 days ahead. */
export const SYNC_PAST_DAYS = 30
export const SYNC_FUTURE_DAYS = 90

/**
 * Import a device calendar's events into an app calendar.
 * Idempotent — the backend skips UIDs it has already imported.
 */
export async function syncDeviceCalendar(
  deviceCalendarId: string,
  targetCalendarId: string,
  options?: { pastDays?: number; futureDays?: number },
): Promise<ImportIcsResponse & { fetched: number }> {
  const past = options?.pastDays ?? SYNC_PAST_DAYS
  const future = options?.futureDays ?? SYNC_FUTURE_DAYS
  const start = new Date()
  start.setDate(start.getDate() - past)
  const end = new Date()
  end.setDate(end.getDate() + future)

  const events = await getDeviceEvents([deviceCalendarId], start, end)
  if (events.length === 0) return { imported: 0, skipped: 0, fetched: 0 }

  const ics = buildIcsFromDeviceEvents("Device import", events)
  const result = await importIcs({ calendarId: targetCalendarId, ics })
  return { ...result, fetched: events.length }
}

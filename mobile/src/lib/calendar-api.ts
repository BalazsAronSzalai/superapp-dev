// Typed API calls for the Calendar module (backend: /api/calendar/*).
import { api } from "./api"
import type {
  Calendar,
  CalendarEvent,
  CalendarsResponse,
  CreateCalendarInput,
  CreateEventInput,
  EventDetailResponse,
  EventsRangeResponse,
  ImportIcsInput,
  ImportIcsResponse,
  PatchCalendarInput,
  PatchEventInput,
} from "./schemas/calendar.schemas"

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export async function listCalendars() {
  return api<CalendarsResponse>("/api/calendar/calendars")
}

export async function createCalendar(input: CreateCalendarInput) {
  return api<{ calendar: Calendar }>("/api/calendar/calendars", { method: "POST", body: input })
}

export async function patchCalendar(id: string, input: PatchCalendarInput) {
  return api<{ calendar: Calendar }>(`/api/calendar/calendars/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteCalendar(id: string) {
  return api<void>(`/api/calendar/calendars/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventsRangeParams {
  /** ISO datetime range (inclusive window). */
  start: string
  end: string
  /** Restrict to a single calendar. */
  calendarId?: string
  /** Overlay tasks with due/scheduled dates (superapp integration). */
  includeTasks?: boolean
}

export async function listEvents(params: EventsRangeParams) {
  const qs = new URLSearchParams({ start: params.start, end: params.end })
  if (params.calendarId) qs.set("calendarId", params.calendarId)
  if (params.includeTasks) qs.set("includeTasks", "true")
  return api<EventsRangeResponse>(`/api/calendar/events?${qs.toString()}`)
}

export async function createEvent(input: CreateEventInput) {
  return api<{ event: CalendarEvent }>("/api/calendar/events", { method: "POST", body: input })
}

export async function getEvent(id: string) {
  return api<EventDetailResponse>(`/api/calendar/events/${id}`)
}

export async function patchEvent(id: string, input: PatchEventInput) {
  return api<{ event: CalendarEvent }>(`/api/calendar/events/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteEvent(id: string) {
  return api<void>(`/api/calendar/events/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Search + .ics import
// ---------------------------------------------------------------------------

export async function searchEvents(q: string) {
  return api<{ events: CalendarEvent[] }>(
    `/api/calendar/search?q=${encodeURIComponent(q)}`,
  )
}

export async function importIcs(input: ImportIcsInput) {
  return api<ImportIcsResponse>("/api/calendar/import", { method: "POST", body: input })
}

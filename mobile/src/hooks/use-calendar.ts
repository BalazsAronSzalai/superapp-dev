// TanStack Query 5 hooks for the Calendar module.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as calendarApi from "@/lib/calendar-api"
import type { EventsRangeParams } from "@/lib/calendar-api"
import type {
  CreateCalendarInput,
  CreateEventInput,
  ImportIcsInput,
  PatchCalendarInput,
  PatchEventInput,
} from "@/lib/schemas/calendar.schemas"

export const calendarKeys = {
  all: ["calendar"] as const,
  calendars: () => [...calendarKeys.all, "calendars"] as const,
  events: () => [...calendarKeys.all, "events"] as const,
  range: (params: EventsRangeParams) =>
    [
      ...calendarKeys.events(),
      "range",
      params.start,
      params.end,
      params.calendarId ?? "all",
      params.includeTasks ? "with-tasks" : "events-only",
    ] as const,
  detail: (id: string) => [...calendarKeys.events(), "detail", id] as const,
  search: (q: string) => [...calendarKeys.all, "search", q] as const,
}

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export function useCalendars() {
  return useQuery({
    queryKey: calendarKeys.calendars(),
    queryFn: calendarApi.listCalendars,
    select: (d) => d.calendars,
  })
}

export function useCreateCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCalendarInput) => calendarApi.createCalendar(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.calendars() })
    },
  })
}

export function usePatchCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchCalendarInput }) =>
      calendarApi.patchCalendar(id, input),
    onSuccess: () => {
      // Color/name changes affect event rendering everywhere.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

export function useDeleteCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => calendarApi.deleteCalendar(id),
    onSuccess: () => {
      // Events cascade with the calendar — refresh everything.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function useEventsRange(params: EventsRangeParams | null) {
  return useQuery({
    queryKey: params ? calendarKeys.range(params) : [...calendarKeys.events(), "disabled"],
    queryFn: () => calendarApi.listEvents(params!),
    enabled: !!params,
  })
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: calendarKeys.detail(id ?? ""),
    queryFn: () => calendarApi.getEvent(id!),
    select: (d) => d.event,
    enabled: !!id,
  })
}

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEventInput) => calendarApi.createEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

export function usePatchEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchEventInput }) =>
      calendarApi.patchEvent(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => calendarApi.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Search + import
// ---------------------------------------------------------------------------

export function useSearchEvents(q: string) {
  return useQuery({
    queryKey: calendarKeys.search(q),
    queryFn: () => calendarApi.searchEvents(q),
    select: (d) => d.events,
    enabled: q.length >= 2,
  })
}

export function useImportIcs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ImportIcsInput) => calendarApi.importIcs(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

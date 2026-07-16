import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import {
  createCalendarSchema,
  patchCalendarSchema,
  createEventSchema,
  patchEventSchema,
  importIcsSchema,
} from "../shared/calendar.schemas.js"
import {
  listCalendars,
  createCalendar,
  patchCalendar,
  deleteCalendar,
  listEvents,
  createEvent,
  getEvent,
  patchEvent,
  deleteEvent,
  searchEvents,
  exportCalendarIcs,
  importIcs,
} from "../controllers/calendar.controller.js"

export const calendarRouter = Router()

calendarRouter.use(requireAuth)

// Calendars (static segments before /events/:id).
calendarRouter.get("/calendars", listCalendars)
calendarRouter.post("/calendars", validateBody(createCalendarSchema), createCalendar)
calendarRouter.patch("/calendars/:id", validateBody(patchCalendarSchema), patchCalendar)
calendarRouter.delete("/calendars/:id", deleteCalendar)
calendarRouter.get("/calendars/:id/export.ics", exportCalendarIcs)

// Search + .ics import.
calendarRouter.get("/search", searchEvents)
calendarRouter.post("/import", validateBody(importIcsSchema), importIcs)

// Events.
calendarRouter.get("/events", listEvents)
calendarRouter.post("/events", validateBody(createEventSchema), createEvent)
calendarRouter.get("/events/:id", getEvent)
calendarRouter.patch("/events/:id", validateBody(patchEventSchema), patchEvent)
calendarRouter.delete("/events/:id", deleteEvent)

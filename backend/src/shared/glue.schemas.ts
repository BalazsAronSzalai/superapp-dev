// Shared Zod 4 schemas for the superapp glue layer (Phase 7):
// universal search, cross-module entity links, Today aggregate.
// Hand-copied to mobile/src/lib/schemas/glue.schemas.ts — keep both in sync
// (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

export const ENTITY_LINK_TYPES = [
  "email",
  "thread",
  "task",
  "event",
  "note",
  "transaction",
  "budget",
] as const
export type EntityLinkType = (typeof ENTITY_LINK_TYPES)[number]

export const SEARCH_TYPES = ["mail", "tasks", "events", "notes", "transactions"] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createLinkSchema = z.object({
  id: z.uuid().optional(),
  sourceType: z.enum(ENTITY_LINK_TYPES),
  sourceId: z.uuid(),
  targetType: z.enum(ENTITY_LINK_TYPES),
  targetId: z.uuid(),
})

export const emailToTaskSchema = z.object({
  threadId: z.uuid(),
  listId: z.uuid().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const searchResultItemSchema = z.object({
  id: z.uuid(),
  /** Entity link type of this result (thread/task/event/note/transaction). */
  entityType: z.enum(ENTITY_LINK_TYPES),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** ISO date most relevant to the row (last message / due / start / updated). */
  date: z.string().nullable(),
})

export const searchResponseSchema = z.object({
  mail: z.array(searchResultItemSchema),
  tasks: z.array(searchResultItemSchema),
  events: z.array(searchResultItemSchema),
  notes: z.array(searchResultItemSchema),
  transactions: z.array(searchResultItemSchema),
})

export const linkedEntitySchema = z.object({
  type: z.enum(ENTITY_LINK_TYPES),
  id: z.uuid(),
  title: z.string(),
})

export const entityLinkSchema = z.object({
  id: z.uuid(),
  sourceType: z.enum(ENTITY_LINK_TYPES),
  sourceId: z.uuid(),
  targetType: z.enum(ENTITY_LINK_TYPES),
  targetId: z.uuid(),
  /** The entity on the far side, relative to the queried entity. */
  other: linkedEntitySchema,
  createdAt: z.string(),
})

export const linksResponseSchema = z.object({
  links: z.array(entityLinkSchema),
})

export const todayEventSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  calendarColor: z.string().nullable(),
})

export const todayTaskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  dueDate: z.string().nullable(),
  priority: z.number(),
  isOverdue: z.boolean(),
})

export const todayMailThreadSchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  snippet: z.string(),
  lastMessageAt: z.string().nullable(),
})

export const todayBudgetSchema = z.object({
  id: z.uuid(),
  category: z.string(),
  monthlyLimit: z.number(),
  spent: z.number(),
  currency: z.string(),
})

export const todayResponseSchema = z.object({
  date: z.string(),
  events: z.array(todayEventSchema),
  tasks: z.array(todayTaskSchema),
  unreadCount: z.number(),
  unreadThreads: z.array(todayMailThreadSchema),
  monthSpend: z.number(),
  budgets: z.array(todayBudgetSchema),
})

export type CreateLinkInput = z.infer<typeof createLinkSchema>
export type EmailToTaskInput = z.infer<typeof emailToTaskSchema>
export type SearchResultItem = z.infer<typeof searchResultItemSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>
export type LinkedEntity = z.infer<typeof linkedEntitySchema>
export type EntityLink = z.infer<typeof entityLinkSchema>
export type LinksResponse = z.infer<typeof linksResponseSchema>
export type TodayEvent = z.infer<typeof todayEventSchema>
export type TodayTask = z.infer<typeof todayTaskSchema>
export type TodayMailThread = z.infer<typeof todayMailThreadSchema>
export type TodayBudget = z.infer<typeof todayBudgetSchema>
export type TodayResponse = z.infer<typeof todayResponseSchema>

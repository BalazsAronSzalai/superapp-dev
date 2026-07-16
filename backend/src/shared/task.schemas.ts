// Shared Zod 4 schemas for the To-Do module.
// Hand-copied to mobile/src/lib/schemas/task.schemas.ts — keep both in sync
// (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

/** Things 3-style views (plan.md Phase 3). */
export const TASK_VIEWS = ["today", "upcoming", "anytime", "someday", "logbook"] as const
export type TaskView = (typeof TASK_VIEWS)[number]

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createTaskListSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  name: z.string().min(1).max(120),
  color: z.string().max(32).optional(),
  sortOrder: z.number().int().default(0),
})

export const patchTaskListSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    color: z.string().max(32).nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

export const createTaskSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  listId: z.uuid().nullable().optional(),
  parentTaskId: z.uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  dueDate: z.iso.datetime().nullable().optional(),
  scheduledDate: z.iso.datetime().nullable().optional(),
  /** 0 = none, 1 = low, 2 = medium, 3 = high. */
  priority: z.number().int().min(0).max(3).default(0),
  /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE". */
  rrule: z.string().max(500).nullable().optional(),
  isSomeday: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
  sortOrder: z.number().int().default(0),
})

export const patchTaskSchema = z
  .object({
    listId: z.uuid().nullable().optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10_000).nullable().optional(),
    dueDate: z.iso.datetime().nullable().optional(),
    scheduledDate: z.iso.datetime().nullable().optional(),
    priority: z.number().int().min(0).max(3).optional(),
    rrule: z.string().max(500).nullable().optional(),
    isSomeday: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(60)).max(20).optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const taskListSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number(),
  /** Open (incomplete, top-level) task count for badges. */
  taskCount: z.number().optional(),
})

export const taskSchema = z.object({
  id: z.uuid(),
  listId: z.uuid().nullable(),
  parentTaskId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  scheduledDate: z.string().nullable(),
  priority: z.number(),
  rrule: z.string().nullable(),
  isSomeday: z.boolean(),
  tags: z.array(z.string()),
  isCompleted: z.boolean(),
  completedAt: z.string().nullable(),
  sortOrder: z.number(),
  updatedAt: z.string(),
  /** Subtask progress for list rows (top-level tasks only). */
  subtaskCount: z.number().optional(),
  completedSubtaskCount: z.number().optional(),
})

export const taskListsResponseSchema = z.object({
  lists: z.array(taskListSchema),
})

export const tasksResponseSchema = z.object({
  tasks: z.array(taskSchema),
})

export const taskDetailResponseSchema = z.object({
  task: taskSchema,
  subtasks: z.array(taskSchema),
})

export const taskCountsResponseSchema = z.object({
  today: z.number(),
})

export type CreateTaskListInput = z.infer<typeof createTaskListSchema>
export type PatchTaskListInput = z.infer<typeof patchTaskListSchema>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type PatchTaskInput = z.infer<typeof patchTaskSchema>
export type TaskList = z.infer<typeof taskListSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskListsResponse = z.infer<typeof taskListsResponseSchema>
export type TasksResponse = z.infer<typeof tasksResponseSchema>
export type TaskDetailResponse = z.infer<typeof taskDetailResponseSchema>
export type TaskCountsResponse = z.infer<typeof taskCountsResponseSchema>

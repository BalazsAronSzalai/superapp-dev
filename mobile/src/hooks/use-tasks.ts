// TanStack Query 5 hooks for the To-Do module.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as tasksApi from "@/lib/tasks-api"
import type {
  CreateTaskInput,
  CreateTaskListInput,
  PatchTaskInput,
  PatchTaskListInput,
  Task,
  TasksResponse,
  TaskView,
} from "@/lib/schemas/task.schemas"

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "lists"] as const,
  view: (view: TaskView) => [...taskKeys.all, "view", view] as const,
  byList: (listId: string) => [...taskKeys.all, "by-list", listId] as const,
  detail: (id: string) => [...taskKeys.all, "detail", id] as const,
  counts: () => [...taskKeys.all, "counts"] as const,
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export function useTaskLists() {
  return useQuery({
    queryKey: taskKeys.lists(),
    queryFn: tasksApi.listTaskLists,
    select: (d) => d.lists,
  })
}

export function useCreateTaskList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskListInput) => tasksApi.createTaskList(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function usePatchTaskList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTaskListInput }) =>
      tasksApi.patchTaskList(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useDeleteTaskList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.deleteTaskList(id),
    onSuccess: () => {
      // Deleting a list re-homes its tasks (listId -> null), so refresh everything.
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Task queries
// ---------------------------------------------------------------------------

export function useTasksByView(view: TaskView, enabled = true) {
  return useQuery({
    queryKey: taskKeys.view(view),
    queryFn: () => tasksApi.listTasksByView(view),
    select: (d) => d.tasks,
    enabled,
  })
}

export function useTasksByList(listId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.byList(listId ?? ""),
    queryFn: () => tasksApi.listTasksByList(listId!),
    select: (d) => d.tasks,
    enabled: !!listId,
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? ""),
    queryFn: () => tasksApi.getTask(id!),
    enabled: !!id,
  })
}

export function useTaskCounts(enabled = true) {
  return useQuery({
    queryKey: taskKeys.counts(),
    queryFn: tasksApi.getTaskCounts,
    select: (d) => d.today,
    refetchInterval: 60_000,
    enabled,
  })
}

// ---------------------------------------------------------------------------
// Task mutations
// ---------------------------------------------------------------------------

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function usePatchTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTaskInput }) =>
      tasksApi.patchTask(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

/** Optimistically mark a task complete/incomplete inside a cached view list. */
function setCompletedInView(
  data: TasksResponse | undefined,
  taskId: string,
  isCompleted: boolean,
): TasksResponse | undefined {
  if (!data) return data
  return {
    ...data,
    tasks: data.tasks.map((t): Task => (t.id === taskId ? { ...t, isCompleted } : t)),
  }
}

/**
 * Complete with optimistic toggle in the active view. The row is kept in
 * place (checked) until invalidation settles, mirroring Things' short
 * "linger" before the task moves to the Logbook.
 */
export function useCompleteTask(activeKey: readonly unknown[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.completeTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: activeKey })
      const previous = queryClient.getQueryData<TasksResponse>(activeKey)
      queryClient.setQueryData<TasksResponse>(activeKey, (old) =>
        setCompletedInView(old, id, true),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(activeKey, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useUncompleteTask(activeKey: readonly unknown[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.uncompleteTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: activeKey })
      const previous = queryClient.getQueryData<TasksResponse>(activeKey)
      queryClient.setQueryData<TasksResponse>(activeKey, (old) =>
        setCompletedInView(old, id, false),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(activeKey, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

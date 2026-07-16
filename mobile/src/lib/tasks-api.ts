// Typed API calls for the To-Do module (backend: /api/tasks/*).
import { api } from "./api"
import type {
  CreateTaskInput,
  CreateTaskListInput,
  PatchTaskInput,
  PatchTaskListInput,
  Task,
  TaskCountsResponse,
  TaskDetailResponse,
  TaskList,
  TaskListsResponse,
  TasksResponse,
  TaskView,
} from "./schemas/task.schemas"

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function listTaskLists() {
  return api<TaskListsResponse>("/api/tasks/lists")
}

export async function createTaskList(input: CreateTaskListInput) {
  return api<{ list: TaskList }>("/api/tasks/lists", { method: "POST", body: input })
}

export async function patchTaskList(id: string, input: PatchTaskListInput) {
  return api<{ list: TaskList }>(`/api/tasks/lists/${id}`, { method: "PATCH", body: input })
}

export async function deleteTaskList(id: string) {
  return api<void>(`/api/tasks/lists/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasksByView(view: TaskView) {
  return api<TasksResponse>(`/api/tasks?view=${view}`)
}

export async function listTasksByList(listId: string) {
  return api<TasksResponse>(`/api/tasks?listId=${encodeURIComponent(listId)}`)
}

export async function getTaskCounts() {
  return api<TaskCountsResponse>("/api/tasks/counts")
}

export async function createTask(input: CreateTaskInput) {
  return api<{ task: Task }>("/api/tasks", { method: "POST", body: input })
}

export async function getTask(id: string) {
  return api<TaskDetailResponse>(`/api/tasks/${id}`)
}

export async function patchTask(id: string, input: PatchTaskInput) {
  return api<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", body: input })
}

export async function deleteTask(id: string) {
  return api<void>(`/api/tasks/${id}`, { method: "DELETE" })
}

export async function completeTask(id: string) {
  return api<{ task: Task; nextTask: Task | null }>(`/api/tasks/${id}/complete`, {
    method: "POST",
  })
}

export async function uncompleteTask(id: string) {
  return api<{ task: Task }>(`/api/tasks/${id}/uncomplete`, { method: "POST" })
}

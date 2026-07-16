// Typed API calls for the superapp glue layer (backend: /api/search, /api/links, /api/today).
import { api } from "./api"
import type {
  CreateLinkInput,
  EmailToTaskInput,
  EntityLink,
  EntityLinkType,
  LinksResponse,
  SearchResponse,
  SearchType,
  TodayResponse,
} from "./schemas/glue.schemas"
import type { Task } from "./schemas/task.schemas"

// ---------------------------------------------------------------------------
// Universal search
// ---------------------------------------------------------------------------

export async function universalSearch(q: string, types?: SearchType[], limit = 10) {
  const params = new URLSearchParams({ q, limit: String(limit) })
  if (types && types.length > 0) params.set("types", types.join(","))
  return api<SearchResponse>(`/api/search?${params.toString()}`)
}

// ---------------------------------------------------------------------------
// Cross-module links
// ---------------------------------------------------------------------------

export async function listLinks(type: EntityLinkType, id: string) {
  const params = new URLSearchParams({ type, id })
  return api<LinksResponse>(`/api/links?${params.toString()}`)
}

export async function createLink(input: CreateLinkInput) {
  return api<{ link: EntityLink }>("/api/links", { method: "POST", body: input })
}

export async function deleteLink(id: string) {
  return api<void>(`/api/links/${id}`, { method: "DELETE" })
}

export async function emailToTask(input: EmailToTaskInput) {
  return api<{ task: Task; link: EntityLink | null }>("/api/links/email-to-task", {
    method: "POST",
    body: input,
  })
}

// ---------------------------------------------------------------------------
// Today dashboard
// ---------------------------------------------------------------------------

export async function getToday(tz: string, date?: string) {
  const params = new URLSearchParams({ tz })
  if (date) params.set("date", date)
  return api<TodayResponse>(`/api/today?${params.toString()}`)
}

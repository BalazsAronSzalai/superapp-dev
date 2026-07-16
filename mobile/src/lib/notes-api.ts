// Typed API calls for the Notes module (backend: /api/notes/*).
import { api } from "./api"
import type {
  CreateNoteInput,
  CreateNotebookInput,
  NoteDetailResponse,
  NoteTagsResponse,
  NoteVersionDetailResponse,
  NoteVersionsResponse,
  Notebook,
  NotebooksResponse,
  NotesResponse,
  PatchNoteInput,
  PatchNotebookInput,
} from "./schemas/note.schemas"

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export async function listNotebooks() {
  return api<NotebooksResponse>("/api/notes/notebooks")
}

export async function createNotebook(input: CreateNotebookInput) {
  return api<{ notebook: Notebook }>("/api/notes/notebooks", { method: "POST", body: input })
}

export async function patchNotebook(id: string, input: PatchNotebookInput) {
  return api<{ notebook: Notebook }>(`/api/notes/notebooks/${id}`, {
    method: "PATCH",
    body: input,
  })
}

export async function deleteNotebook(id: string) {
  return api<void>(`/api/notes/notebooks/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export interface ListNotesParams {
  /** Restrict to a single notebook. */
  notebookId?: string
  /** Restrict to notes carrying this tag. */
  tag?: string
}

export async function listNotes(params: ListNotesParams = {}) {
  const qs = new URLSearchParams()
  if (params.notebookId) qs.set("notebookId", params.notebookId)
  if (params.tag) qs.set("tag", params.tag)
  const query = qs.toString()
  return api<NotesResponse>(`/api/notes${query ? `?${query}` : ""}`)
}

export async function createNote(input: CreateNoteInput) {
  return api<NoteDetailResponse>("/api/notes", { method: "POST", body: input })
}

export async function getNote(id: string) {
  return api<NoteDetailResponse>(`/api/notes/${id}`)
}

export async function patchNote(id: string, input: PatchNoteInput) {
  return api<NoteDetailResponse>(`/api/notes/${id}`, { method: "PATCH", body: input })
}

export async function deleteNote(id: string) {
  return api<void>(`/api/notes/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Search + tags
// ---------------------------------------------------------------------------

export async function searchNotes(q: string) {
  return api<NotesResponse>(`/api/notes/search?q=${encodeURIComponent(q)}`)
}

export async function listTags() {
  return api<NoteTagsResponse>("/api/notes/tags")
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

export async function listNoteVersions(id: string) {
  return api<NoteVersionsResponse>(`/api/notes/${id}/versions`)
}

export async function getNoteVersion(id: string, version: number) {
  return api<NoteVersionDetailResponse>(`/api/notes/${id}/versions/${version}`)
}

export async function restoreNoteVersion(id: string, version: number) {
  return api<NoteDetailResponse>(`/api/notes/${id}/versions/${version}/restore`, {
    method: "POST",
  })
}

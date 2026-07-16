// TanStack Query 5 hooks for the Notes module.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as notesApi from "@/lib/notes-api"
import type { ListNotesParams } from "@/lib/notes-api"
import type {
  CreateNoteInput,
  CreateNotebookInput,
  Note,
  PatchNoteInput,
  PatchNotebookInput,
} from "@/lib/schemas/note.schemas"

export const noteKeys = {
  all: ["notes"] as const,
  notebooks: () => [...noteKeys.all, "notebooks"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (params: ListNotesParams) =>
    [...noteKeys.lists(), params.notebookId ?? "all", params.tag ?? "any"] as const,
  detail: (id: string) => [...noteKeys.all, "detail", id] as const,
  search: (q: string) => [...noteKeys.all, "search", q] as const,
  tags: () => [...noteKeys.all, "tags"] as const,
  versions: (id: string) => [...noteKeys.all, "versions", id] as const,
  version: (id: string, version: number) =>
    [...noteKeys.versions(id), version] as const,
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export function useNotebooks() {
  return useQuery({
    queryKey: noteKeys.notebooks(),
    queryFn: notesApi.listNotebooks,
    select: (d) => d.notebooks,
  })
}

export function useCreateNotebook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNotebookInput) => notesApi.createNotebook(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.notebooks() })
    },
  })
}

export function usePatchNotebook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchNotebookInput }) =>
      notesApi.patchNotebook(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.notebooks() })
    },
  })
}

export function useDeleteNotebook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notesApi.deleteNotebook(id),
    onSuccess: () => {
      // Notes fall back to "All Notes" (SET NULL) — refresh everything.
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function useNotes(params: ListNotesParams = {}) {
  return useQuery({
    queryKey: noteKeys.list(params),
    queryFn: () => notesApi.listNotes(params),
    select: (d) => d.notes,
  })
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: noteKeys.detail(id ?? ""),
    queryFn: () => notesApi.getNote(id!),
    select: (d) => d.note,
    enabled: !!id,
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNoteInput) => notesApi.createNote(input),
    onSuccess: (data) => {
      queryClient.setQueryData(noteKeys.detail(data.note.id), data)
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

export function usePatchNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchNoteInput }) =>
      notesApi.patchNote(id, input),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(noteKeys.detail(id), data)
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() })
      queryClient.invalidateQueries({ queryKey: noteKeys.notebooks() })
      queryClient.invalidateQueries({ queryKey: noteKeys.tags() })
      queryClient.invalidateQueries({ queryKey: noteKeys.versions(id) })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notesApi.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Search + tags
// ---------------------------------------------------------------------------

export function useSearchNotes(q: string) {
  return useQuery({
    queryKey: noteKeys.search(q),
    queryFn: () => notesApi.searchNotes(q),
    select: (d) => d.notes,
    enabled: q.trim().length >= 2,
  })
}

export function useNoteTags() {
  return useQuery({
    queryKey: noteKeys.tags(),
    queryFn: notesApi.listTags,
    select: (d) => d.tags,
  })
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

export function useNoteVersions(id: string | undefined) {
  return useQuery({
    queryKey: noteKeys.versions(id ?? ""),
    queryFn: () => notesApi.listNoteVersions(id!),
    select: (d) => d.versions,
    enabled: !!id,
  })
}

export function useNoteVersion(id: string | undefined, version: number | undefined) {
  return useQuery({
    queryKey: noteKeys.version(id ?? "", version ?? 0),
    queryFn: () => notesApi.getNoteVersion(id!, version!),
    select: (d) => d.version,
    enabled: !!id && !!version,
  })
}

export function useRestoreNoteVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      notesApi.restoreNoteVersion(id, version),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData<{ note: Note }>(noteKeys.detail(id), data)
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

// Shared Zod 4 schemas for the Notes module (plan.md Phase 5).
// Hand-copied from backend/src/shared/note.schemas.ts — keep both in sync
// (see plan.md §0.1 "Type sharing without a monorepo").
import { z } from "zod"

// ---------------------------------------------------------------------------
// Note content document
//
// Block-based rich content stored in notes.content_json. The shape is a
// flattened ProseMirror-style doc: { type: "doc", content: Block[] }.
// v1 supports block-level formatting (headings, bullets, checklists);
// inline marks (bold/italic) are deferred to the 10tap/TipTap editor
// evaluation flagged in plan.md Phase 5.
// ---------------------------------------------------------------------------

export const NOTE_BLOCK_TYPES = ["paragraph", "heading", "bullet", "checklist"] as const
export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number]

export const noteBlockSchema = z.object({
  /** Client-generated stable block id (uuid or nanoid-style). */
  id: z.string().min(1).max(64),
  type: z.enum(NOTE_BLOCK_TYPES),
  text: z.string().max(20_000).default(""),
  /** Heading level (1–2). Only meaningful for type "heading". */
  level: z.number().int().min(1).max(2).optional(),
  /** Checked state. Only meaningful for type "checklist". */
  checked: z.boolean().optional(),
  /** Linked To-Do task id (superapp integration: checklist → Tasks module). */
  taskId: z.uuid().nullable().optional(),
})

export const noteDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(noteBlockSchema).max(2_000).default([]),
})

export type NoteBlock = z.infer<typeof noteBlockSchema>
export type NoteDoc = z.infer<typeof noteDocSchema>

export const EMPTY_NOTE_DOC: NoteDoc = { type: "doc", content: [] }

/** Plain-text extraction — used server-side for search + snippets. */
export function extractNoteText(doc: NoteDoc): string {
  return doc.content
    .map((b) => b.text.trim())
    .filter((t) => t.length > 0)
    .join("\n")
}

// ---------------------------------------------------------------------------
// Requests — notebooks
// ---------------------------------------------------------------------------

export const createNotebookSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().default(0),
})

export const patchNotebookSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })

// ---------------------------------------------------------------------------
// Requests — notes
// ---------------------------------------------------------------------------

export const createNoteSchema = z.object({
  /** Client-generated UUID (offline-first sync, plan.md §0.3). */
  id: z.uuid().optional(),
  notebookId: z.uuid().nullable().optional(),
  title: z.string().max(500).default(""),
  content: noteDocSchema.default(EMPTY_NOTE_DOC),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
  isPinned: z.boolean().default(false),
})

export const patchNoteSchema = z
  .object({
    notebookId: z.uuid().nullable().optional(),
    title: z.string().max(500).optional(),
    content: noteDocSchema.optional(),
    tags: z.array(z.string().min(1).max(60)).max(20).optional(),
    isPinned: z.boolean().optional(),
    /**
     * Optimistic-concurrency guard (last-write-wins with conflict detection,
     * plan.md Phase 5): when provided and it does not match the server's
     * current version, the server responds 409 with the current note.
     */
    baseVersion: z.number().int().min(1).optional(),
  })
  .refine(
    (v) =>
      Object.entries(v).some(([key, value]) => key !== "baseVersion" && value !== undefined),
    { message: "At least one field is required" },
  )

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const notebookSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number(),
  /** Note count for badges. */
  noteCount: z.number().optional(),
})

/** Compact list-row shape (no content payload). */
export const noteSummarySchema = z.object({
  id: z.uuid(),
  notebookId: z.uuid().nullable(),
  title: z.string(),
  /** First ~160 chars of plain text for list previews. */
  snippet: z.string(),
  tags: z.array(z.string()),
  isPinned: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const noteSchema = noteSummarySchema.extend({
  content: noteDocSchema,
})

export const noteVersionMetaSchema = z.object({
  version: z.number(),
  title: z.string(),
  createdAt: z.string(),
})

export const noteVersionSchema = noteVersionMetaSchema.extend({
  content: noteDocSchema,
})

export const notebooksResponseSchema = z.object({
  notebooks: z.array(notebookSchema),
})

export const notesResponseSchema = z.object({
  notes: z.array(noteSummarySchema),
})

export const noteDetailResponseSchema = z.object({
  note: noteSchema,
})

export const noteTagsResponseSchema = z.object({
  tags: z.array(z.string()),
})

export const noteVersionsResponseSchema = z.object({
  versions: z.array(noteVersionMetaSchema),
})

export const noteVersionDetailResponseSchema = z.object({
  version: noteVersionSchema,
})

export type CreateNotebookInput = z.infer<typeof createNotebookSchema>
export type PatchNotebookInput = z.infer<typeof patchNotebookSchema>
export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type PatchNoteInput = z.infer<typeof patchNoteSchema>
export type Notebook = z.infer<typeof notebookSchema>
export type NoteSummary = z.infer<typeof noteSummarySchema>
export type Note = z.infer<typeof noteSchema>
export type NoteVersionMeta = z.infer<typeof noteVersionMetaSchema>
export type NoteVersion = z.infer<typeof noteVersionSchema>
export type NotebooksResponse = z.infer<typeof notebooksResponseSchema>
export type NotesResponse = z.infer<typeof notesResponseSchema>
export type NoteDetailResponse = z.infer<typeof noteDetailResponseSchema>
export type NoteTagsResponse = z.infer<typeof noteTagsResponseSchema>
export type NoteVersionsResponse = z.infer<typeof noteVersionsResponseSchema>
export type NoteVersionDetailResponse = z.infer<typeof noteVersionDetailResponseSchema>

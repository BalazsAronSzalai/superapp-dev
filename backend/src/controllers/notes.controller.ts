import type { Request, Response } from "express"
import { and, asc, desc, eq, ilike, lt, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db, schema } from "../db/index.js"
import { HttpError } from "../middleware/errors.js"
import {
  EMPTY_NOTE_DOC,
  extractNoteText,
  noteDocSchema,
  type CreateNoteInput,
  type CreateNotebookInput,
  type Note,
  type NoteDoc,
  type NoteSummary,
  type Notebook,
  type PatchNoteInput,
  type PatchNotebookInput,
} from "../shared/note.schemas.js"

/** Keep at most this many history snapshots per note. */
const MAX_VERSIONS_PER_NOTE = 20

const SNIPPET_LENGTH = 160

/** Express 5 types route params as string | string[]; normalize to string. */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOwnedNotebook(userId: string, notebookId: string) {
  const [notebook] = await db
    .select()
    .from(schema.notebooks)
    .where(and(eq(schema.notebooks.id, notebookId), eq(schema.notebooks.userId, userId)))
    .limit(1)
  if (!notebook) throw new HttpError(404, "Notebook not found")
  return notebook
}

async function getOwnedNote(userId: string, noteId: string) {
  const [note] = await db
    .select()
    .from(schema.notes)
    .where(and(eq(schema.notes.id, noteId), eq(schema.notes.userId, userId)))
    .limit(1)
  if (!note) throw new HttpError(404, "Note not found")
  return note
}

function toNotebookDto(
  row: typeof schema.notebooks.$inferSelect,
  noteCount?: number,
): Notebook {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    noteCount,
  }
}

function snippetOf(contentText: string): string {
  return contentText.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LENGTH)
}

function toSummaryDto(row: typeof schema.notes.$inferSelect): NoteSummary {
  return {
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    snippet: snippetOf(row.contentText),
    tags: (row.tagsJson as string[]) ?? [],
    isPinned: row.isPinned,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Parse stored content_json defensively (legacy rows may hold `{}`). */
function parseDoc(value: unknown): NoteDoc {
  const parsed = noteDocSchema.safeParse(value)
  return parsed.success ? parsed.data : EMPTY_NOTE_DOC
}

function toNoteDto(row: typeof schema.notes.$inferSelect): Note {
  return {
    ...toSummaryDto(row),
    content: parseDoc(row.contentJson),
  }
}

/**
 * Snapshot a note's current state into note_versions and prune history
 * beyond MAX_VERSIONS_PER_NOTE.
 */
async function snapshotVersion(note: typeof schema.notes.$inferSelect) {
  await db
    .insert(schema.noteVersions)
    .values({
      noteId: note.id,
      version: note.version,
      title: note.title,
      contentJson: note.contentJson,
    })
    .onConflictDoNothing()
  await db
    .delete(schema.noteVersions)
    .where(
      and(
        eq(schema.noteVersions.noteId, note.id),
        lt(schema.noteVersions.version, note.version - MAX_VERSIONS_PER_NOTE + 1),
      ),
    )
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export async function listNotebooks(req: Request, res: Response) {
  const notebooks = await db
    .select()
    .from(schema.notebooks)
    .where(eq(schema.notebooks.userId, req.userId!))
    .orderBy(asc(schema.notebooks.sortOrder), asc(schema.notebooks.name))

  const counts = await db
    .select({
      notebookId: schema.notes.notebookId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.notes)
    .where(eq(schema.notes.userId, req.userId!))
    .groupBy(schema.notes.notebookId)
  const countMap = new Map(
    counts.filter((c) => c.notebookId != null).map((c) => [c.notebookId!, c.count]),
  )

  res.json({ notebooks: notebooks.map((n) => toNotebookDto(n, countMap.get(n.id) ?? 0)) })
}

export async function createNotebook(req: Request, res: Response) {
  const input = req.body as CreateNotebookInput
  const [notebook] = await db
    .insert(schema.notebooks)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      name: input.name,
      sortOrder: input.sortOrder,
    })
    .returning()
  if (!notebook) throw new HttpError(500, "Failed to create notebook")
  res.status(201).json({ notebook: toNotebookDto(notebook, 0) })
}

export async function patchNotebook(req: Request, res: Response) {
  const input = req.body as PatchNotebookInput
  const notebook = await getOwnedNotebook(req.userId!, param(req.params.id))

  const set: Partial<typeof schema.notebooks.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) set.name = input.name
  if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder

  const [updated] = await db
    .update(schema.notebooks)
    .set(set)
    .where(eq(schema.notebooks.id, notebook.id))
    .returning()
  res.json({ notebook: toNotebookDto(updated!) })
}

export async function deleteNotebook(req: Request, res: Response) {
  const notebook = await getOwnedNotebook(req.userId!, param(req.params.id))
  // notes.notebook_id has ON DELETE SET NULL — notes fall back to "All Notes".
  await db.delete(schema.notebooks).where(eq(schema.notebooks.id, notebook.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Notes — queries
// ---------------------------------------------------------------------------

export async function listNotes(req: Request, res: Response) {
  const notebookId = req.query.notebookId as string | undefined
  const tag = req.query.tag as string | undefined

  const where = [eq(schema.notes.userId, req.userId!)]
  if (notebookId) {
    await getOwnedNotebook(req.userId!, notebookId)
    where.push(eq(schema.notes.notebookId, notebookId))
  }
  if (tag) {
    where.push(sql`${schema.notes.tagsJson} @> ${JSON.stringify([tag])}::jsonb`)
  }

  const rows = await db
    .select()
    .from(schema.notes)
    .where(and(...where))
    .orderBy(desc(schema.notes.isPinned), desc(schema.notes.updatedAt))
    .limit(500)

  res.json({ notes: rows.map(toSummaryDto) })
}

export async function searchNotes(req: Request, res: Response) {
  const q = ((req.query.q as string | undefined) ?? "").trim()
  if (q.length < 2) throw new HttpError(400, "Query param 'q' must be at least 2 characters")

  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const rows = await db
    .select()
    .from(schema.notes)
    .where(
      and(
        eq(schema.notes.userId, req.userId!),
        or(ilike(schema.notes.title, pattern), ilike(schema.notes.contentText, pattern))!,
      ),
    )
    .orderBy(desc(schema.notes.isPinned), desc(schema.notes.updatedAt))
    .limit(100)

  res.json({ notes: rows.map(toSummaryDto) })
}

export async function listTags(req: Request, res: Response) {
  const rows = await db
    .select({
      tag: sql<string>`distinct jsonb_array_elements_text(${schema.notes.tagsJson})`,
    })
    .from(schema.notes)
    .where(eq(schema.notes.userId, req.userId!))
  res.json({ tags: rows.map((r) => r.tag).sort((a, b) => a.localeCompare(b)) })
}

// ---------------------------------------------------------------------------
// Notes — CRUD
// ---------------------------------------------------------------------------

export async function createNote(req: Request, res: Response) {
  const input = req.body as CreateNoteInput
  if (input.notebookId) await getOwnedNotebook(req.userId!, input.notebookId)

  const [note] = await db
    .insert(schema.notes)
    .values({
      id: input.id ?? randomUUID(),
      userId: req.userId!,
      notebookId: input.notebookId ?? null,
      title: input.title,
      contentJson: input.content,
      contentText: extractNoteText(input.content),
      tagsJson: input.tags,
      isPinned: input.isPinned,
    })
    .returning()
  if (!note) throw new HttpError(500, "Failed to create note")
  res.status(201).json({ note: toNoteDto(note) })
}

export async function getNote(req: Request, res: Response) {
  const note = await getOwnedNote(req.userId!, param(req.params.id))
  res.json({ note: toNoteDto(note) })
}

export async function patchNote(req: Request, res: Response) {
  const input = req.body as PatchNoteInput
  const note = await getOwnedNote(req.userId!, param(req.params.id))

  // Conflict detection (last-write-wins v1, plan.md Phase 5): a stale
  // baseVersion means another device saved first — return the current note.
  if (input.baseVersion !== undefined && input.baseVersion !== note.version) {
    res.status(409).json({ error: "Version conflict", note: toNoteDto(note) })
    return
  }

  if (input.notebookId) await getOwnedNotebook(req.userId!, input.notebookId)

  const contentChanged = input.content !== undefined
  const titleChanged = input.title !== undefined && input.title !== note.title

  // Snapshot the pre-edit state only when user-visible content changes.
  if (contentChanged || titleChanged) {
    await snapshotVersion(note)
  }

  const set: Partial<typeof schema.notes.$inferInsert> = { updatedAt: new Date() }
  if (input.notebookId !== undefined) set.notebookId = input.notebookId
  if (input.title !== undefined) set.title = input.title
  if (input.content !== undefined) {
    set.contentJson = input.content
    set.contentText = extractNoteText(input.content)
  }
  if (input.tags !== undefined) set.tagsJson = input.tags
  if (input.isPinned !== undefined) set.isPinned = input.isPinned
  if (contentChanged || titleChanged) set.version = note.version + 1

  const [updated] = await db
    .update(schema.notes)
    .set(set)
    .where(eq(schema.notes.id, note.id))
    .returning()
  res.json({ note: toNoteDto(updated!) })
}

export async function deleteNote(req: Request, res: Response) {
  const note = await getOwnedNote(req.userId!, param(req.params.id))
  // note_versions has ON DELETE CASCADE.
  await db.delete(schema.notes).where(eq(schema.notes.id, note.id))
  res.status(204).end()
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

export async function listNoteVersions(req: Request, res: Response) {
  const note = await getOwnedNote(req.userId!, param(req.params.id))
  const rows = await db
    .select()
    .from(schema.noteVersions)
    .where(eq(schema.noteVersions.noteId, note.id))
    .orderBy(desc(schema.noteVersions.version))
  res.json({
    versions: rows.map((v) => ({
      version: v.version,
      title: v.title,
      createdAt: v.createdAt.toISOString(),
    })),
  })
}

async function getOwnedVersion(userId: string, noteId: string, versionParam: string) {
  const note = await getOwnedNote(userId, noteId)
  const version = Number.parseInt(versionParam, 10)
  if (!Number.isInteger(version) || version < 1) {
    throw new HttpError(400, "Invalid version number")
  }
  const [row] = await db
    .select()
    .from(schema.noteVersions)
    .where(
      and(eq(schema.noteVersions.noteId, note.id), eq(schema.noteVersions.version, version)),
    )
    .limit(1)
  if (!row) throw new HttpError(404, "Version not found")
  return { note, row }
}

export async function getNoteVersion(req: Request, res: Response) {
  const { row } = await getOwnedVersion(
    req.userId!,
    param(req.params.id),
    param(req.params.version),
  )
  res.json({
    version: {
      version: row.version,
      title: row.title,
      content: parseDoc(row.contentJson),
      createdAt: row.createdAt.toISOString(),
    },
  })
}

export async function restoreNoteVersion(req: Request, res: Response) {
  const { note, row } = await getOwnedVersion(
    req.userId!,
    param(req.params.id),
    param(req.params.version),
  )

  // Snapshot the current state first so the restore itself is undoable.
  await snapshotVersion(note)

  const restoredDoc = parseDoc(row.contentJson)
  const [updated] = await db
    .update(schema.notes)
    .set({
      title: row.title,
      contentJson: restoredDoc,
      contentText: extractNoteText(restoredDoc),
      version: note.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(schema.notes.id, note.id))
    .returning()
  res.json({ note: toNoteDto(updated!) })
}

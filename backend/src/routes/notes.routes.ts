import { Router } from "express"
import { validateBody } from "../middleware/validate.js"
import { requireAuth } from "../middleware/auth.js"
import {
  createNotebookSchema,
  patchNotebookSchema,
  createNoteSchema,
  patchNoteSchema,
} from "../shared/note.schemas.js"
import {
  listNotebooks,
  createNotebook,
  patchNotebook,
  deleteNotebook,
  listNotes,
  searchNotes,
  listTags,
  createNote,
  getNote,
  patchNote,
  deleteNote,
  listNoteVersions,
  getNoteVersion,
  restoreNoteVersion,
} from "../controllers/notes.controller.js"

export const notesRouter = Router()

notesRouter.use(requireAuth)

// Notebooks (static segments before /:id).
notesRouter.get("/notebooks", listNotebooks)
notesRouter.post("/notebooks", validateBody(createNotebookSchema), createNotebook)
notesRouter.patch("/notebooks/:id", validateBody(patchNotebookSchema), patchNotebook)
notesRouter.delete("/notebooks/:id", deleteNotebook)

notesRouter.get("/tags", listTags)
notesRouter.get("/search", searchNotes)

// Notes.
notesRouter.get("/", listNotes)
notesRouter.post("/", validateBody(createNoteSchema), createNote)
notesRouter.get("/:id", getNote)
notesRouter.patch("/:id", validateBody(patchNoteSchema), patchNote)
notesRouter.delete("/:id", deleteNote)

// Version history.
notesRouter.get("/:id/versions", listNoteVersions)
notesRouter.get("/:id/versions/:version", getNoteVersion)
notesRouter.post("/:id/versions/:version/restore", restoreNoteVersion)

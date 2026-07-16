// Smoke test for the notes module API (run against a locally started server).
// Usage: node scripts/notes-smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3999"

let failures = 0
function check(name, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL"
  if (!ok) failures++
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ""}`)
}

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

function block(type, text, extra = {}) {
  return { id: crypto.randomUUID(), type, text, ...extra }
}

// 1. Register a fresh user
const email = `notes-smoke-${Date.now()}@test.dev`
const reg = await req("/api/auth/register", {
  method: "POST",
  body: { email, password: "Sm0ke-test-pass!", name: "Notes Smoke" },
})
check("register user", reg.status === 201 || reg.status === 200, `status ${reg.status}`)
const token = reg.json?.tokens?.accessToken
check("access token issued", typeof token === "string" && token.length > 20)

// 2. Auth guard
const unauth = await req("/api/notes")
check("notes endpoints require auth", unauth.status === 401, `status ${unauth.status}`)

// 3. Notebooks — empty, create, patch
const emptyNb = await req("/api/notes/notebooks", { token })
check(
  "list notebooks (empty)",
  emptyNb.status === 200 && Array.isArray(emptyNb.json?.notebooks) && emptyNb.json.notebooks.length === 0,
  `status ${emptyNb.status}`,
)

const nb = await req("/api/notes/notebooks", { method: "POST", token, body: { name: "Work" } })
check("create notebook", nb.status === 201 && nb.json?.notebook?.name === "Work", `status ${nb.status}`)
const nbId = nb.json?.notebook?.id

const nbPatched = await req(`/api/notes/notebooks/${nbId}`, {
  method: "PATCH",
  token,
  body: { name: "Work Projects" },
})
check(
  "patch notebook",
  nbPatched.status === 200 && nbPatched.json?.notebook?.name === "Work Projects",
  `status ${nbPatched.status}`,
)

const nbInvalid = await req("/api/notes/notebooks", { method: "POST", token, body: { name: "" } })
check("zod validation rejects bad notebook", nbInvalid.status === 400, `status ${nbInvalid.status}`)

// 4. Notes — create with rich content
const doc = {
  type: "doc",
  content: [
    block("heading", "Q3 Launch Plan", { level: 1 }),
    block("paragraph", "Draft the marketing brief before Friday."),
    block("bullet", "Coordinate with design"),
    block("checklist", "Book launch venue", { checked: false }),
  ],
}
const created = await req("/api/notes", {
  method: "POST",
  token,
  body: { notebookId: nbId, title: "Launch plan", content: doc, tags: ["work", "launch"] },
})
check(
  "create note",
  created.status === 201 && created.json?.note?.title === "Launch plan",
  `status ${created.status}`,
)
const noteId = created.json?.note?.id
check("note snippet extracted from content", created.json?.note?.snippet?.includes("Q3 Launch Plan"))
check("note starts at version 1", created.json?.note?.version === 1)

const created2 = await req("/api/notes", {
  method: "POST",
  token,
  body: {
    title: "Groceries",
    content: { type: "doc", content: [block("bullet", "Milk"), block("bullet", "Eggs")] },
    tags: ["personal"],
    isPinned: true,
  },
})
check("create unfiled pinned note", created2.status === 201 && created2.json?.note?.isPinned === true, `status ${created2.status}`)
const note2Id = created2.json?.note?.id

const invalidNote = await req("/api/notes", {
  method: "POST",
  token,
  body: { title: "bad", content: { type: "doc", content: [{ id: "x", type: "nope", text: "" }] } },
})
check("zod validation rejects bad note content", invalidNote.status === 400, `status ${invalidNote.status}`)

// 5. Listing — pinned first, notebook filter, tag filter
const list = await req("/api/notes", { token })
check(
  "list notes returns both, pinned first",
  list.status === 200 && list.json?.notes?.length === 2 && list.json.notes[0].id === note2Id,
  `status ${list.status}, ${list.json?.notes?.length} note(s)`,
)

const byNotebook = await req(`/api/notes?notebookId=${nbId}`, { token })
check(
  "notebookId filter works",
  byNotebook.status === 200 && byNotebook.json?.notes?.length === 1 && byNotebook.json.notes[0].id === noteId,
  `status ${byNotebook.status}`,
)

const byTag = await req(`/api/notes?tag=personal`, { token })
check(
  "tag filter works",
  byTag.status === 200 && byTag.json?.notes?.length === 1 && byTag.json.notes[0].id === note2Id,
  `status ${byTag.status}`,
)

// 6. Notebook list includes note counts
const nbList = await req("/api/notes/notebooks", { token })
const nbRow = nbList.json?.notebooks?.find((n) => n.id === nbId)
check("notebook list has note counts", nbList.status === 200 && nbRow?.noteCount === 1, `count ${nbRow?.noteCount}`)

// 7. Tags endpoint
const tags = await req("/api/notes/tags", { token })
check(
  "tags endpoint returns distinct sorted tags",
  tags.status === 200 && JSON.stringify(tags.json?.tags) === JSON.stringify(["launch", "personal", "work"]),
  `tags ${JSON.stringify(tags.json?.tags)}`,
)

// 8. Search — title + body, short query rejected
const searchTitle = await req(`/api/notes/search?q=launch`, { token })
check(
  "search finds note by title",
  searchTitle.status === 200 && searchTitle.json?.notes?.some((n) => n.id === noteId),
  `status ${searchTitle.status}`,
)
const searchBody = await req(`/api/notes/search?q=marketing%20brief`, { token })
check(
  "search finds note by body text",
  searchBody.status === 200 && searchBody.json?.notes?.some((n) => n.id === noteId),
  `status ${searchBody.status}`,
)
const searchShort = await req(`/api/notes/search?q=a`, { token })
check("search rejects short query", searchShort.status === 400, `status ${searchShort.status}`)

// 9. Get note detail with full content
const detail = await req(`/api/notes/${noteId}`, { token })
check(
  "note detail includes content doc",
  detail.status === 200 && detail.json?.note?.content?.content?.length === 4,
  `status ${detail.status}`,
)

// 10. Patch — content edit bumps version + snapshots history
const editedDoc = {
  ...doc,
  content: [...doc.content, block("paragraph", "Added a follow-up line.")],
}
const patched = await req(`/api/notes/${noteId}`, {
  method: "PATCH",
  token,
  body: { content: editedDoc, baseVersion: 1 },
})
check(
  "patch note content bumps version",
  patched.status === 200 && patched.json?.note?.version === 2,
  `status ${patched.status}, version ${patched.json?.note?.version}`,
)

// Metadata-only patch must NOT bump version.
const pinPatch = await req(`/api/notes/${noteId}`, { method: "PATCH", token, body: { isPinned: true } })
check(
  "metadata-only patch keeps version",
  pinPatch.status === 200 && pinPatch.json?.note?.version === 2,
  `version ${pinPatch.json?.note?.version}`,
)

// 11. Conflict detection — stale baseVersion returns 409 + current note
const conflict = await req(`/api/notes/${noteId}`, {
  method: "PATCH",
  token,
  body: { title: "Stale write", baseVersion: 1 },
})
check(
  "stale baseVersion returns 409 with current note",
  conflict.status === 409 && conflict.json?.note?.version === 2,
  `status ${conflict.status}`,
)

// 12. Version history — list, fetch, restore
const versions = await req(`/api/notes/${noteId}/versions`, { token })
check(
  "version history lists snapshot",
  versions.status === 200 && versions.json?.versions?.length === 1 && versions.json.versions[0].version === 1,
  `status ${versions.status}, ${versions.json?.versions?.length} version(s)`,
)

const v1 = await req(`/api/notes/${noteId}/versions/1`, { token })
check(
  "fetch version detail",
  v1.status === 200 && v1.json?.version?.content?.content?.length === 4,
  `status ${v1.status}`,
)

const restored = await req(`/api/notes/${noteId}/versions/1/restore`, { method: "POST", token })
check(
  "restore version bumps version and reverts content",
  restored.status === 200 && restored.json?.note?.version === 3 && restored.json.note.content.content.length === 4,
  `status ${restored.status}, version ${restored.json?.note?.version}`,
)

const badVersion = await req(`/api/notes/${noteId}/versions/99`, { token })
check("missing version returns 404", badVersion.status === 404, `status ${badVersion.status}`)

// 13. Cross-user isolation
const reg2 = await req("/api/auth/register", {
  method: "POST",
  body: { email: `notes-smoke-b-${Date.now()}@test.dev`, password: "Sm0ke-test-pass!", name: "Notes Smoke B" },
})
const token2 = reg2.json?.tokens?.accessToken
const foreignNote = await req(`/api/notes/${noteId}`, { token: token2 })
check("cross-user note access rejected", foreignNote.status === 404, `status ${foreignNote.status}`)
const foreignNb = await req(`/api/notes/notebooks/${nbId}`, { method: "PATCH", token: token2, body: { name: "hax" } })
check("cross-user notebook access rejected", foreignNb.status === 404, `status ${foreignNb.status}`)

// 14. Delete notebook — notes fall back to unfiled (SET NULL)
const delNb = await req(`/api/notes/notebooks/${nbId}`, { method: "DELETE", token })
check("delete notebook", delNb.status === 204, `status ${delNb.status}`)
const orphaned = await req(`/api/notes/${noteId}`, { token })
check(
  "notebook deletion unfiles notes (SET NULL)",
  orphaned.status === 200 && orphaned.json?.note?.notebookId === null,
  `notebookId ${orphaned.json?.note?.notebookId}`,
)

// 15. Delete note — history cascades
const delNote = await req(`/api/notes/${noteId}`, { method: "DELETE", token })
check("delete note", delNote.status === 204, `status ${delNote.status}`)
const goneVersions = await req(`/api/notes/${noteId}/versions`, { token })
check("deleted note versions gone (404)", goneVersions.status === 404, `status ${goneVersions.status}`)

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
console.log(`SMOKE_TEST_EMAILS:${email},${reg2.json?.user?.email ?? ""}`)
process.exit(failures === 0 ? 0 : 1)

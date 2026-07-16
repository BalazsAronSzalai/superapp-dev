// Note editor — title + block content with debounced autosave, notebook
// picker, tags, pin toggle, and version history (plan.md Phase 5).
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronRight,
  FolderOpen,
  Hash,
  History,
  Pin,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { LinkedItems } from "@/components/glue/linked-items"
import { BlockEditor, emptyParagraph } from "@/components/notes/block-editor"
import { formatNoteDate } from "@/components/notes/note-row"
import {
  noteKeys,
  useDeleteNote,
  useNote,
  useNotebooks,
  useNoteVersions,
  usePatchNote,
  useRestoreNoteVersion,
} from "@/hooks/use-notes"
import { ApiError } from "@/lib/api"
import type { NoteDoc, PatchNoteInput } from "@/lib/schemas/note.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const AUTOSAVE_MS = 900
const MAX_TAGS = 20

function confirmDelete(title: string, onConfirm: () => void) {
  const message = `Delete "${title || "Untitled"}"? This cannot be undone.`
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm()
    return
  }
  Alert.alert("Delete note", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ])
}

export default function NoteEditorScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()

  const noteQuery = useNote(id)
  const notebooksQuery = useNotebooks()
  const patchMutation = usePatchNote()
  const deleteMutation = useDeleteNote()
  const versionsQuery = useNoteVersions(id)
  const restoreMutation = useRestoreNoteVersion()

  const note = noteQuery.data
  const notebooks = notebooksQuery.data ?? []

  // Local draft state — seeded once per note load (and after restores),
  // then saved back with a debounce. `baseVersion` guards against
  // conflicting writes (server responds 409, plan.md Phase 5).
  const [title, setTitle] = useState("")
  const [doc, setDoc] = useState<NoteDoc>({ type: "doc", content: [emptyParagraph()] })
  const [newTag, setNewTag] = useState("")
  const [notebookPickerOpen, setNotebookPickerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  /** Server version our draft is based on; bumped after successful saves. */
  const baseVersion = useRef<number | null>(null)
  /** Tracks the note id + version we last seeded local state from. */
  const seededFrom = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Latest dirty payload — flushed on unmount. */
  const pendingSave = useRef<PatchNoteInput | null>(null)

  useEffect(() => {
    if (!note) return
    const seedKey = note.id
    // Seed only on first load of this note, or when the server version moved
    // past ours without a local save (restore / external edit).
    const externallyUpdated =
      baseVersion.current != null && note.version > baseVersion.current
    if (seededFrom.current === seedKey && !externallyUpdated) return
    seededFrom.current = seedKey
    baseVersion.current = note.version
    setTitle(note.title)
    setDoc(note.content.content.length > 0 ? note.content : { type: "doc", content: [emptyParagraph()] })
  }, [note])

  const save = useCallback(
    (input: PatchNoteInput) => {
      if (!id) return
      pendingSave.current = null
      patchMutation.mutate(
        { id, input: { ...input, baseVersion: baseVersion.current ?? undefined } },
        {
          onSuccess: (data) => {
            baseVersion.current = data.note.version
          },
          onError: (error) => {
            if (error instanceof ApiError && error.status === 409) {
              // Conflict: another writer won. Re-fetch and re-seed from server.
              baseVersion.current = null
              seededFrom.current = null
              queryClient.invalidateQueries({ queryKey: noteKeys.detail(id) })
            }
          },
        },
      )
    },
    [id, patchMutation, queryClient],
  )

  /** Debounced autosave for title/content edits. */
  const scheduleSave = useCallback(
    (input: PatchNoteInput) => {
      pendingSave.current = { ...pendingSave.current, ...input }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        if (pendingSave.current) save(pendingSave.current)
      }, AUTOSAVE_MS)
    },
    [save],
  )

  // Flush any pending edit when leaving the screen.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pendingSave.current) save(pendingSave.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onTitleChange = (text: string) => {
    setTitle(text)
    scheduleSave({ title: text })
  }

  const onDocChange = (nextDoc: NoteDoc) => {
    setDoc(nextDoc)
    scheduleSave({ content: nextDoc })
  }

  const togglePin = () => {
    if (!note) return
    save({ isPinned: !note.isPinned })
  }

  const addTag = () => {
    if (!note) return
    const tag = newTag.trim().replace(/^#/, "").toLowerCase()
    if (!tag || note.tags.includes(tag) || note.tags.length >= MAX_TAGS) {
      setNewTag("")
      return
    }
    setNewTag("")
    save({ tags: [...note.tags, tag] })
  }

  const removeTag = (tag: string) => {
    if (!note) return
    save({ tags: note.tags.filter((t) => t !== tag) })
  }

  const moveToNotebook = (notebookId: string | null) => {
    setNotebookPickerOpen(false)
    save({ notebookId })
  }

  const restoreVersion = (version: number) => {
    if (!id) return
    // Discard any unsent draft — the restore result becomes the new truth.
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingSave.current = null
    restoreMutation.mutate(
      { id, version },
      {
        onSuccess: (data) => {
          baseVersion.current = data.note.version
          setTitle(data.note.title)
          setDoc(
            data.note.content.content.length > 0
              ? data.note.content
              : { type: "doc", content: [emptyParagraph()] },
          )
          setHistoryOpen(false)
        },
      },
    )
  }

  if (noteQuery.isLoading || !note) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "" }} />
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  const notebookName = note.notebookId
    ? (notebooks.find((n) => n.id === note.notebookId)?.name ?? "Notebook")
    : "All Notes"
  const versions = versionsQuery.data ?? []

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={note.isPinned ? "Unpin note" : "Pin note"}
                hitSlop={8}
                onPress={togglePin}
              >
                <Pin
                  color={note.isPinned ? colors.warning : colors.textSecondary}
                  fill={note.isPinned ? colors.warning : "transparent"}
                  size={21}
                  strokeWidth={1.75}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Version history"
                hitSlop={8}
                onPress={() => setHistoryOpen(true)}
              >
                <History color={colors.textSecondary} size={21} strokeWidth={1.75} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete note"
                hitSlop={8}
                onPress={() =>
                  confirmDelete(title, () => {
                    if (saveTimer.current) clearTimeout(saveTimer.current)
                    pendingSave.current = null
                    deleteMutation.mutate(note.id, { onSuccess: () => router.back() })
                  })
                }
              >
                <Trash2 color={colors.destructive} size={21} strokeWidth={1.75} />
              </Pressable>
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={title}
          onChangeText={onTitleChange}
          multiline
          placeholder="Title"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Note title"
          style={[styles.titleInput, { color: colors.text }]}
        />

        {/* Notebook + last-edited meta row */}
        <View style={styles.metaRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move to notebook. Currently in ${notebookName}`}
            onPress={() => setNotebookPickerOpen(true)}
            style={[styles.notebookChip, { backgroundColor: colors.surfaceSecondary }]}
          >
            <FolderOpen color={colors.accent} size={14} strokeWidth={2} />
            <Text style={[styles.notebookChipText, { color: colors.textSecondary }]}>
              {notebookName}
            </Text>
            <ChevronRight color={colors.textTertiary} size={13} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            Edited {formatNoteDate(note.updatedAt)}
          </Text>
        </View>

        <BlockEditor doc={doc} onChange={onDocChange} />

        {/* Tags */}
        <View style={[styles.tagsSection, { borderTopColor: colors.separator }]}>
          <View style={styles.tagsRow}>
            {note.tags.map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={`Remove tag ${tag}`}
                onPress={() => removeTag(tag)}
                style={[styles.tagChip, { backgroundColor: colors.accentMuted }]}
              >
                <Text style={[styles.tagText, { color: colors.accent }]}>#{tag}</Text>
                <X color={colors.accent} size={12} strokeWidth={2.25} />
              </Pressable>
            ))}
            <View style={[styles.addTagWrap, { backgroundColor: colors.surfaceSecondary }]}>
              <Hash color={colors.textTertiary} size={13} strokeWidth={2} />
              <TextInput
                value={newTag}
                onChangeText={setNewTag}
                onSubmitEditing={addTag}
                onBlur={addTag}
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Add tag"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Add tag"
                style={[styles.addTagInput, { color: colors.text }]}
              />
            </View>
          </View>
        </View>

        {/* Cross-module links (superapp glue) */}
        <LinkedItems entityType="note" entityId={note.id} />
      </ScrollView>

      {/* Notebook picker */}
      <SheetModal
        visible={notebookPickerOpen}
        onClose={() => setNotebookPickerOpen(false)}
        title="Move to notebook"
      >
        <View style={styles.sheetOptions}>
          <Button
            title="All Notes (no notebook)"
            variant={note.notebookId == null ? "primary" : "secondary"}
            onPress={() => moveToNotebook(null)}
          />
          {notebooks.map((nb) => (
            <Button
              key={nb.id}
              title={nb.name}
              variant={note.notebookId === nb.id ? "primary" : "secondary"}
              onPress={() => moveToNotebook(nb.id)}
            />
          ))}
          {notebooks.length === 0 ? (
            <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
              No notebooks yet — create one from the Notes tab.
            </Text>
          ) : null}
        </View>
      </SheetModal>

      {/* Version history */}
      <SheetModal
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Version History"
      >
        {versionsQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : versions.length === 0 ? (
          <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
            No earlier versions yet. A snapshot is kept each time this note is saved.
          </Text>
        ) : (
          <View style={styles.sheetOptions}>
            {versions.map((v) => (
              <View
                key={v.version}
                style={[styles.versionRow, { backgroundColor: colors.surfaceSecondary }]}
              >
                <View style={styles.versionInfo}>
                  <Text numberOfLines={1} style={[styles.versionTitle, { color: colors.text }]}>
                    {v.title || "Untitled"}
                  </Text>
                  <Text style={[styles.versionMeta, { color: colors.textTertiary }]}>
                    v{v.version} · {formatNoteDate(v.createdAt)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restore version ${v.version}`}
                  disabled={restoreMutation.isPending}
                  onPress={() => restoreVersion(v.version)}
                  style={({ pressed }) => [
                    styles.restoreButton,
                    { backgroundColor: colors.accentMuted, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <RotateCcw color={colors.accent} size={14} strokeWidth={2.25} />
                  <Text style={[styles.restoreText, { color: colors.accent }]}>Restore</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </SheetModal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  titleInput: {
    fontSize: typography.title1.fontSize,
    lineHeight: typography.title1.lineHeight,
    fontWeight: "700",
    padding: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  notebookChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  notebookChipText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  metaText: {
    flex: 1,
    fontSize: typography.footnote.fontSize,
  },
  tagsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  addTagWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  addTagInput: {
    fontSize: typography.footnote.fontSize,
    minWidth: 64,
    padding: 0,
  },
  sheetOptions: {
    gap: spacing.sm,
  },
  sheetHint: {
    fontSize: typography.footnote.fontSize,
    textAlign: "center",
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  versionInfo: {
    flex: 1,
    gap: 2,
  },
  versionTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "600",
  },
  versionMeta: {
    fontSize: typography.footnote.fontSize,
  },
  restoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  restoreText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
})

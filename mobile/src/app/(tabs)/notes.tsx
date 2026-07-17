// Notes tab — Apple Notes-style list with notebook filter chips (plan.md Phase 5).
import { useCallback, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import {
  FolderOpen,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Search as SearchIcon,
  Trash2,
} from "lucide-react-native"

import { ScreenHeader } from "@/components/screen-header"
import { EmptyState } from "@/components/ui/empty-state"
import { getListSeparator } from "@/components/ui/list-separator"
import { SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row"
import { NoteRow } from "@/components/notes/note-row"
import { emptyParagraph } from "@/components/notes/block-editor"
import {
  useCreateNote,
  useDeleteNote,
  useNotebooks,
  useNotes,
  usePatchNote,
} from "@/hooks/use-notes"
import type { NoteSummary } from "@/lib/schemas/note.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const Separator = getListSeparator(spacing.md)

/** Flattened rows: pinned notes get an Apple Notes-style section split. */
type Row =
  | { type: "header"; key: string; label: string }
  | { type: "note"; key: string; note: NoteSummary }

function buildRows(notes: NoteSummary[]): Row[] {
  const pinned = notes.filter((n) => n.isPinned)
  const rest = notes.filter((n) => !n.isPinned)
  if (pinned.length === 0) {
    return rest.map((n) => ({ type: "note" as const, key: n.id, note: n }))
  }
  return [
    { type: "header", key: "h-pinned", label: "Pinned" },
    ...pinned.map((n) => ({ type: "note" as const, key: n.id, note: n })),
    ...(rest.length > 0 ? [{ type: "header" as const, key: "h-notes", label: "Notes" }] : []),
    ...rest.map((n) => ({ type: "note" as const, key: n.id, note: n })),
  ]
}

export default function NotesScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  /** null = All Notes. */
  const [notebookId, setNotebookId] = useState<string | null>(null)

  const notebooksQuery = useNotebooks()
  const notesQuery = useNotes(notebookId ? { notebookId } : {})
  const createMutation = useCreateNote()
  const patchMutation = usePatchNote()
  const deleteMutation = useDeleteNote()

  const notebooks = notebooksQuery.data ?? []
  const notes = notesQuery.data ?? []
  const rows = useMemo(() => buildRows(notes), [notes])

  const createNote = () => {
    createMutation.mutate(
      {
        title: "",
        content: { type: "doc", content: [emptyParagraph()] },
        tags: [],
        isPinned: false,
        ...(notebookId ? { notebookId } : null),
      },
      { onSuccess: (data) => router.push(`/notes/note/${data.note.id}`) },
    )
  }

  const swipeActionsFor = useCallback(
    (note: NoteSummary): { right: SwipeAction[]; left: SwipeAction[] } => ({
      right: [
        {
          label: "Delete",
          icon: Trash2,
          color: colors.destructive,
          onPress: () => deleteMutation.mutate(note.id),
        },
      ],
      left: [
        {
          label: note.isPinned ? "Unpin" : "Pin",
          icon: note.isPinned ? PinOff : Pin,
          color: colors.warning,
          onPress: () =>
            patchMutation.mutate({ id: note.id, input: { isPinned: !note.isPinned } }),
        },
      ],
    }),
    [colors, deleteMutation, patchMutation],
  )

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "header") {
        return (
          <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>{item.label}</Text>
        )
      }
      const { right, left } = swipeActionsFor(item.note)
      return (
        <SwipeableRow rightActions={right} leftActions={left}>
          <NoteRow note={item.note} onPress={(n) => router.push(`/notes/note/${n.id}`)} />
        </SwipeableRow>
      )
    },
    [swipeActionsFor, router, colors.textTertiary],
  )

  const activeNotebookName = notebookId
    ? (notebooks.find((n) => n.id === notebookId)?.name ?? "Notebook")
    : null

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Notes"
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search notes"
              hitSlop={8}
              onPress={() => router.push("/notes/search")}
            >
              <SearchIcon color={colors.textSecondary} size={22} strokeWidth={1.75} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage notebooks"
              hitSlop={8}
              onPress={() => router.push("/notes/notebooks")}
            >
              <FolderOpen color={colors.textSecondary} size={22} strokeWidth={1.75} />
            </Pressable>
          </>
        }
      />

      {/* Notebook filter chips */}
      <View style={styles.chipBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBar}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: notebookId === null }}
            onPress={() => setNotebookId(null)}
            style={[
              styles.chip,
              { backgroundColor: notebookId === null ? colors.accent : colors.surfaceSecondary },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: notebookId === null ? "#FFFFFF" : colors.textSecondary },
              ]}
            >
              All Notes
            </Text>
          </Pressable>
          {notebooks.map((nb) => {
            const active = nb.id === notebookId
            return (
              <Pressable
                key={nb.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setNotebookId(active ? null : nb.id)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {nb.name}
                </Text>
                {(nb.noteCount ?? 0) > 0 ? (
                  <Text
                    style={[
                      styles.chipCount,
                      { color: active ? "rgba(255,255,255,0.8)" : colors.textTertiary },
                    ]}
                  >
                    {nb.noteCount}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {notesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={activeNotebookName ? `No notes in ${activeNotebookName}` : "No notes yet"}
          description="Tap + to write your first note. Notes support headings, lists, and checklists."
        />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          refreshControl={
            <RefreshControl
              refreshing={notesQuery.isRefetching}
              onRefresh={() => notesQuery.refetch()}
              tintColor={colors.accent}
            />
          }
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New note"
        onPress={createNote}
        disabled={createMutation.isPending}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed || createMutation.isPending ? 0.85 : 1 },
        ]}
      >
        <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipBarWrap: {
    paddingBottom: spacing.sm,
  },
  chipBar: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  chipCount: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
  sectionHeader: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: 96,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
})

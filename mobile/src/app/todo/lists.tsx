// Lists management — create, rename, recolor, delete task lists; drill into a list.
import { useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { ListTodo, Pencil, Plus, Trash2 } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SheetModal } from "@/components/ui/modal"
import { TextField } from "@/components/ui/text-field"
import {
  useCreateTaskList,
  useDeleteTaskList,
  usePatchTaskList,
  useTaskLists,
} from "@/hooks/use-tasks"
import type { TaskList } from "@/lib/schemas/task.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** iOS system palette swatches for list colors. */
const LIST_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF3B30",
  "#AF52DE",
  "#FF2D55",
  "#5AC8FA",
  "#8E8E93",
] as const

function confirmDelete(name: string, onConfirm: () => void) {
  const message = `Delete "${name}"? Its to-dos move back to the inbox.`
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm()
    return
  }
  Alert.alert("Delete list", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ])
}

interface EditorState {
  /** null = creating a new list. */
  list: TaskList | null
  name: string
  color: string
}

export default function ListsScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const listsQuery = useTaskLists()
  const createMutation = useCreateTaskList()
  const patchMutation = usePatchTaskList()
  const deleteMutation = useDeleteTaskList()

  const lists = listsQuery.data ?? []
  const [editor, setEditor] = useState<EditorState | null>(null)

  const openCreate = () => setEditor({ list: null, name: "", color: LIST_COLORS[0] })
  const openEdit = (list: TaskList) =>
    setEditor({ list, name: list.name, color: list.color ?? LIST_COLORS[0] })

  const saving = createMutation.isPending || patchMutation.isPending
  const canSave = (editor?.name.trim().length ?? 0) > 0 && !saving

  const save = () => {
    if (!editor || !canSave) return
    const name = editor.name.trim()
    const onSuccess = () => setEditor(null)
    if (editor.list) {
      patchMutation.mutate(
        { id: editor.list.id, input: { name, color: editor.color } },
        { onSuccess },
      )
    } else {
      createMutation.mutate(
        { name, color: editor.color, sortOrder: lists.length },
        { onSuccess },
      )
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {listsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : lists.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No lists yet"
          description="Group your to-dos into lists like Work, Home, or Errands."
          action={
            <Button title="Create a list" onPress={openCreate} style={styles.emptyAction} />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
            {lists.map((list, i) => (
              <View key={list.id}>
                {i > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open list ${list.name}`}
                  onPress={() => router.push(`/todo/list/${list.id}`)}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View
                    style={[styles.colorDot, { backgroundColor: list.color ?? colors.accent }]}
                  />
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                    {list.name}
                  </Text>
                  <Text style={[styles.rowCount, { color: colors.textTertiary }]}>
                    {list.taskCount ?? 0}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit list ${list.name}`}
                    hitSlop={8}
                    onPress={() => openEdit(list)}
                  >
                    <Pencil color={colors.textTertiary} size={17} strokeWidth={1.75} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete list ${list.name}`}
                    hitSlop={8}
                    onPress={() =>
                      confirmDelete(list.name, () => deleteMutation.mutate(list.id))
                    }
                  >
                    <Trash2 color={colors.textTertiary} size={17} strokeWidth={1.75} />
                  </Pressable>
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New list"
        onPress={openCreate}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
      </Pressable>

      <SheetModal
        visible={editor != null}
        onClose={() => setEditor(null)}
        title={editor?.list ? "Edit List" : "New List"}
      >
        {editor ? (
          <View style={styles.editorBody}>
            <TextField
              label="Name"
              value={editor.name}
              onChangeText={(name) => setEditor({ ...editor, name })}
              placeholder="e.g. Work"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <View>
              <Text style={[styles.swatchLabel, { color: colors.textTertiary }]}>Color</Text>
              <View style={styles.swatches}>
                {LIST_COLORS.map((c) => {
                  const active = editor.color === c
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`Color ${c}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setEditor({ ...editor, color: c })}
                      style={[
                        styles.swatch,
                        { backgroundColor: c },
                        active ? { borderColor: colors.text, borderWidth: 2 } : null,
                      ]}
                    />
                  )
                })}
              </View>
            </View>
            <Button
              title={editor.list ? "Save" : "Create List"}
              onPress={save}
              disabled={!canSave}
              loading={saving}
            />
          </View>
        ) : null}
      </SheetModal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyAction: {
    marginTop: spacing.sm,
    alignSelf: "center",
    minWidth: 200,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 96,
  },
  card: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
  },
  rowTitle: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  rowCount: {
    fontSize: typography.subheadline.fontSize,
    marginRight: spacing.xs,
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
  editorBody: {
    gap: spacing.md,
  },
  swatchLabel: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm + 2,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
  },
})

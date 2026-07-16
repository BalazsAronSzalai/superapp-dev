// Notebooks management — create, rename, and delete notebooks (plan.md Phase 5).
// Deleting a notebook moves its notes back to "All Notes" (SET NULL on server).
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
import { FolderOpen, Pencil, Plus, Trash2 } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SheetModal } from "@/components/ui/modal"
import { TextField } from "@/components/ui/text-field"
import {
  useCreateNotebook,
  useDeleteNotebook,
  useNotebooks,
  usePatchNotebook,
} from "@/hooks/use-notes"
import type { Notebook } from "@/lib/schemas/note.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

function confirmDelete(name: string, onConfirm: () => void) {
  const message = `Delete "${name}"? Its notes move back to All Notes.`
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm()
    return
  }
  Alert.alert("Delete notebook", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ])
}

interface EditorState {
  /** null = creating a new notebook. */
  notebook: Notebook | null
  name: string
}

export default function NotebooksScreen() {
  const { colors } = useAppTheme()

  const notebooksQuery = useNotebooks()
  const createMutation = useCreateNotebook()
  const patchMutation = usePatchNotebook()
  const deleteMutation = useDeleteNotebook()

  const notebooks = notebooksQuery.data ?? []
  const [editor, setEditor] = useState<EditorState | null>(null)

  const openCreate = () => setEditor({ notebook: null, name: "" })
  const openEdit = (notebook: Notebook) => setEditor({ notebook, name: notebook.name })

  const saving = createMutation.isPending || patchMutation.isPending
  const canSave = (editor?.name.trim().length ?? 0) > 0 && !saving

  const save = () => {
    if (!editor || !canSave) return
    const name = editor.name.trim()
    const onSuccess = () => setEditor(null)
    if (editor.notebook) {
      patchMutation.mutate({ id: editor.notebook.id, input: { name } }, { onSuccess })
    } else {
      createMutation.mutate({ name, sortOrder: notebooks.length }, { onSuccess })
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {notebooksQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : notebooks.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No notebooks yet"
          description="Group your notes into notebooks like Work, Journal, or Recipes."
          action={
            <Button title="Create a notebook" onPress={openCreate} style={styles.emptyAction} />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
            {notebooks.map((notebook, i) => (
              <View key={notebook.id}>
                {i > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                <View style={styles.row}>
                  <FolderOpen color={colors.accent} size={20} strokeWidth={1.75} />
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                    {notebook.name}
                  </Text>
                  <Text style={[styles.rowCount, { color: colors.textTertiary }]}>
                    {notebook.noteCount ?? 0}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Rename notebook ${notebook.name}`}
                    hitSlop={8}
                    onPress={() => openEdit(notebook)}
                  >
                    <Pencil color={colors.textTertiary} size={17} strokeWidth={1.75} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notebook ${notebook.name}`}
                    hitSlop={8}
                    onPress={() =>
                      confirmDelete(notebook.name, () => deleteMutation.mutate(notebook.id))
                    }
                  >
                    <Trash2 color={colors.textTertiary} size={17} strokeWidth={1.75} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New notebook"
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
        title={editor?.notebook ? "Rename Notebook" : "New Notebook"}
      >
        {editor ? (
          <View style={styles.editorBody}>
            <TextField
              label="Name"
              value={editor.name}
              onChangeText={(name) => setEditor({ ...editor, name })}
              placeholder="e.g. Journal"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <Button
              title={editor.notebook ? "Save" : "Create Notebook"}
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
    marginLeft: 50,
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
})

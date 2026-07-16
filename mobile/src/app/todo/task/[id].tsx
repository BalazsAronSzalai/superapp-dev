// Task detail — edit title/notes, schedule, priority, tags, list, subtasks.
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import {
  CalendarClock,
  Check,
  ChevronRight,
  Flag,
  Hash,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { LinkedItems } from "@/components/glue/linked-items"
import { formatTaskDate } from "@/components/todo/task-row"
import {
  taskKeys,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  usePatchTask,
  useTask,
  useTaskLists,
  useUncompleteTask,
} from "@/hooks/use-tasks"
import type { Task } from "@/lib/schemas/task.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const PRIORITY_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
] as const

const SCHEDULE_OPTIONS = [
  { key: "today", label: "Today", days: 0 },
  { key: "tomorrow", label: "Tomorrow", days: 1 },
  { key: "next-week", label: "Next week", days: 7 },
] as const

function isoAtNine(dayOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function confirmDelete(title: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(`Delete "${title}"? This also deletes its subtasks.`)) onConfirm()
    return
  }
  Alert.alert("Delete to-do", `Delete "${title}"? This also deletes its subtasks.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ])
}

export default function TaskDetailScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const taskQuery = useTask(id)
  const listsQuery = useTaskLists()
  const patchMutation = usePatchTask()
  const deleteMutation = useDeleteTask()
  const createMutation = useCreateTask()
  const completeMutation = useCompleteTask(taskKeys.detail(id ?? ""))
  const uncompleteMutation = useUncompleteTask(taskKeys.detail(id ?? ""))

  const task = taskQuery.data?.task
  const subtasks = taskQuery.data?.subtasks ?? []
  const lists = listsQuery.data ?? []

  // Local draft state for debounced-on-blur text edits.
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [newSubtask, setNewSubtask] = useState("")
  const [listPickerOpen, setListPickerOpen] = useState(false)
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.description ?? "")
    }
  }, [task?.id, task?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (taskQuery.isLoading || !task) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  const listName = task.listId ? (lists.find((l) => l.id === task.listId)?.name ?? "List") : "Inbox"
  const dateIso = task.scheduledDate ?? task.dueDate

  const saveTitle = () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      patchMutation.mutate({ id: task.id, input: { title: trimmed } })
    } else {
      setTitle(task.title)
    }
  }

  const saveNotes = () => {
    const trimmed = notes.trim()
    const current = task.description ?? ""
    if (trimmed !== current) {
      patchMutation.mutate({ id: task.id, input: { description: trimmed || null } })
    }
  }

  const toggleTask = (t: Task) => {
    if (t.isCompleted) uncompleteMutation.mutate(t.id)
    else completeMutation.mutate(t.id)
  }

  const addSubtask = () => {
    const trimmed = newSubtask.trim()
    if (!trimmed) return
    createMutation.mutate(
      { title: trimmed, parentTaskId: task.id, priority: 0, isSomeday: false, tags: [], sortOrder: subtasks.length },
      { onSuccess: () => setNewSubtask("") },
    )
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title row with completion toggle */}
      <View style={styles.titleRow}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.isCompleted }}
          accessibilityLabel={task.isCompleted ? "Mark incomplete" : "Mark complete"}
          hitSlop={10}
          onPress={() => toggleTask(task)}
          style={[
            styles.checkbox,
            {
              borderColor: task.isCompleted ? colors.accent : colors.separator,
              backgroundColor: task.isCompleted ? colors.accent : "transparent",
            },
          ]}
        >
          {task.isCompleted ? <Check color="#FFFFFF" size={16} strokeWidth={3} /> : null}
        </Pressable>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          multiline
          accessibilityLabel="Task title"
          style={[
            styles.titleInput,
            {
              color: task.isCompleted ? colors.textTertiary : colors.text,
              textDecorationLine: task.isCompleted ? "line-through" : "none",
            },
          ]}
        />
      </View>

      {/* Notes */}
      <TextInput
        value={notes}
        onChangeText={setNotes}
        onBlur={saveNotes}
        multiline
        placeholder="Notes"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Notes"
        style={[
          styles.notesInput,
          {
            color: colors.textSecondary,
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.separator,
          },
        ]}
      />

      {/* Metadata rows */}
      <View style={[styles.metaCard, { backgroundColor: colors.surfaceSecondary }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schedule"
          onPress={() => setSchedulePickerOpen(true)}
          style={styles.metaRow}
        >
          <CalendarClock color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>When</Text>
          <Text style={[styles.metaValue, { color: colors.textSecondary }]}>
            {task.isSomeday ? "Someday" : dateIso ? formatTaskDate(dateIso) : "Anytime"}
          </Text>
          <ChevronRight color={colors.textTertiary} size={16} strokeWidth={2} />
        </Pressable>

        <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="List"
          onPress={() => setListPickerOpen(true)}
          style={styles.metaRow}
        >
          <Hash color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>List</Text>
          <Text style={[styles.metaValue, { color: colors.textSecondary }]}>{listName}</Text>
          <ChevronRight color={colors.textTertiary} size={16} strokeWidth={2} />
        </Pressable>

        <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />

        <View style={styles.metaRow}>
          <Flag color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>Priority</Text>
          <View style={styles.priorityOptions}>
            {PRIORITY_OPTIONS.map((opt) => {
              const active = task.priority === opt.value
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => patchMutation.mutate({ id: task.id, input: { priority: opt.value } })}
                  style={[
                    styles.priorityChip,
                    { backgroundColor: active ? colors.accent : colors.background },
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityChipText,
                      { color: active ? "#FFFFFF" : colors.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {task.rrule ? (
          <>
            <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />
            <View style={styles.metaRow}>
              <Repeat color={colors.accent} size={18} strokeWidth={2} />
              <Text style={[styles.metaLabel, { color: colors.text }]}>Repeats</Text>
              <Text style={[styles.metaValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {task.rrule}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove repeat"
                hitSlop={8}
                onPress={() => patchMutation.mutate({ id: task.id, input: { rrule: null } })}
              >
                <Text style={[styles.removeText, { color: colors.destructive }]}>Remove</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      {/* Tags */}
      {task.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {task.tags.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag}`}
              onPress={() =>
                patchMutation.mutate({
                  id: task.id,
                  input: { tags: task.tags.filter((t) => t !== tag) },
                })
              }
              style={[styles.tagChip, { backgroundColor: colors.accentMuted }]}
            >
              <Text style={[styles.tagText, { color: colors.accent }]}>#{tag}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Subtasks */}
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Subtasks</Text>
      <View style={[styles.metaCard, { backgroundColor: colors.surfaceSecondary }]}>
        {subtasks.map((sub, i) => (
          <View key={sub.id}>
            {i > 0 ? (
              <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />
            ) : null}
            <View style={styles.subtaskRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sub.isCompleted }}
                accessibilityLabel={sub.isCompleted ? "Mark incomplete" : "Mark complete"}
                hitSlop={10}
                onPress={() => toggleTask(sub)}
                style={[
                  styles.subCheckbox,
                  {
                    borderColor: sub.isCompleted ? colors.accent : colors.separator,
                    backgroundColor: sub.isCompleted ? colors.accent : "transparent",
                  },
                ]}
              >
                {sub.isCompleted ? <Check color="#FFFFFF" size={12} strokeWidth={3} /> : null}
              </Pressable>
              <Text
                style={[
                  styles.subtaskTitle,
                  {
                    color: sub.isCompleted ? colors.textTertiary : colors.text,
                    textDecorationLine: sub.isCompleted ? "line-through" : "none",
                  },
                ]}
              >
                {sub.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete subtask ${sub.title}`}
                hitSlop={8}
                onPress={() => deleteMutation.mutate(sub.id)}
              >
                <Trash2 color={colors.textTertiary} size={16} strokeWidth={1.75} />
              </Pressable>
            </View>
          </View>
        ))}
        {subtasks.length > 0 ? (
          <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />
        ) : null}
        <View style={styles.subtaskRow}>
          <Plus color={colors.textTertiary} size={18} strokeWidth={2} />
          <TextInput
            value={newSubtask}
            onChangeText={setNewSubtask}
            onSubmitEditing={addSubtask}
            returnKeyType="done"
            placeholder="Add subtask"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Add subtask"
            style={[styles.subtaskInput, { color: colors.text }]}
          />
        </View>
      </View>

      {/* Cross-module links (superapp glue) */}
      <LinkedItems entityType="task" entityId={task.id} />

      <Button
        title="Delete To-Do"
        variant="destructive"
        onPress={() =>
          confirmDelete(task.title, () =>
            deleteMutation.mutate(task.id, { onSuccess: () => router.back() }),
          )
        }
        style={styles.deleteButton}
      />

      {/* When / schedule picker */}
      <SheetModal
        visible={schedulePickerOpen}
        onClose={() => setSchedulePickerOpen(false)}
        title="When"
      >
        <View style={styles.sheetOptions}>
          {SCHEDULE_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              title={opt.label}
              variant="secondary"
              onPress={() => {
                patchMutation.mutate({
                  id: task.id,
                  input: { scheduledDate: isoAtNine(opt.days), isSomeday: false },
                })
                setSchedulePickerOpen(false)
              }}
            />
          ))}
          <Button
            title="Someday"
            variant="secondary"
            onPress={() => {
              patchMutation.mutate({
                id: task.id,
                input: { isSomeday: true, scheduledDate: null, dueDate: null },
              })
              setSchedulePickerOpen(false)
            }}
          />
          <Button
            title="Anytime (clear date)"
            variant="secondary"
            onPress={() => {
              patchMutation.mutate({
                id: task.id,
                input: { scheduledDate: null, dueDate: null, isSomeday: false },
              })
              setSchedulePickerOpen(false)
            }}
          />
        </View>
      </SheetModal>

      {/* List picker */}
      <SheetModal
        visible={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        title="Move to list"
      >
        <View style={styles.sheetOptions}>
          <Button
            title="Inbox (no list)"
            variant={task.listId == null ? "primary" : "secondary"}
            onPress={() => {
              patchMutation.mutate({ id: task.id, input: { listId: null } })
              setListPickerOpen(false)
            }}
          />
          {lists.map((list) => (
            <Button
              key={list.id}
              title={list.name}
              variant={task.listId === list.id ? "primary" : "secondary"}
              onPress={() => {
                patchMutation.mutate({ id: task.id, input: { listId: list.id } })
                setListPickerOpen(false)
              }}
            />
          ))}
          {lists.length === 0 ? (
            <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
              No lists yet — create one from the To-Do tab.
            </Text>
          ) : null}
        </View>
      </SheetModal>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm + 4,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  titleInput: {
    flex: 1,
    fontSize: typography.title2.fontSize,
    lineHeight: typography.title2.lineHeight,
    fontWeight: "700",
    padding: 0,
  },
  notesInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    minHeight: 80,
    textAlignVertical: "top",
  },
  metaCard: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  metaLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: typography.body.fontSize,
  },
  metaSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  priorityOptions: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs + 2,
  },
  priorityChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  priorityChipText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  removeText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tagChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  subCheckbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  subtaskTitle: {
    flex: 1,
    fontSize: typography.body.fontSize,
  },
  subtaskInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    padding: 0,
  },
  deleteButton: {
    marginTop: spacing.sm,
  },
  sheetOptions: {
    gap: spacing.sm,
  },
  sheetHint: {
    fontSize: typography.footnote.fontSize,
    textAlign: "center",
  },
})

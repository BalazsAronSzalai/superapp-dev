import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Check, Repeat } from "lucide-react-native"

import type { Task } from "@/lib/schemas/task.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** "Today", "Tomorrow", "Mon", or "Jul 20" — Things-style relative labels. */
export function formatTaskDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDelta = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (dayDelta === 0) return "Today"
  if (dayDelta === 1) return "Tomorrow"
  if (dayDelta === -1) return "Yesterday"
  if (dayDelta > 1 && dayDelta < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" })
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : null),
  })
}

export function isOverdue(iso: string | null, now: Date = new Date()): boolean {
  if (!iso) return false
  return new Date(iso).getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

const PRIORITY_LABELS = ["", "!", "!!", "!!!"] as const

interface TaskRowProps {
  task: Task
  onToggle: (task: Task) => void
  onPress: (task: Task) => void
  /** Hide the date chip (e.g. inside the Today view where it's redundant). */
  hideDate?: boolean
}

function TaskRowInner({ task, onToggle, onPress, hideDate = false }: TaskRowProps) {
  const { colors } = useAppTheme()

  const dateIso = task.scheduledDate ?? task.dueDate
  const overdue = !task.isCompleted && isOverdue(task.dueDate)
  const priorityColor =
    task.priority === 3 ? colors.destructive : task.priority === 2 ? colors.warning : colors.textTertiary

  const hasMeta =
    (!hideDate && dateIso) ||
    task.rrule ||
    task.tags.length > 0 ||
    (task.subtaskCount ?? 0) > 0 ||
    task.priority > 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onPress={() => onPress(task)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceSecondary : colors.background },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.isCompleted }}
        accessibilityLabel={task.isCompleted ? "Mark incomplete" : "Mark complete"}
        hitSlop={10}
        onPress={() => onToggle(task)}
        style={[
          styles.checkbox,
          {
            borderColor: task.isCompleted ? colors.accent : colors.separator,
            backgroundColor: task.isCompleted ? colors.accent : "transparent",
          },
        ]}
      >
        {task.isCompleted ? <Check color="#FFFFFF" size={14} strokeWidth={3} /> : null}
      </Pressable>

      <View style={styles.content}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            {
              color: task.isCompleted ? colors.textTertiary : colors.text,
              textDecorationLine: task.isCompleted ? "line-through" : "none",
            },
          ]}
        >
          {task.title}
        </Text>

        {hasMeta ? (
          <View style={styles.meta}>
            {task.priority > 0 ? (
              <Text style={[styles.priority, { color: priorityColor }]}>
                {PRIORITY_LABELS[task.priority]}
              </Text>
            ) : null}
            {!hideDate && dateIso ? (
              <Text
                style={[
                  styles.metaText,
                  { color: overdue ? colors.destructive : colors.textTertiary },
                ]}
              >
                {formatTaskDate(dateIso)}
              </Text>
            ) : null}
            {task.rrule ? (
              <Repeat color={colors.textTertiary} size={12} strokeWidth={2} />
            ) : null}
            {(task.subtaskCount ?? 0) > 0 ? (
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                {task.completedSubtaskCount ?? 0}/{task.subtaskCount}
              </Text>
            ) : null}
            {task.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tagChip, { backgroundColor: colors.accentMuted }]}
              >
                <Text style={[styles.tagText, { color: colors.accent }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

export const TaskRow = memo(TaskRowInner)

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm + 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm - 1,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm - 2,
  },
  metaText: {
    fontSize: typography.footnote.fontSize,
  },
  priority: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "700",
  },
  tagChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  tagText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
})

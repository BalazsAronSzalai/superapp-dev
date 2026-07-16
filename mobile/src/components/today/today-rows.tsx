import { Pressable, StyleSheet, Text, View } from "react-native"
import { Circle } from "lucide-react-native"

import type {
  TodayBudget,
  TodayEvent,
  TodayMailThread,
  TodayTask,
} from "@/lib/schemas/glue.schemas"
import { formatCurrency } from "@/lib/money"
import type { FinanceCurrency } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

interface RowProps {
  isLast: boolean
  onPress: () => void
}

export function TodayEventRow({ event, isLast, onPress }: RowProps & { event: TodayEvent }) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !isLast && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={[styles.colorBar, { backgroundColor: event.calendarColor ?? colors.accent }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {event.allDay
            ? "All day"
            : `${timeLabel(event.startTime)} – ${timeLabel(event.endTime)}`}
          {event.location ? ` · ${event.location}` : ""}
        </Text>
      </View>
    </Pressable>
  )
}

export function TodayTaskRow({ task, isLast, onPress }: RowProps & { task: TodayTask }) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !isLast && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <Circle
        color={task.isOverdue ? colors.destructive : colors.textTertiary}
        size={18}
        strokeWidth={1.75}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {task.title}
        </Text>
        {task.dueDate ? (
          <Text
            style={[
              styles.rowSubtitle,
              { color: task.isOverdue ? colors.destructive : colors.textSecondary },
            ]}
          >
            {task.isOverdue ? "Overdue · " : "Due "}
            {new Date(task.dueDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </Text>
        ) : null}
      </View>
      {task.priority > 0 ? (
        <Text style={[styles.priority, { color: colors.warning }]}>
          {"!".repeat(Math.min(task.priority, 3))}
        </Text>
      ) : null}
    </Pressable>
  )
}

export function TodayThreadRow({
  thread,
  isLast,
  onPress,
}: RowProps & { thread: TodayMailThread }) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !isLast && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {thread.subject}
        </Text>
        <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {thread.snippet}
        </Text>
      </View>
    </Pressable>
  )
}

export function TodayBudgetRow({
  budget,
  isLast,
  onPress,
}: RowProps & { budget: TodayBudget }) {
  const { colors } = useAppTheme()
  const ratio = budget.monthlyLimit > 0 ? budget.spent / budget.monthlyLimit : 0
  const over = ratio > 1
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.budgetRow,
        !isLast && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.budgetHeader}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {budget.category}
        </Text>
        <Text style={[styles.rowSubtitle, { color: over ? colors.destructive : colors.textSecondary }]}>
          {formatCurrency(budget.spent, budget.currency as FinanceCurrency)} /{" "}
          {formatCurrency(budget.monthlyLimit, budget.currency as FinanceCurrency)}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: over ? colors.destructive : colors.accent,
              width: `${Math.min(ratio * 100, 100)}%`,
            },
          ]}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  colorBar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: radius.full,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: typography.footnote.fontSize,
  },
  priority: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "700",
  },
  budgetRow: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  budgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.full,
  },
})

// Shared rows for calendar views: events (color-coded by calendar) and
// overlaid tasks (first superapp integration — plan.md Phase 4).
import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { CheckCircle2, Circle, MapPin, Repeat } from "lucide-react-native"

import type { CalendarEvent, CalendarTask } from "@/lib/schemas/calendar.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

// ---------------------------------------------------------------------------
// Date/time formatting helpers (shared by calendar screens)
// ---------------------------------------------------------------------------

export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function formatEventTimeRange(event: Pick<CalendarEvent, "startTime" | "endTime" | "allDay">): string {
  if (event.allDay) return "All day"
  return `${formatEventTime(event.startTime)} – ${formatEventTime(event.endTime)}`
}

/** "Today", "Tomorrow", or "Mon, Jul 20". */
export function formatDayLabel(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  if (diffDays === -1) return "Yesterday"
  return target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

/** Local YYYY-MM-DD key for grouping by day. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
    .getDate()
    .toString()
    .padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// EventRow
// ---------------------------------------------------------------------------

interface EventRowProps {
  event: CalendarEvent
  /** Calendar color for the leading bar (falls back to accent). */
  color?: string | null
  onPress?: (event: CalendarEvent) => void
  /** Hide the time column (e.g. when a parent already shows it). */
  hideTime?: boolean
}

function EventRowInner({ event, color, onPress, hideTime = false }: EventRowProps) {
  const { colors } = useAppTheme()
  const barColor = color ?? colors.accent

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Event ${event.title}`}
      onPress={onPress ? () => onPress(event) : undefined}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {event.title}
          </Text>
          {event.rrule ? (
            <Repeat color={colors.textTertiary} size={13} strokeWidth={2} />
          ) : null}
        </View>
        {!hideTime ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatEventTimeRange(event)}
          </Text>
        ) : null}
        {event.location ? (
          <View style={styles.locationLine}>
            <MapPin color={colors.textTertiary} size={12} strokeWidth={2} />
            <Text style={[styles.location, { color: colors.textTertiary }]} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Memoized: list rows only re-render when their event data changes. */
export const EventRow = memo(EventRowInner)

// ---------------------------------------------------------------------------
// TaskOverlayRow — a to-do surfaced inside calendar views
// ---------------------------------------------------------------------------

interface TaskOverlayRowProps {
  task: CalendarTask
  onPress?: (task: CalendarTask) => void
}

function TaskOverlayRowInner({ task, onPress }: TaskOverlayRowProps) {
  const { colors } = useAppTheme()
  const Icon = task.isCompleted ? CheckCircle2 : Circle
  const tint = task.isCompleted
    ? colors.textTertiary
    : task.isDue
      ? colors.destructive
      : colors.accent

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`To-do ${task.title}`}
      onPress={onPress ? () => onPress(task) : undefined}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.taskIconWrap}>
        <Icon color={tint} size={18} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            {
              color: task.isCompleted ? colors.textTertiary : colors.text,
              textDecorationLine: task.isCompleted ? "line-through" : "none",
            },
          ]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <Text style={[styles.meta, { color: task.isDue ? colors.destructive : colors.textSecondary }]}>
          {task.isDue ? "Due" : "Scheduled"}
          {task.priority > 0 ? ` · P${task.priority}` : ""}
        </Text>
      </View>
    </Pressable>
  )
}

/** Memoized: list rows only re-render when their task data changes. */
export const TaskOverlayRow = memo(TaskOverlayRowInner)

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bar: {
    width: 4,
    borderRadius: radius.full,
    alignSelf: "stretch",
  },
  taskIconWrap: {
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 1,
    justifyContent: "center",
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  title: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  meta: {
    fontSize: typography.footnote.fontSize,
  },
  locationLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  location: {
    flexShrink: 1,
    fontSize: typography.footnote.fontSize,
  },
})

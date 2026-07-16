// Calendar tab — Month / Week / Agenda views with the to-do overlay
// (first superapp integration, plan.md Phase 4).
import { useCallback, useMemo, useState, type ComponentType } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  type LucideProps,
} from "lucide-react-native"

import { ScreenHeader } from "@/components/screen-header"
import { EmptyState } from "@/components/ui/empty-state"
import {
  EventRow,
  TaskOverlayRow,
  dayKey,
  formatDayLabel,
} from "@/components/calendar/event-row"
import { EventQuickEntrySheet } from "@/components/calendar/quick-entry-sheet"
import { useCalendars, useCreateCalendar, useCreateEvent, useEventsRange } from "@/hooks/use-calendar"
import type { CalendarEvent, CalendarTask } from "@/lib/schemas/calendar.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

type ViewMode = "month" | "week" | "agenda"

const VIEWS: { key: ViewMode; label: string; icon: ComponentType<LucideProps> }[] = [
  { key: "month", label: "Month", icon: CalendarDays },
  { key: "week", label: "Week", icon: CalendarRange },
  { key: "agenda", label: "Agenda", icon: List },
]

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"]
const AGENDA_DAYS = 30

// ---------------------------------------------------------------------------
// Date helpers (local time, Monday-start weeks)
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

/** Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const shift = (x.getDay() + 6) % 7 // Mon=0 … Sun=6
  return addDays(x, -shift)
}

function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b)
}

/** 42 cells (6 weeks) covering the month of `cursor`. */
function monthGridDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [mode, setMode] = useState<ViewMode>("month")
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()))
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()))
  const [showTasks, setShowTasks] = useState(true)
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)

  const calendarsQuery = useCalendars()
  const calendars = calendarsQuery.data ?? []
  const calendarColor = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const c of calendars) map.set(c.id, c.color)
    return map
  }, [calendars])

  const createEventMutation = useCreateEvent()
  const createCalendarMutation = useCreateCalendar()

  // Visible range per view mode.
  const range = useMemo(() => {
    if (mode === "month") {
      const days = monthGridDays(cursor)
      return { start: days[0]!, end: addDays(days[41]!, 1) }
    }
    if (mode === "week") {
      const start = startOfWeek(cursor)
      return { start, end: addDays(start, 7) }
    }
    const start = startOfDay(new Date())
    return { start, end: addDays(start, AGENDA_DAYS) }
  }, [mode, cursor])

  const eventsQuery = useEventsRange({
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    includeTasks: showTasks,
  })
  const events = eventsQuery.data?.events ?? []
  const tasks = (showTasks ? eventsQuery.data?.tasks : undefined) ?? []

  // Group by local day (events by start day; tasks by their surfaced date).
  const { eventsByDay, tasksByDay } = useMemo(() => {
    const e = new Map<string, CalendarEvent[]>()
    const t = new Map<string, CalendarTask[]>()
    for (const ev of events) {
      const key = dayKey(new Date(ev.startTime))
      if (!e.has(key)) e.set(key, [])
      e.get(key)!.push(ev)
    }
    for (const list of e.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? a.startTime.localeCompare(b.startTime) : a.allDay ? -1 : 1))
    }
    for (const task of tasks) {
      const key = dayKey(new Date(task.date))
      if (!t.has(key)) t.set(key, [])
      t.get(key)!.push(task)
    }
    return { eventsByDay: e, tasksByDay: t }
  }, [events, tasks])

  const openEvent = useCallback(
    (event: CalendarEvent) => router.push(`/calendar/event/${event.id}`),
    [router],
  )
  const openTask = useCallback(
    (task: CalendarTask) => router.push(`/todo/task/${task.id}`),
    [router],
  )

  const shiftCursor = (direction: 1 | -1) => {
    if (mode === "month") {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
      setCursor(next)
    } else {
      setCursor(addDays(startOfWeek(cursor), direction * 7))
    }
  }

  const goToday = () => {
    const today = startOfDay(new Date())
    setCursor(today)
    setSelected(today)
  }

  const openQuickEntry = () => {
    // First run: no calendars yet → create a default one, then open the sheet.
    if (calendars.length === 0 && !createCalendarMutation.isPending) {
      createCalendarMutation.mutate(
        { name: "Personal" },
        { onSuccess: () => setQuickEntryOpen(true) },
      )
      return
    }
    setQuickEntryOpen(true)
  }

  // -------------------------------------------------------------------------
  // Day list (events + task overlay for one day) — used by month + week
  // -------------------------------------------------------------------------

  const renderDayList = (day: Date) => {
    const key = dayKey(day)
    const dayEvents = eventsByDay.get(key) ?? []
    const dayTasks = tasksByDay.get(key) ?? []
    if (dayEvents.length === 0 && dayTasks.length === 0) {
      return (
        <View style={styles.dayEmpty}>
          <Text style={[styles.dayEmptyText, { color: colors.textTertiary }]}>
            Nothing on {formatDayLabel(day)}
          </Text>
        </View>
      )
    }
    return (
      <View style={[styles.dayCard, { backgroundColor: colors.surfaceSecondary }]}>
        {dayEvents.map((ev, i) => (
          <View key={`${ev.id}-${ev.startTime}`}>
            {i > 0 ? (
              <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} />
            ) : null}
            <EventRow event={ev} color={calendarColor.get(ev.calendarId)} onPress={openEvent} />
          </View>
        ))}
        {dayTasks.map((task, i) => (
          <View key={task.id}>
            {dayEvents.length > 0 || i > 0 ? (
              <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} />
            ) : null}
            <TaskOverlayRow task={task} onPress={openTask} />
          </View>
        ))}
      </View>
    )
  }

  // -------------------------------------------------------------------------
  // Month view
  // -------------------------------------------------------------------------

  const renderMonth = () => {
    const days = monthGridDays(cursor)
    const today = new Date()
    const weeks: Date[][] = []
    for (let i = 0; i < 6; i++) weeks.push(days.slice(i * 7, i * 7 + 7))

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.weekdayHeader}>
          {WEEKDAY_LETTERS.map((letter, i) => (
            <Text key={i} style={[styles.weekdayLetter, { color: colors.textTertiary }]}>
              {letter}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth()
              const isSelected = sameDay(day, selected)
              const isToday = sameDay(day, today)
              const key = dayKey(day)
              const dayEvents = eventsByDay.get(key) ?? []
              const hasTasks = (tasksByDay.get(key)?.length ?? 0) > 0
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${formatDayLabel(day)}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(startOfDay(day))}
                  style={styles.dayCell}
                >
                  <View
                    style={[
                      styles.dayNumberWrap,
                      isSelected ? { backgroundColor: colors.accent } : null,
                      !isSelected && isToday ? { backgroundColor: colors.accentMuted } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: isSelected
                            ? "#FFFFFF"
                            : isToday
                              ? colors.accent
                              : inMonth
                                ? colors.text
                                : colors.textTertiary,
                          fontWeight: isToday || isSelected ? "700" : "400",
                        },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dotRow}>
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          { backgroundColor: calendarColor.get(ev.calendarId) ?? colors.accent },
                        ]}
                      />
                    ))}
                    {hasTasks ? (
                      <View style={[styles.taskDot, { borderColor: colors.textTertiary }]} />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        ))}
        <Text style={[styles.dayListTitle, { color: colors.textTertiary }]}>
          {formatDayLabel(selected)}
        </Text>
        {renderDayList(selected)}
      </ScrollView>
    )
  }

  // -------------------------------------------------------------------------
  // Week view
  // -------------------------------------------------------------------------

  const renderWeek = () => {
    const weekStart = startOfWeek(cursor)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const today = new Date()

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.weekStrip}>
          {days.map((day, i) => {
            const isSelected = sameDay(day, selected)
            const isToday = sameDay(day, today)
            const key = dayKey(day)
            const count =
              (eventsByDay.get(key)?.length ?? 0) + (tasksByDay.get(key)?.length ?? 0)
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Select ${formatDayLabel(day)}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelected(startOfDay(day))}
                style={[
                  styles.weekDayCell,
                  { backgroundColor: isSelected ? colors.accent : colors.surfaceSecondary },
                ]}
              >
                <Text
                  style={[
                    styles.weekDayLetter,
                    { color: isSelected ? "rgba(255,255,255,0.8)" : colors.textTertiary },
                  ]}
                >
                  {WEEKDAY_LETTERS[i]}
                </Text>
                <Text
                  style={[
                    styles.weekDayNumber,
                    {
                      color: isSelected ? "#FFFFFF" : isToday ? colors.accent : colors.text,
                    },
                  ]}
                >
                  {day.getDate()}
                </Text>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        count > 0
                          ? isSelected
                            ? "#FFFFFF"
                            : colors.accent
                          : "transparent",
                    },
                  ]}
                />
              </Pressable>
            )
          })}
        </View>
        <Text style={[styles.dayListTitle, { color: colors.textTertiary }]}>
          {formatDayLabel(selected)}
        </Text>
        {renderDayList(selected)}
      </ScrollView>
    )
  }

  // -------------------------------------------------------------------------
  // Agenda view — next 30 days, only days with content
  // -------------------------------------------------------------------------

  const renderAgenda = () => {
    const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(startOfDay(new Date()), i))
    const withContent = days.filter((day) => {
      const key = dayKey(day)
      return (eventsByDay.get(key)?.length ?? 0) > 0 || (tasksByDay.get(key)?.length ?? 0) > 0
    })

    if (withContent.length === 0) {
      return (
        <EmptyState
          icon={CalendarDays}
          title="Nothing coming up"
          description={`No events${showTasks ? " or dated to-dos" : ""} in the next ${AGENDA_DAYS} days. Tap + to add one.`}
        />
      )
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {withContent.map((day) => (
          <View key={dayKey(day)}>
            <Text style={[styles.dayListTitle, { color: colors.textTertiary }]}>
              {formatDayLabel(day)}
            </Text>
            {renderDayList(day)}
          </View>
        ))}
      </ScrollView>
    )
  }

  // -------------------------------------------------------------------------

  const periodLabel =
    mode === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : mode === "week"
        ? `${startOfWeek(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(startOfWeek(cursor), 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : `Next ${AGENDA_DAYS} days`

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Calendar"
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search events"
              hitSlop={8}
              onPress={() => router.push("/calendar/search")}
            >
              <Search color={colors.textSecondary} size={22} strokeWidth={1.75} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage calendars"
              hitSlop={8}
              onPress={() => router.push("/calendar/calendars")}
            >
              <SlidersHorizontal color={colors.textSecondary} size={22} strokeWidth={1.75} />
            </Pressable>
          </>
        }
      />

      {/* View switcher + task overlay toggle */}
      <View style={styles.viewBar}>
        {VIEWS.map(({ key, label, icon: Icon }) => {
          const active = key === mode
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setMode(key)}
              style={[
                styles.viewChip,
                { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
              ]}
            >
              <Icon color={active ? "#FFFFFF" : colors.textSecondary} size={14} strokeWidth={2} />
              <Text
                style={[styles.viewChipText, { color: active ? "#FFFFFF" : colors.textSecondary }]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
        <View style={styles.viewBarSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showTasks ? "Hide to-dos" : "Show to-dos"}
          accessibilityState={{ selected: showTasks }}
          hitSlop={8}
          onPress={() => setShowTasks((v) => !v)}
          style={[
            styles.taskToggle,
            { backgroundColor: showTasks ? colors.accentMuted : colors.surfaceSecondary },
          ]}
        >
          <CheckCircle2
            color={showTasks ? colors.accent : colors.textTertiary}
            size={16}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      {/* Period navigator */}
      <View style={styles.periodBar}>
        {mode !== "agenda" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            hitSlop={8}
            onPress={() => shiftCursor(-1)}
          >
            <ChevronLeft color={colors.textSecondary} size={20} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.chevronPlaceholder} />
        )}
        <Text style={[styles.periodLabel, { color: colors.text }]}>{periodLabel}</Text>
        {mode !== "agenda" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            hitSlop={8}
            onPress={() => shiftCursor(1)}
          >
            <ChevronRight color={colors.textSecondary} size={20} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.chevronPlaceholder} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          hitSlop={8}
          onPress={goToday}
          style={[styles.todayButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <Text style={[styles.todayButtonText, { color: colors.accent }]}>Today</Text>
        </Pressable>
      </View>

      {eventsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : mode === "month" ? (
        renderMonth()
      ) : mode === "week" ? (
        renderWeek()
      ) : (
        renderAgenda()
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New event"
        onPress={openQuickEntry}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
      </Pressable>

      <EventQuickEntrySheet
        visible={quickEntryOpen}
        onClose={() => setQuickEntryOpen(false)}
        calendars={calendars}
        defaultDate={selected}
        submitting={createEventMutation.isPending}
        onSubmit={(input) =>
          createEventMutation.mutate(input, { onSuccess: () => setQuickEntryOpen(false) })
        }
      />
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
  viewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  viewBarSpacer: { flex: 1 },
  viewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  viewChipText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  taskToggle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  periodBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chevronPlaceholder: { width: 20 },
  periodLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: typography.headline.fontSize,
    fontWeight: "600",
  },
  todayButton: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 4,
  },
  todayButtonText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  scrollContent: {
    paddingBottom: 96,
  },
  weekdayHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
  },
  weekdayLetter: {
    flex: 1,
    textAlign: "center",
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  weekRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
    gap: 2,
  },
  dayNumberWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumber: {
    fontSize: typography.subheadline.fontSize,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
  },
  taskDot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  weekStrip: {
    flexDirection: "row",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  weekDayCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  weekDayLetter: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  weekDayNumber: {
    fontSize: typography.headline.fontSize,
    fontWeight: "600",
  },
  dayListTitle: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  dayCard: {
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 32,
  },
  dayEmpty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayEmptyText: {
    fontSize: typography.subheadline.fontSize,
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

// To-Do tab — Things 3-style views (Today, Upcoming, Anytime, Someday, Logbook).
import { useCallback, useMemo, useState, type ComponentType } from "react"
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
  Archive,
  CalendarClock,
  CheckCircle2,
  Layers,
  ListTodo,
  Moon,
  Plus,
  Star,
  Sun,
  Trash2,
  type LucideProps,
} from "lucide-react-native"

import { ScreenHeader } from "@/components/screen-header"
import { EmptyState } from "@/components/ui/empty-state"
import { SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row"
import { QuickEntrySheet } from "@/components/todo/quick-entry-sheet"
import { TaskRow, formatTaskDate } from "@/components/todo/task-row"
import {
  taskKeys,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  usePatchTask,
  useTaskCounts,
  useTasksByView,
  useUncompleteTask,
} from "@/hooks/use-tasks"
import type { Task, TaskView } from "@/lib/schemas/task.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const VIEWS: { key: TaskView; label: string; icon: ComponentType<LucideProps> }[] = [
  { key: "today", label: "Today", icon: Star },
  { key: "upcoming", label: "Upcoming", icon: CalendarClock },
  { key: "anytime", label: "Anytime", icon: Layers },
  { key: "someday", label: "Someday", icon: Moon },
  { key: "logbook", label: "Logbook", icon: CheckCircle2 },
]

const EMPTY_COPY: Record<TaskView, { title: string; description: string }> = {
  today: {
    title: "All clear for today",
    description: "Tap + to add a to-do, or pull tasks in from Upcoming.",
  },
  upcoming: {
    title: "Nothing scheduled",
    description: "To-dos with a future date show up here.",
  },
  anytime: {
    title: "Nothing in Anytime",
    description: "Undated, actionable to-dos live here.",
  },
  someday: {
    title: "No someday items",
    description: "Park ideas here until you are ready for them.",
  },
  logbook: {
    title: "Logbook is empty",
    description: "Completed to-dos are collected here.",
  },
}

/** ISO datetime at 09:00 local for a day offset from now. */
function isoAtNine(dayOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** Flattened rows: Upcoming gets Things-style day section headers. */
type Row =
  | { type: "header"; key: string; label: string }
  | { type: "task"; key: string; task: Task }

function buildRows(view: TaskView, tasks: Task[]): Row[] {
  if (view !== "upcoming") {
    return tasks.map((t) => ({ type: "task" as const, key: t.id, task: t }))
  }
  const rows: Row[] = []
  let lastLabel: string | null = null
  for (const task of tasks) {
    const iso = task.scheduledDate ?? task.dueDate
    const label = iso ? formatTaskDate(iso) : "Later"
    if (label !== lastLabel) {
      rows.push({ type: "header", key: `h-${label}`, label })
      lastLabel = label
    }
    rows.push({ type: "task", key: task.id, task })
  }
  return rows
}

export default function TodoScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [view, setView] = useState<TaskView>("today")
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)

  const tasksQuery = useTasksByView(view)
  const todayCount = useTaskCounts()
  const activeKey = taskKeys.view(view)

  const completeMutation = useCompleteTask(activeKey)
  const uncompleteMutation = useUncompleteTask(activeKey)
  const deleteMutation = useDeleteTask()
  const patchMutation = usePatchTask()
  const createMutation = useCreateTask()

  const tasks = tasksQuery.data ?? []
  const rows = useMemo(() => buildRows(view, tasks), [view, tasks])

  const onToggle = useCallback(
    (task: Task) => {
      if (task.isCompleted) uncompleteMutation.mutate(task.id)
      else completeMutation.mutate(task.id)
    },
    [completeMutation, uncompleteMutation],
  )

  const swipeActionsFor = useCallback(
    (task: Task): { right: SwipeAction[]; left: SwipeAction[] } => {
      const right: SwipeAction[] = [
        {
          label: "Delete",
          icon: Trash2,
          color: colors.destructive,
          onPress: () => deleteMutation.mutate(task.id),
        },
      ]
      if (view === "logbook") return { right, left: [] }

      const left: SwipeAction[] =
        view === "today"
          ? [
              {
                label: "Someday",
                icon: Archive,
                color: colors.warning,
                onPress: () =>
                  patchMutation.mutate({
                    id: task.id,
                    input: { isSomeday: true, scheduledDate: null, dueDate: null },
                  }),
              },
            ]
          : [
              {
                label: "Today",
                icon: Sun,
                color: colors.accent,
                onPress: () =>
                  patchMutation.mutate({
                    id: task.id,
                    input: { scheduledDate: isoAtNine(0), isSomeday: false },
                  }),
              },
            ]
      return { right, left }
    },
    [view, colors, deleteMutation, patchMutation],
  )

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "header") {
        return (
          <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>{item.label}</Text>
        )
      }
      const { right, left } = swipeActionsFor(item.task)
      return (
        <SwipeableRow rightActions={right} leftActions={left}>
          <TaskRow
            task={item.task}
            onToggle={onToggle}
            onPress={(t) => router.push(`/todo/task/${t.id}`)}
            hideDate={view === "today" || view === "upcoming"}
          />
        </SwipeableRow>
      )
    },
    [swipeActionsFor, onToggle, router, view, colors.textTertiary],
  )

  const empty = EMPTY_COPY[view]
  const ActiveEmptyIcon = VIEWS.find((v) => v.key === view)?.icon ?? Star

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="To-Do"
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage lists"
            hitSlop={8}
            onPress={() => router.push("/todo/lists")}
          >
            <ListTodo color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
        }
      />

      <View style={styles.viewBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.viewBar}
        >
          {VIEWS.map(({ key, label, icon: Icon }) => {
            const active = key === view
            const badge = key === "today" ? (todayCount.data ?? 0) : 0
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setView(key)}
                style={[
                  styles.viewChip,
                  { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                ]}
              >
                <Icon color={active ? "#FFFFFF" : colors.textSecondary} size={14} strokeWidth={2} />
                <Text
                  style={[
                    styles.viewChipText,
                    { color: active ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
                {badge > 0 ? (
                  <View
                    style={[
                      styles.viewBadge,
                      { backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.accentMuted },
                    ]}
                  >
                    <Text
                      style={[styles.viewBadgeText, { color: active ? "#FFFFFF" : colors.accent }]}
                    >
                      {badge > 99 ? "99+" : badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {tasksQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState icon={ActiveEmptyIcon} title={empty.title} description={empty.description} />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          refreshControl={
            <RefreshControl
              refreshing={tasksQuery.isRefetching}
              onRefresh={() => tasksQuery.refetch()}
              tintColor={colors.accent}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New to-do"
        onPress={() => setQuickEntryOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
      </Pressable>

      <QuickEntrySheet
        visible={quickEntryOpen}
        onClose={() => setQuickEntryOpen(false)}
        submitting={createMutation.isPending}
        onSubmit={(input) => {
          // Creating from Today defaults undated tasks to today; from Someday, park them.
          const patched = { ...input }
          if (view === "today" && !patched.scheduledDate && !patched.isSomeday) {
            patched.scheduledDate = isoAtNine(0)
          }
          if (view === "someday" && !patched.scheduledDate) {
            patched.isSomeday = true
          }
          createMutation.mutate(patched, { onSuccess: () => setQuickEntryOpen(false) })
        }}
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
  viewBarWrap: {
    paddingBottom: spacing.sm,
  },
  viewBar: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    flexDirection: "row",
  },
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
  viewBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  viewBadgeText: {
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
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

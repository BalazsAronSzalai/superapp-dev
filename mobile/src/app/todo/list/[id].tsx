// Single-list view — open tasks for a specific list, with quick entry.
import { useCallback, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { ListTodo, Plus, Sun, Trash2 } from "lucide-react-native"

import { EmptyState } from "@/components/ui/empty-state"
import { getListSeparator } from "@/components/ui/list-separator"
import { SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row"
import { QuickEntrySheet } from "@/components/todo/quick-entry-sheet"
import { TaskRow } from "@/components/todo/task-row"
import {
  taskKeys,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  usePatchTask,
  useTaskLists,
  useTasksByList,
  useUncompleteTask,
} from "@/hooks/use-tasks"
import type { Task } from "@/lib/schemas/task.schemas"
import { radius, spacing, useAppTheme } from "@/theme"

/** Stable separator component type — see list-separator.tsx (FlashList perf). */
const Separator = getListSeparator(52)

function isoAtNineToday(): string {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export default function ListDetailScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const listsQuery = useTaskLists()
  const tasksQuery = useTasksByList(id)
  const activeKey = taskKeys.byList(id ?? "")

  const completeMutation = useCompleteTask(activeKey)
  const uncompleteMutation = useUncompleteTask(activeKey)
  const deleteMutation = useDeleteTask()
  const patchMutation = usePatchTask()
  const createMutation = useCreateTask()

  const [quickEntryOpen, setQuickEntryOpen] = useState(false)

  const list = listsQuery.data?.find((l) => l.id === id)
  const tasks = tasksQuery.data ?? []

  const onToggle = useCallback(
    (task: Task) => {
      if (task.isCompleted) uncompleteMutation.mutate(task.id)
      else completeMutation.mutate(task.id)
    },
    [completeMutation, uncompleteMutation],
  )

  const renderItem = useCallback(
    ({ item }: { item: Task }) => {
      const right: SwipeAction[] = [
        {
          label: "Delete",
          icon: Trash2,
          color: colors.destructive,
          onPress: () => deleteMutation.mutate(item.id),
        },
      ]
      const left: SwipeAction[] = [
        {
          label: "Today",
          icon: Sun,
          color: colors.accent,
          onPress: () =>
            patchMutation.mutate({
              id: item.id,
              input: { scheduledDate: isoAtNineToday(), isSomeday: false },
            }),
        },
      ]
      return (
        <SwipeableRow rightActions={right} leftActions={left}>
          <TaskRow
            task={item}
            onToggle={onToggle}
            onPress={(t) => router.push(`/todo/task/${t.id}`)}
          />
        </SwipeableRow>
      )
    },
    [colors, deleteMutation, patchMutation, onToggle, router],
  )

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: list?.name ?? "List" }} />

      {tasksQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No to-dos in this list"
          description="Tap + to add the first one."
        />
      ) : (
        <FlashList
          data={tasks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={tasksQuery.isRefetching}
              onRefresh={() => tasksQuery.refetch()}
              tintColor={colors.accent}
            />
          }
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New to-do in list"
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
        listId={id}
        submitting={createMutation.isPending}
        onSubmit={(input) =>
          createMutation.mutate(input, { onSuccess: () => setQuickEntryOpen(false) })
        }
      />
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

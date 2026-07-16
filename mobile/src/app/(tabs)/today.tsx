import { useCallback } from "react"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { CalendarDays, ChevronRight, Mail, Search, Sun, Wallet } from "lucide-react-native"

import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ScreenHeader } from "@/components/screen-header"
import { TodayEventRow, TodayTaskRow, TodayThreadRow, TodayBudgetRow } from "@/components/today/today-rows"
import { useToday } from "@/hooks/use-glue"
import { formatCurrency } from "@/lib/money"
import { spacing, typography, useAppTheme } from "@/theme"

function SectionHeader({
  title,
  onPress,
  accessory,
}: {
  title: string
  onPress?: () => void
  accessory?: string
}) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={styles.sectionHeader}
    >
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>
      <View style={styles.sectionAccessory}>
        {accessory ? (
          <Text style={[styles.sectionAccessoryText, { color: colors.textSecondary }]}>
            {accessory}
          </Text>
        ) : null}
        {onPress ? <ChevronRight color={colors.textTertiary} size={16} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  )
}

export default function TodayScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const todayQuery = useToday()
  const data = todayQuery.data

  const onRefresh = useCallback(() => {
    todayQuery.refetch()
  }, [todayQuery])

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  const isEmpty =
    data &&
    data.events.length === 0 &&
    data.tasks.length === 0 &&
    data.unreadThreads.length === 0 &&
    data.budgets.length === 0

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScreenHeader
        title="Today"
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Universal search"
            hitSlop={8}
            onPress={() => router.push("/search")}
          >
            <Search color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={todayQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.textTertiary}
          />
        }
      >
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{dateLabel}</Text>

        {isEmpty ? (
          <EmptyState
            icon={Sun}
            title="All clear"
            description="No events, due tasks, or unread mail today."
          />
        ) : null}

        {data && data.events.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Agenda" onPress={() => router.push("/calendar")} />
            <Card style={styles.listCard}>
              {data.events.map((event, i) => (
                <TodayEventRow
                  key={`${event.id}-${event.startTime}`}
                  event={event}
                  isLast={i === data.events.length - 1}
                  onPress={() => router.push(`/calendar/event/${event.id}`)}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {data && data.tasks.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Tasks"
              accessory={`${data.tasks.length}`}
              onPress={() => router.push("/todo")}
            />
            <Card style={styles.listCard}>
              {data.tasks.map((task, i) => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  isLast={i === data.tasks.length - 1}
                  onPress={() => router.push(`/todo/task/${task.id}`)}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {data && data.unreadCount > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Unread mail"
              accessory={`${data.unreadCount}`}
              onPress={() => router.push("/mail")}
            />
            {data.unreadThreads.length > 0 ? (
              <Card style={styles.listCard}>
                {data.unreadThreads.map((thread, i) => (
                  <TodayThreadRow
                    key={thread.id}
                    thread={thread}
                    isLast={i === data.unreadThreads.length - 1}
                    onPress={() => router.push(`/mail/thread/${thread.id}`)}
                  />
                ))}
              </Card>
            ) : (
              <Card>
                <View style={styles.inlineRow}>
                  <Mail color={colors.textTertiary} size={18} strokeWidth={1.75} />
                  <Text style={{ color: colors.textSecondary }}>
                    {data.unreadCount} unread conversations
                  </Text>
                </View>
              </Card>
            )}
          </View>
        ) : null}

        {data ? (
          <View style={styles.section}>
            <SectionHeader title="Spending" onPress={() => router.push("/finance")} />
            <Card style={styles.listCard}>
              <View style={[styles.inlineRow, styles.spendRow]}>
                <View style={styles.inlineRow}>
                  <Wallet color={colors.textTertiary} size={18} strokeWidth={1.75} />
                  <Text style={{ color: colors.textSecondary }}>This month</Text>
                </View>
                <Text style={[styles.spendAmount, { color: colors.text }]}>
                  {formatCurrency(data.monthSpend, "HUF")}
                </Text>
              </View>
              {data.budgets.map((budget, i) => (
                <TodayBudgetRow
                  key={budget.id}
                  budget={budget}
                  isLast={i === data.budgets.length - 1}
                  onPress={() => router.push("/finance/budgets")}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {todayQuery.isLoading ? (
          <EmptyState icon={CalendarDays} title="Loading your day…" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  dateLabel: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionAccessory: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sectionAccessoryText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  spendRow: {
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  spendAmount: {
    fontSize: typography.headline.fontSize,
    fontWeight: "600",
  },
})

// Spending analytics — monthly trend, category breakdown, recurring detection.
import { useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { BellPlus, ChevronLeft, ChevronRight, Repeat } from "lucide-react-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { CategoryBreakdown, TrendChart } from "@/components/finance/charts"
import {
  useCreateRecurringReminder,
  useFinanceSummary,
  useRecurring,
} from "@/hooks/use-finance"
import { formatCurrency } from "@/lib/money"
import type { RecurringSeries } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** "2026-07" for the current month, offset by `delta` months. */
function monthKey(delta: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map((v) => Number.parseInt(v, 10))
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

function intervalLabel(days: number): string {
  if (days <= 9) return "Weekly"
  if (days <= 45) return "Monthly"
  if (days <= 120) return "Quarterly"
  return "Yearly"
}

export default function AnalyticsScreen() {
  const { colors } = useAppTheme()

  /** 0 = current month, negative = past months. */
  const [monthDelta, setMonthDelta] = useState(0)
  const month = monthKey(monthDelta)

  const summaryQuery = useFinanceSummary(month)
  const recurringQuery = useRecurring()
  const reminderMutation = useCreateRecurringReminder()

  const summary = summaryQuery.data
  const series = recurringQuery.data ?? []

  const createReminder = (item: RecurringSeries) => {
    reminderMutation.mutate(
      {
        merchant: item.merchant,
        amount: item.averageAmount,
        currency: item.currency,
        dueDate: item.nextExpectedDate,
      },
      {
        onSuccess: (data) =>
          Alert.alert("Reminder created", `"${data.task.title}" was added to your To-Do list.`),
      },
    )
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          onPress={() => setMonthDelta((d) => d - 1)}
        >
          <ChevronLeft color={colors.accent} size={24} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.text }]}>{monthLabel(month)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          disabled={monthDelta >= 0}
          onPress={() => setMonthDelta((d) => Math.min(0, d + 1))}
          style={{ opacity: monthDelta >= 0 ? 0.3 : 1 }}
        >
          <ChevronRight color={colors.accent} size={24} strokeWidth={2} />
        </Pressable>
      </View>

      {summaryQuery.isLoading || !summary ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          {/* Income / spending stat cards */}
          <View style={styles.statRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Income</Text>
              <Text style={[styles.statValue, { color: colors.success }]} numberOfLines={1}>
                {formatCurrency(summary.monthIncome, summary.baseCurrency)}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Spending</Text>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                {formatCurrency(summary.monthSpending, summary.baseCurrency)}
              </Text>
            </View>
          </View>

          {/* 6-month trend */}
          {summary.monthlyTrend.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Income vs spending
              </Text>
              <TrendChart trend={summary.monthlyTrend} />
            </View>
          ) : null}

          {/* Category breakdown */}
          {summary.spendingByCategory.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Spending by category
              </Text>
              <CategoryBreakdown
                spending={summary.spendingByCategory}
                currency={summary.baseCurrency}
              />
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              No spending recorded for {monthLabel(month)}.
            </Text>
          )}
        </>
      )}

      {/* Recurring payments */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recurring payments</Text>
        {recurringQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : series.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            No recurring payments detected yet. They show up after at least three similar
            charges from the same merchant.
          </Text>
        ) : (
          <View style={styles.recurringList}>
            {series.map((item) => {
              const meta = categoryMeta(item.category)
              const Icon = item.category ? meta.icon : Repeat
              return (
                <View
                  key={item.key}
                  style={[styles.recurringRow, { backgroundColor: colors.surfaceSecondary }]}
                >
                  <View
                    style={[styles.recurringIcon, { backgroundColor: withAlpha(meta.color, 0.15) }]}
                  >
                    <Icon color={meta.color} size={18} strokeWidth={2} />
                  </View>
                  <View style={styles.recurringMain}>
                    <Text style={[styles.recurringName, { color: colors.text }]} numberOfLines={1}>
                      {item.merchant}
                    </Text>
                    <Text
                      style={[styles.recurringMeta, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {intervalLabel(item.intervalDays)} ·{" "}
                      {formatCurrency(item.averageAmount, item.currency)} · next{" "}
                      {new Date(item.nextExpectedDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Create reminder for ${item.merchant}`}
                    onPress={() => createReminder(item)}
                    disabled={reminderMutation.isPending}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <BellPlus color={colors.accent} size={20} strokeWidth={2} />
                  </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  center: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthTitle: {
    fontSize: typography.title3.fontSize,
    fontWeight: "600",
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm + 4,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: typography.title2.fontSize,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  section: {
    gap: spacing.sm + 4,
  },
  sectionTitle: {
    fontSize: typography.title3.fontSize,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: typography.subheadline.fontSize,
    lineHeight: 20,
  },
  recurringList: {
    gap: spacing.sm,
  },
  recurringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  recurringIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  recurringMain: {
    flex: 1,
    gap: 2,
  },
  recurringName: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  recurringMeta: {
    fontSize: typography.footnote.fontSize,
  },
})

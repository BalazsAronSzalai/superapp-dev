// Spending analytics charts (victory-native v41, Skia-based; plan.md Phase 6).
import { useMemo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { BarGroup, CartesianChart } from "victory-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { formatCompact, formatCurrency } from "@/lib/money"
import type { CategorySpend, FinanceCurrency, MonthSpend } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

// ---------------------------------------------------------------------------
// Monthly income vs spending trend (grouped bars, last 6 months)
// ---------------------------------------------------------------------------

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-07" → "Jul" */
function shortMonth(month: string): string {
  const idx = Number.parseInt(month.slice(5, 7), 10) - 1
  return MONTH_LABELS[idx] ?? month
}

interface TrendChartProps {
  trend: MonthSpend[]
}

export function TrendChart({ trend }: TrendChartProps) {
  const { colors } = useAppTheme()

  const data = useMemo(
    () => trend.map((m, idx) => ({ idx, income: m.income, spending: m.spending })),
    [trend],
  )

  if (data.length === 0) return null

  const peak = Math.max(1, ...trend.map((m) => Math.max(m.income, m.spending)))

  return (
    <View style={styles.trendWrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Spending</Text>
        </View>
        <View style={styles.legendSpacer} />
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>
          peak {formatCompact(peak)}
        </Text>
      </View>

      <View style={styles.chart}>
        <CartesianChart
          data={data}
          xKey="idx"
          yKeys={["income", "spending"]}
          domainPadding={{ left: 24, right: 24 }}
          domain={{ y: [0, peak * 1.05] }}
        >
          {({ points, chartBounds }) => (
            <BarGroup
              chartBounds={chartBounds}
              betweenGroupPadding={0.35}
              withinGroupPadding={0.15}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
            >
              <BarGroup.Bar points={points.income} color={colors.success} />
              <BarGroup.Bar points={points.spending} color={colors.accent} />
            </BarGroup>
          )}
        </CartesianChart>
      </View>

      {/* Month labels rendered outside the Skia canvas (no font asset needed). */}
      <View style={styles.monthRow}>
        {trend.map((m) => (
          <Text
            key={m.month}
            style={[styles.monthLabel, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {shortMonth(m.month)}
          </Text>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Category breakdown (horizontal proportion bars)
// ---------------------------------------------------------------------------

interface CategoryBreakdownProps {
  spending: CategorySpend[]
  currency: FinanceCurrency
  /** Show at most this many categories, the rest collapse into "Other". */
  maxRows?: number
}

export function CategoryBreakdown({ spending, currency, maxRows = 6 }: CategoryBreakdownProps) {
  const { colors } = useAppTheme()

  const total = spending.reduce((sum, s) => sum + s.total, 0)
  const rows = spending.slice(0, maxRows)

  if (total <= 0 || rows.length === 0) return null

  return (
    <View style={styles.breakdown}>
      {/* Stacked proportion bar */}
      <View style={[styles.stackTrack, { backgroundColor: colors.surfaceSecondary }]}>
        {rows.map((row) => {
          const meta = categoryMeta(row.category)
          return (
            <View
              key={row.category}
              style={{
                backgroundColor: meta.color,
                width: `${Math.max(1, (row.total / total) * 100)}%`,
              }}
            />
          )
        })}
      </View>

      {rows.map((row) => {
        const meta = categoryMeta(row.category)
        const Icon = meta.icon
        const share = Math.round((row.total / total) * 100)
        return (
          <View key={row.category} style={styles.breakdownRow}>
            <View style={[styles.breakdownIcon, { backgroundColor: withAlpha(meta.color, 0.15) }]}>
              <Icon color={meta.color} size={16} strokeWidth={2} />
            </View>
            <Text style={[styles.breakdownLabel, { color: colors.text }]} numberOfLines={1}>
              {meta.label}
            </Text>
            <Text style={[styles.breakdownShare, { color: colors.textTertiary }]}>{share}%</Text>
            <Text style={[styles.breakdownAmount, { color: colors.textSecondary }]}>
              {formatCurrency(row.total, currency)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  trendWrap: {
    gap: spacing.sm,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  legendSpacer: {
    flex: 1,
  },
  legendText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "500",
  },
  chart: {
    height: 160,
  },
  monthRow: {
    flexDirection: "row",
  },
  monthLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: typography.caption.fontSize,
    fontWeight: "500",
  },
  breakdown: {
    gap: spacing.sm,
  },
  stackTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: radius.full,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  breakdownIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownLabel: {
    flex: 1,
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  breakdownShare: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    width: 40,
    textAlign: "right",
  },
  breakdownAmount: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
    minWidth: 90,
    textAlign: "right",
  },
})

// Monthly category budget with progress bar (over-budget turns destructive).
import { Pressable, StyleSheet, Text, View } from "react-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { formatCurrency } from "@/lib/money"
import type { Budget } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

interface BudgetRowProps {
  budget: Budget
  onPress?: (budget: Budget) => void
}

export function BudgetRow({ budget, onPress }: BudgetRowProps) {
  const { colors } = useAppTheme()
  const meta = categoryMeta(budget.category)
  const Icon = meta.icon

  const ratio = budget.monthlyLimit > 0 ? budget.spent / budget.monthlyLimit : 0
  const over = ratio > 1
  const barColor = over ? colors.destructive : ratio > 0.85 ? colors.warning : meta.color

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Budget ${meta.label}: ${formatCurrency(budget.spent, budget.currency)} of ${formatCurrency(budget.monthlyLimit, budget.currency)}`}
      onPress={() => onPress?.(budget)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(meta.color, 0.15) }]}>
        <Icon color={meta.color} size={18} strokeWidth={2} />
      </View>
      <View style={styles.main}>
        <View style={styles.topRow}>
          <Text style={[styles.label, { color: colors.text }]}>{meta.label}</Text>
          <Text style={[styles.amounts, { color: over ? colors.destructive : colors.textSecondary }]}>
            {formatCurrency(budget.spent, budget.currency)}
            <Text style={{ color: colors.textTertiary }}>
              {" / "}
              {formatCurrency(budget.monthlyLimit, budget.currency)}
            </Text>
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: barColor, width: `${Math.min(100, Math.round(ratio * 100))}%` },
            ]}
          />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  amounts: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.full,
  },
})

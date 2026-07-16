// Revolut-style transaction feed row: category icon, merchant, date, amount.
import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Repeat } from "lucide-react-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { formatSignedAmount } from "@/lib/money"
import type { Transaction } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** "Today", "Yesterday", else "Jan 5" (with year when not current). */
export function formatTransactionDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? null : { year: "numeric" }),
  })
}

interface TransactionRowProps {
  transaction: Transaction
  onPress?: (transaction: Transaction) => void
}

function TransactionRowInner({ transaction, onPress }: TransactionRowProps) {
  const { colors } = useAppTheme()
  const meta = categoryMeta(transaction.category)
  const Icon = meta.icon
  const title = transaction.merchant || transaction.description || meta.label
  const isCredit = transaction.type === "credit"

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Transaction ${title}, ${formatSignedAmount(transaction.amount, transaction.currency, transaction.type)}`}
      onPress={() => onPress?.(transaction)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(meta.color, 0.15) }]}>
        <Icon color={meta.color} size={20} strokeWidth={2} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subRow}>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
            {formatTransactionDate(transaction.date)}
            {transaction.category ? ` · ${meta.label}` : ""}
          </Text>
          {transaction.isRecurring ? (
            <Repeat color={colors.textTertiary} size={12} strokeWidth={2} />
          ) : null}
        </View>
      </View>
      <Text
        style={[styles.amount, { color: isCredit ? colors.success : colors.text }]}
        numberOfLines={1}
      >
        {formatSignedAmount(transaction.amount, transaction.currency, transaction.type)}
      </Text>
    </Pressable>
  )
}

export const TransactionRow = memo(TransactionRowInner)

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  subtitle: {
    fontSize: typography.footnote.fontSize,
    flexShrink: 1,
  },
  amount: {
    fontSize: typography.body.fontSize,
    fontWeight: "600",
  },
})

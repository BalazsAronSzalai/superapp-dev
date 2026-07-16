// Dashboard account carousel card (Revolut/OTP-inspired).
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Banknote, CreditCard, Landmark, PiggyBank, type LucideIcon } from "lucide-react-native"

import { formatCurrency } from "@/lib/money"
import type { FinanceAccount, FinanceAccountType } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

export const ACCOUNT_TYPE_META: Record<FinanceAccountType, { label: string; icon: LucideIcon }> = {
  checking: { label: "Checking", icon: Landmark },
  savings: { label: "Savings", icon: PiggyBank },
  cash: { label: "Cash", icon: Banknote },
  card: { label: "Card", icon: CreditCard },
}

/** Default card tints when the account has no custom color. */
const DEFAULT_COLORS: Record<FinanceAccountType, string> = {
  checking: "#007AFF",
  savings: "#34C759",
  cash: "#FF9500",
  card: "#5856D6",
}

export function accountColor(account: FinanceAccount): string {
  return account.color ?? DEFAULT_COLORS[account.type]
}

interface AccountCardProps {
  account: FinanceAccount
  onPress?: (account: FinanceAccount) => void
}

export function AccountCard({ account, onPress }: AccountCardProps) {
  const { colors } = useAppTheme()
  const meta = ACCOUNT_TYPE_META[account.type]
  const Icon = meta.icon
  const tint = accountColor(account)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Account ${account.name}, balance ${formatCurrency(account.balance, account.currency)}`}
      onPress={() => onPress?.(account)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tint, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Icon color="#FFFFFF" size={18} strokeWidth={2} />
        </View>
        <Text style={styles.type}>{meta.label}</Text>
        {account.isArchived ? (
          <View style={[styles.archivedBadge, { backgroundColor: colors.background }]}>
            <Text style={[styles.archivedText, { color: colors.textSecondary }]}>Archived</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {account.name}
      </Text>
      <Text style={styles.balance} numberOfLines={1}>
        {formatCurrency(account.balance, account.currency)}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  type: {
    flex: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  archivedBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  archivedText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  name: {
    color: "rgba(255,255,255,0.9)",
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  balance: {
    color: "#FFFFFF",
    fontSize: typography.title2.fontSize,
    fontWeight: "700",
  },
})

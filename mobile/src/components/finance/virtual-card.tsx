// Mock virtual card visual with freeze overlay (plan.md Phase 6, mock-first).
import { StyleSheet, Text, View } from "react-native"
import { Snowflake, Wifi } from "lucide-react-native"

import type { FinanceCard } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography } from "@/theme"

interface VirtualCardProps {
  card: FinanceCard
  /** Account tint used as the card face color. */
  color: string
  /** Account name shown under the label. */
  accountName?: string
}

export function VirtualCard({ card, color, accountName }: VirtualCardProps) {
  const expiry = `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear % 100).padStart(2, "0")}`

  return (
    <View
      accessibilityLabel={`Virtual card ${card.label}, ending in ${card.last4}${card.isFrozen ? ", frozen" : ""}`}
      style={[styles.card, { backgroundColor: color, opacity: card.isFrozen ? 0.55 : 1 }]}
    >
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={1}>
          {card.label}
        </Text>
        <Wifi color="rgba(255,255,255,0.9)" size={20} strokeWidth={2} />
      </View>

      <Text style={styles.number}>
        {"••••  ••••  ••••  "}
        {card.last4}
      </Text>

      <View style={styles.bottomRow}>
        <View>
          {accountName ? (
            <Text style={styles.meta} numberOfLines={1}>
              {accountName}
            </Text>
          ) : null}
          <Text style={styles.expiry}>{expiry}</Text>
        </View>
        {card.isFrozen ? (
          <View style={styles.frozenBadge}>
            <Snowflake color="#FFFFFF" size={14} strokeWidth={2} />
            <Text style={styles.frozenText}>Frozen</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md + 4,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: typography.headline.fontSize,
    fontWeight: "600",
  },
  number: {
    color: "#FFFFFF",
    fontSize: typography.title3.fontSize,
    fontWeight: "600",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  meta: {
    color: "rgba(255,255,255,0.85)",
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  expiry: {
    color: "rgba(255,255,255,0.9)",
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  frozenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  frozenText: {
    color: "#FFFFFF",
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
})

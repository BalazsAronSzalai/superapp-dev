// Bottom-sheet form for logging a transaction (manual entry, PFM v1).
import { useEffect, useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { formatCurrency } from "@/lib/money"
import {
  TRANSACTION_CATEGORIES,
  type CreateTransactionInput,
  type FinanceAccount,
  type TransactionCategory,
  type TransactionType,
} from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

interface AddTransactionSheetProps {
  visible: boolean
  onClose: () => void
  onSubmit: (input: CreateTransactionInput) => void
  accounts: FinanceAccount[]
  /** Preselect this account (e.g. when opened from an account context). */
  initialAccountId?: string
  submitting?: boolean
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const DATE_OPTIONS = [
  { key: "today", label: "Today", days: 0 },
  { key: "yesterday", label: "Yesterday", days: 1 },
  { key: "two-days", label: "2 days ago", days: 2 },
] as const

export function AddTransactionSheet({
  visible,
  onClose,
  onSubmit,
  accounts,
  initialAccountId,
  submitting = false,
}: AddTransactionSheetProps) {
  const { colors } = useAppTheme()

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts])

  const [accountId, setAccountId] = useState<string | null>(null)
  const [type, setType] = useState<TransactionType>("debit")
  const [amountText, setAmountText] = useState("")
  const [merchant, setMerchant] = useState("")
  const [category, setCategory] = useState<TransactionCategory | null>(null)
  const [daysAgo, setDaysAgo] = useState(0)

  // Re-seed the selected account whenever the sheet opens.
  useEffect(() => {
    if (visible) {
      setAccountId(initialAccountId ?? activeAccounts[0]?.id ?? null)
    }
  }, [visible, initialAccountId, activeAccounts])

  const amount = Number.parseFloat(amountText.replace(",", "."))
  const canSubmit =
    !!accountId && Number.isFinite(amount) && amount > 0 && !submitting

  const selectedAccount = activeAccounts.find((a) => a.id === accountId)

  const reset = () => {
    setType("debit")
    setAmountText("")
    setMerchant("")
    setCategory(null)
    setDaysAgo(0)
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    if (!canSubmit || !accountId) return
    onSubmit({
      accountId,
      amount,
      type,
      date: isoDaysAgo(daysAgo),
      merchant: merchant.trim() || null,
      ...(category ? { category } : null),
    })
    reset()
  }

  return (
    <SheetModal visible={visible} onClose={close} title="New Transaction">
      <View style={styles.body}>
        {/* Expense / income toggle */}
        <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
          {(
            [
              { value: "debit", label: "Expense" },
              { value: "credit", label: "Income" },
            ] as const
          ).map((opt) => {
            const active = type === opt.value
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setType(opt.value)}
                style={[
                  styles.segmentItem,
                  active ? { backgroundColor: colors.surface } : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? colors.text : colors.textTertiary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Amount */}
        <View style={styles.amountRow}>
          <TextInput
            autoFocus
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Amount"
            style={[styles.amountInput, { color: colors.text }]}
          />
          <Text style={[styles.currency, { color: colors.textTertiary }]}>
            {selectedAccount?.currency ?? "HUF"}
          </Text>
        </View>

        {/* Merchant */}
        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Merchant (e.g. Tesco, Spotify)"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Merchant"
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.separator,
            },
          ]}
        />

        {/* Account picker */}
        {activeAccounts.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {activeAccounts.map((account) => {
                const active = account.id === accountId
                return (
                  <Pressable
                    key={account.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setAccountId(account.id)}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? "#FFFFFF" : colors.textSecondary },
                      ]}
                    >
                      {account.name} · {formatCurrency(account.balance, account.currency)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </ScrollView>
        ) : null}

        {/* Date quick options */}
        <View style={styles.chipRow}>
          {DATE_OPTIONS.map((opt) => {
            const active = daysAgo === opt.days
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setDaysAgo(opt.days)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: active ? "#FFFFFF" : colors.textSecondary }]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Category (optional — auto-categorized when omitted) */}
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Category (optional — auto-detected from merchant)
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {TRANSACTION_CATEGORIES.map((cat) => {
              const meta = categoryMeta(cat)
              const active = category === cat
              return (
                <Pressable
                  key={cat}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCategory(active ? null : cat)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? meta.color : withAlpha(meta.color, 0.15),
                    },
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: active ? "#FFFFFF" : meta.color }]}
                  >
                    {meta.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </ScrollView>

        <Button
          title={type === "debit" ? "Add Expense" : "Add Income"}
          onPress={submit}
          disabled={!canSubmit}
          loading={submitting}
        />
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  segment: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md - 3,
  },
  segmentText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  amountInput: {
    fontSize: 44,
    fontWeight: "700",
    minWidth: 80,
    textAlign: "center",
    padding: 0,
  },
  currency: {
    fontSize: typography.title3.fontSize,
    fontWeight: "600",
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: typography.body.fontSize,
    minHeight: 50,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  hint: {
    fontSize: typography.footnote.fontSize,
    marginBottom: -spacing.sm,
  },
})

// Bottom-sheet form for creating a finance account (manual PFM v1).
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { ACCOUNT_TYPE_META } from "@/components/finance/account-card"
import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { TextField } from "@/components/ui/text-field"
import {
  FINANCE_ACCOUNT_TYPES,
  FINANCE_CURRENCIES,
  type CreateFinanceAccountInput,
  type FinanceAccountType,
  type FinanceCurrency,
} from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

interface AddAccountSheetProps {
  visible: boolean
  onClose: () => void
  onSubmit: (input: CreateFinanceAccountInput) => void
  submitting?: boolean
}

export function AddAccountSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
}: AddAccountSheetProps) {
  const { colors } = useAppTheme()

  const [name, setName] = useState("")
  const [type, setType] = useState<FinanceAccountType>("checking")
  const [currency, setCurrency] = useState<FinanceCurrency>("HUF")
  const [balanceText, setBalanceText] = useState("")

  const initialBalance = balanceText.trim()
    ? Number.parseFloat(balanceText.replace(",", "."))
    : 0
  const canSubmit =
    name.trim().length > 0 && Number.isFinite(initialBalance) && !submitting

  const reset = () => {
    setName("")
    setType("checking")
    setCurrency("HUF")
    setBalanceText("")
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    if (!canSubmit) return
    onSubmit({ name: name.trim(), type, currency, initialBalance })
    reset()
  }

  return (
    <SheetModal visible={visible} onClose={close} title="New Account">
      <View style={styles.body}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. OTP Checking"
          autoFocus
        />

        {/* Type */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textTertiary }]}>Type</Text>
          <View style={styles.chipRow}>
            {FINANCE_ACCOUNT_TYPES.map((t) => {
              const active = type === t
              const Icon = ACCOUNT_TYPE_META[t].icon
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setType(t)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                  ]}
                >
                  <Icon color={active ? "#FFFFFF" : colors.textSecondary} size={14} strokeWidth={2} />
                  <Text
                    style={[styles.chipText, { color: active ? "#FFFFFF" : colors.textSecondary }]}
                  >
                    {ACCOUNT_TYPE_META[t].label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Currency */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textTertiary }]}>Currency</Text>
          <View style={styles.chipRow}>
            {FINANCE_CURRENCIES.map((c) => {
              const active = currency === c
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCurrency(c)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: active ? "#FFFFFF" : colors.textSecondary }]}
                  >
                    {c}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <TextField
          label="Opening balance (optional)"
          value={balanceText}
          onChangeText={setBalanceText}
          keyboardType="numbers-and-punctuation"
          placeholder="0"
        />

        <Button title="Create Account" onPress={submit} disabled={!canSubmit} loading={submitting} />
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
})

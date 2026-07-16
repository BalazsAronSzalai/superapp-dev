// Virtual cards — mock card display with freeze/unfreeze (plan.md Phase 6, mock-first).
import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { CreditCard, Plus, Snowflake, Sun, Trash2 } from "lucide-react-native"

import { accountColor } from "@/components/finance/account-card"
import { VirtualCard } from "@/components/finance/virtual-card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SheetModal } from "@/components/ui/modal"
import { TextField } from "@/components/ui/text-field"
import {
  useCreateCard,
  useDeleteCard,
  useFinanceAccounts,
  useFinanceCards,
  usePatchCard,
} from "@/hooks/use-finance"
import type { FinanceCard } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

export default function CardsScreen() {
  const { colors } = useAppTheme()

  const cardsQuery = useFinanceCards()
  const accountsQuery = useFinanceAccounts(true)
  const createMutation = useCreateCard()
  const patchMutation = usePatchCard()
  const deleteMutation = useDeleteCard()

  const cards = cardsQuery.data ?? []
  const accounts = accountsQuery.data ?? []
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [accountId, setAccountId] = useState<string | null>(null)

  const canSubmit = label.trim().length > 0 && !!accountId && !createMutation.isPending

  const openCreate = () => {
    setLabel("")
    setAccountId(activeAccounts[0]?.id ?? null)
    setSheetOpen(true)
  }

  const submit = () => {
    if (!canSubmit || !accountId) return
    createMutation.mutate(
      { financeAccountId: accountId, label: label.trim() },
      { onSuccess: () => setSheetOpen(false) },
    )
  }

  const toggleFreeze = (card: FinanceCard) => {
    patchMutation.mutate({ id: card.id, input: { isFrozen: !card.isFrozen } })
  }

  const confirmDelete = (card: FinanceCard) => {
    Alert.alert("Delete card", `Delete "${card.label}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate(card.id),
      },
    ])
  }

  const loading = cardsQuery.isLoading || accountsQuery.isLoading

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No virtual cards"
          description={
            activeAccounts.length === 0
              ? "Add a finance account first, then create a virtual card for it."
              : "Create a mock virtual card linked to one of your accounts."
          }
          action={
            activeAccounts.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={openCreate}
                style={[styles.emptyAction, { backgroundColor: colors.accent }]}
              >
                <Plus color="#FFFFFF" size={16} strokeWidth={2.5} />
                <Text style={styles.emptyActionText}>Create Card</Text>
              </Pressable>
            ) : undefined
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {cards.map((card) => {
            const account = accounts.find((a) => a.id === card.financeAccountId)
            const tint = account ? accountColor(account) : "#5856D6"
            return (
              <View key={card.id} style={styles.cardBlock}>
                <VirtualCard card={card} color={tint} accountName={account?.name} />
                <View style={styles.cardActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={card.isFrozen ? "Unfreeze card" : "Freeze card"}
                    onPress={() => toggleFreeze(card)}
                    disabled={patchMutation.isPending}
                    style={({ pressed }) => [
                      styles.cardAction,
                      { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    {card.isFrozen ? (
                      <Sun color={colors.warning} size={16} strokeWidth={2} />
                    ) : (
                      <Snowflake color={colors.accent} size={16} strokeWidth={2} />
                    )}
                    <Text style={[styles.cardActionText, { color: colors.text }]}>
                      {card.isFrozen ? "Unfreeze" : "Freeze"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete card"
                    onPress={() => confirmDelete(card)}
                    style={({ pressed }) => [
                      styles.cardAction,
                      { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Trash2 color={colors.destructive} size={16} strokeWidth={2} />
                    <Text style={[styles.cardActionText, { color: colors.destructive }]}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}

      {cards.length > 0 && activeAccounts.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New virtual card"
          onPress={openCreate}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
        </Pressable>
      ) : null}

      {/* Create sheet */}
      <SheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)} title="New Virtual Card">
        <View style={styles.sheetBody}>
          <TextField
            label="Label"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Online shopping"
            autoFocus
          />

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>Account</Text>
            <View style={styles.chipWrap}>
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
                      {account.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <Button
            title="Create Card"
            onPress={submit}
            disabled={!canSubmit}
            loading={createMutation.isPending}
          />
        </View>
      </SheetModal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: 96,
  },
  cardBlock: {
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cardAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  cardActionText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  sheetBody: {
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
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
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

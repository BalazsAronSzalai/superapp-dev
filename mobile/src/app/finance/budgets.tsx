// Monthly category budgets — create, edit limit, delete (plan.md Phase 6).
import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { PiggyBank, Plus, Trash2 } from "lucide-react-native"

import { BudgetRow } from "@/components/finance/budget-row"
import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SheetModal } from "@/components/ui/modal"
import { SwipeableRow } from "@/components/ui/swipeable-row"
import { TextField } from "@/components/ui/text-field"
import {
  useBudgets,
  useCreateBudget,
  useDeleteBudget,
  usePatchBudget,
} from "@/hooks/use-finance"
import {
  TRANSACTION_CATEGORIES,
  type Budget,
  type TransactionCategory,
} from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

export default function BudgetsScreen() {
  const { colors } = useAppTheme()

  const budgetsQuery = useBudgets()
  const createMutation = useCreateBudget()
  const patchMutation = usePatchBudget()
  const deleteMutation = useDeleteBudget()

  const budgets = budgetsQuery.data ?? []

  /** null = closed, "new" = create sheet, otherwise the budget being edited. */
  const [editing, setEditing] = useState<Budget | "new" | null>(null)
  const [category, setCategory] = useState<TransactionCategory | null>(null)
  const [limitText, setLimitText] = useState("")

  const usedCategories = useMemo(() => new Set(budgets.map((b) => b.category)), [budgets])
  const availableCategories = TRANSACTION_CATEGORIES.filter(
    (c) => c !== "income" && !usedCategories.has(c),
  )

  const limit = Number.parseFloat(limitText.replace(",", "."))
  const isNew = editing === "new"
  const canSubmit =
    Number.isFinite(limit) && limit > 0 && (isNew ? !!category : true)
  const submitting = createMutation.isPending || patchMutation.isPending

  const openCreate = () => {
    setCategory(availableCategories[0] ?? null)
    setLimitText("")
    setEditing("new")
  }

  const openEdit = (budget: Budget) => {
    setCategory(budget.category)
    setLimitText(String(budget.monthlyLimit))
    setEditing(budget)
  }

  const close = () => setEditing(null)

  const submit = () => {
    if (!canSubmit) return
    if (isNew) {
      if (!category) return
      createMutation.mutate({ category, monthlyLimit: limit }, { onSuccess: close })
    } else if (editing) {
      patchMutation.mutate(
        { id: editing.id, input: { monthlyLimit: limit } },
        { onSuccess: close },
      )
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {budgetsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No budgets yet"
          description="Set a monthly cap per category — spending is tracked automatically."
          action={
            <Pressable
              accessibilityRole="button"
              onPress={openCreate}
              style={[styles.emptyAction, { backgroundColor: colors.accent }]}
            >
              <Plus color="#FFFFFF" size={16} strokeWidth={2.5} />
              <Text style={styles.emptyActionText}>Add Budget</Text>
            </Pressable>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Budgets track this month&apos;s spending per category in HUF.
          </Text>
          {budgets.map((budget) => (
            <SwipeableRow
              key={budget.id}
              rightActions={[
                {
                  label: "Delete",
                  icon: Trash2,
                  color: colors.destructive,
                  onPress: () => deleteMutation.mutate(budget.id),
                },
              ]}
            >
              <View style={styles.rowWrap}>
                <BudgetRow budget={budget} onPress={openEdit} />
              </View>
            </SwipeableRow>
          ))}
        </ScrollView>
      )}

      {budgets.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New budget"
          onPress={openCreate}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
        </Pressable>
      ) : null}

      {/* Create / edit sheet */}
      <SheetModal
        visible={editing !== null}
        onClose={close}
        title={isNew ? "New Budget" : "Edit Budget"}
      >
        <View style={styles.sheetBody}>
          {isNew ? (
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>Category</Text>
              <View style={styles.chipWrap}>
                {availableCategories.map((cat) => {
                  const meta = categoryMeta(cat)
                  const active = category === cat
                  return (
                    <Pressable
                      key={cat}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setCategory(cat)}
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
            </View>
          ) : editing && editing !== "new" ? (
            <Text style={[styles.editCategory, { color: colors.text }]}>
              {categoryMeta(editing.category).label}
            </Text>
          ) : null}

          <TextField
            label="Monthly limit (HUF)"
            value={limitText}
            onChangeText={setLimitText}
            keyboardType="decimal-pad"
            placeholder="e.g. 50000"
            autoFocus={!isNew}
          />

          <Button
            title={isNew ? "Create Budget" : "Save"}
            onPress={submit}
            disabled={!canSubmit || submitting}
            loading={submitting}
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
  hint: {
    fontSize: typography.footnote.fontSize,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  listContent: {
    paddingBottom: 96,
    gap: spacing.xs,
  },
  rowWrap: {
    paddingHorizontal: spacing.md,
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
  editCategory: {
    fontSize: typography.title3.fontSize,
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

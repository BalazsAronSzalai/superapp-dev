// Finance tab — Revolut/OTP-inspired PFM dashboard (plan.md Phase 6).
import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartPie,
  ChevronRight,
  CreditCard,
  PiggyBank,
  Plus,
  Wallet,
} from "lucide-react-native"

import { ScreenHeader } from "@/components/screen-header"
import { EmptyState } from "@/components/ui/empty-state"
import { AccountCard } from "@/components/finance/account-card"
import { AddAccountSheet } from "@/components/finance/add-account-sheet"
import { AddTransactionSheet } from "@/components/finance/add-transaction-sheet"
import { BudgetRow } from "@/components/finance/budget-row"
import { TransactionRow } from "@/components/finance/transaction-row"
import {
  useBudgets,
  useCreateFinanceAccount,
  useCreateTransaction,
  useFinanceAccounts,
  useFinanceSummary,
  useTransactions,
} from "@/hooks/use-finance"
import { formatCurrency } from "@/lib/money"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const RECENT_LIMIT = 8

export default function FinanceScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const accountsQuery = useFinanceAccounts()
  const summaryQuery = useFinanceSummary()
  const transactionsQuery = useTransactions({ limit: RECENT_LIMIT })
  const budgetsQuery = useBudgets()

  const createAccount = useCreateFinanceAccount()
  const createTransaction = useCreateTransaction()

  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [transactionSheetOpen, setTransactionSheetOpen] = useState(false)

  const accounts = accountsQuery.data ?? []
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts])
  const summary = summaryQuery.data
  const transactions = transactionsQuery.data ?? []
  const budgets = (budgetsQuery.data ?? []).slice(0, 3)

  const loading = accountsQuery.isLoading || summaryQuery.isLoading
  const refreshing =
    accountsQuery.isRefetching || summaryQuery.isRefetching || transactionsQuery.isRefetching

  const refetchAll = () => {
    accountsQuery.refetch()
    summaryQuery.refetch()
    transactionsQuery.refetch()
    budgetsQuery.refetch()
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Finance"
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Spending analytics"
              hitSlop={8}
              onPress={() => router.push("/finance/analytics")}
            >
              <ChartPie color={colors.textSecondary} size={22} strokeWidth={1.75} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Virtual cards"
              hitSlop={8}
              onPress={() => router.push("/finance/cards")}
            >
              <CreditCard color={colors.textSecondary} size={22} strokeWidth={1.75} />
            </Pressable>
          </>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : accounts.length === 0 ? (
        <>
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add a checking, savings, cash, or card account to start tracking your money."
            action={
              <Pressable
                accessibilityRole="button"
                onPress={() => setAccountSheetOpen(true)}
                style={[styles.emptyAction, { backgroundColor: colors.accent }]}
              >
                <Plus color="#FFFFFF" size={16} strokeWidth={2.5} />
                <Text style={styles.emptyActionText}>Add Account</Text>
              </Pressable>
            }
          />
        </>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.accent} />
          }
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Total balance */}
          <View style={styles.balanceBlock}>
            <Text style={[styles.balanceLabel, { color: colors.textTertiary }]}>
              Total balance
            </Text>
            <Text style={[styles.balanceValue, { color: colors.text }]} numberOfLines={1}>
              {summary ? formatCurrency(summary.totalBalance, summary.baseCurrency) : "—"}
            </Text>
            {summary ? (
              <View style={styles.monthRow}>
                <View style={styles.monthStat}>
                  <ArrowDownLeft color={colors.success} size={14} strokeWidth={2.5} />
                  <Text style={[styles.monthStatText, { color: colors.textSecondary }]}>
                    {formatCurrency(summary.monthIncome, summary.baseCurrency)} in
                  </Text>
                </View>
                <View style={styles.monthStat}>
                  <ArrowUpRight color={colors.destructive} size={14} strokeWidth={2.5} />
                  <Text style={[styles.monthStatText, { color: colors.textSecondary }]}>
                    {formatCurrency(summary.monthSpending, summary.baseCurrency)} out
                  </Text>
                </View>
                <Text style={[styles.monthStatText, { color: colors.textTertiary }]}>
                  this month
                </Text>
              </View>
            ) : null}
          </View>

          {/* Account carousel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onPress={(a) => router.push(`/finance/account/${a.id}`)}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add account"
              onPress={() => setAccountSheetOpen(true)}
              style={({ pressed }) => [
                styles.addCard,
                {
                  borderColor: colors.separator,
                  backgroundColor: pressed ? colors.surfaceSecondary : "transparent",
                },
              ]}
            >
              <Plus color={colors.accent} size={22} strokeWidth={2} />
              <Text style={[styles.addCardText, { color: colors.accent }]}>Add account</Text>
            </Pressable>
          </ScrollView>

          {/* Budgets preview */}
          {budgets.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Budgets"
                onPress={() => router.push("/finance/budgets")}
              />
              <View style={styles.sectionBody}>
                {budgets.map((budget) => (
                  <BudgetRow
                    key={budget.id}
                    budget={budget}
                    onPress={() => router.push("/finance/budgets")}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/finance/budgets")}
              style={({ pressed }) => [
                styles.budgetPrompt,
                { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <PiggyBank color={colors.accent} size={20} strokeWidth={2} />
              <Text style={[styles.budgetPromptText, { color: colors.textSecondary }]}>
                Set monthly budgets to keep spending in check
              </Text>
              <ChevronRight color={colors.textTertiary} size={18} strokeWidth={2} />
            </Pressable>
          )}

          {/* Recent transactions */}
          <View style={styles.section}>
            <SectionHeader
              title="Recent activity"
              onPress={() => router.push("/finance/transactions")}
            />
            {transactions.length === 0 ? (
              <Text style={[styles.noActivity, { color: colors.textTertiary }]}>
                No transactions yet. Tap + to log your first expense.
              </Text>
            ) : (
              <View>
                {transactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    onPress={(t) => router.push(`/finance/transaction/${t.id}`)}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {activeAccounts.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New transaction"
          onPress={() => setTransactionSheetOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
        </Pressable>
      ) : null}

      <AddAccountSheet
        visible={accountSheetOpen}
        onClose={() => setAccountSheetOpen(false)}
        submitting={createAccount.isPending}
        onSubmit={(input) =>
          createAccount.mutate(input, { onSuccess: () => setAccountSheetOpen(false) })
        }
      />
      <AddTransactionSheet
        visible={transactionSheetOpen}
        onClose={() => setTransactionSheetOpen(false)}
        accounts={accounts}
        submitting={createTransaction.isPending}
        onSubmit={(input) =>
          createTransaction.mutate(input, { onSuccess: () => setTransactionSheetOpen(false) })
        }
      />
    </SafeAreaView>
  )
}

function SectionHeader({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`See all ${title.toLowerCase()}`}
      onPress={onPress}
      style={styles.sectionHeader}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.seeAll}>
        <Text style={[styles.seeAllText, { color: colors.accent }]}>See all</Text>
        <ChevronRight color={colors.accent} size={16} strokeWidth={2} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 96,
    gap: spacing.lg,
  },
  balanceBlock: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  balanceLabel: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: typography.largeTitle.fontSize,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  monthStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  monthStatText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  carousel: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm + 4,
    flexDirection: "row",
  },
  addCard: {
    width: 140,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  addCardText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.title3.fontSize,
    fontWeight: "600",
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  sectionBody: {
    paddingHorizontal: spacing.md,
  },
  budgetPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  budgetPromptText: {
    flex: 1,
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  noActivity: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.subheadline.fontSize,
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

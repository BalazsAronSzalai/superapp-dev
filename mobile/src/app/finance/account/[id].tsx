// Finance account detail — balance, per-account transactions, rename/archive/delete.
import { useCallback, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { Archive, ArchiveRestore, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react-native"

import { ACCOUNT_TYPE_META, accountColor } from "@/components/finance/account-card"
import { AddTransactionSheet } from "@/components/finance/add-transaction-sheet"
import { TransactionRow } from "@/components/finance/transaction-row"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SheetModal } from "@/components/ui/modal"
import { getListSeparator } from "@/components/ui/list-separator"
import { SwipeableRow } from "@/components/ui/swipeable-row"
import { TextField } from "@/components/ui/text-field"
import {
  useCreateTransaction,
  useDeleteFinanceAccount,
  useDeleteTransaction,
  useFinanceAccounts,
  usePatchFinanceAccount,
  useTransactions,
} from "@/hooks/use-finance"
import { formatCurrency } from "@/lib/money"
import type { Transaction } from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** Stable separator component type — see list-separator.tsx (FlashList perf). */
const Separator = getListSeparator(spacing.md + 40 + spacing.sm + 4)

export default function FinanceAccountScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const accountsQuery = useFinanceAccounts(true)
  const transactionsQuery = useTransactions(id ? { accountId: id } : {})
  const patchAccount = usePatchFinanceAccount()
  const deleteAccount = useDeleteFinanceAccount()
  const createTransaction = useCreateTransaction()
  const deleteTransaction = useDeleteTransaction()

  const [renameOpen, setRenameOpen] = useState(false)
  const [nameText, setNameText] = useState("")
  const [transactionSheetOpen, setTransactionSheetOpen] = useState(false)

  const accounts = accountsQuery.data ?? []
  const account = accounts.find((a) => a.id === id)
  const transactions = transactionsQuery.data ?? []

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <SwipeableRow
        rightActions={[
          {
            label: "Delete",
            icon: Trash2,
            color: colors.destructive,
            onPress: () => deleteTransaction.mutate(item.id),
          },
        ]}
      >
        <TransactionRow
          transaction={item}
          onPress={(t) => router.push(`/finance/transaction/${t.id}`)}
        />
      </SwipeableRow>
    ),
    [colors.destructive, deleteTransaction, router],
  )

  if (accountsQuery.isLoading || !account) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  const tint = accountColor(account)
  const typeMeta = ACCOUNT_TYPE_META[account.type]
  const TypeIcon = typeMeta.icon

  const toggleArchive = () => {
    patchAccount.mutate({ id: account.id, input: { isArchived: !account.isArchived } })
  }

  const confirmDelete = () => {
    Alert.alert(
      "Delete account",
      "All transactions and cards on this account will be deleted too.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteAccount.mutate(account.id, { onSuccess: () => router.back() }),
        },
      ],
    )
  }

  const submitRename = () => {
    const name = nameText.trim()
    if (!name) return
    patchAccount.mutate(
      { id: account.id, input: { name } },
      { onSuccess: () => setRenameOpen(false) },
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Balance header */}
      <View style={[styles.header, { backgroundColor: tint }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerIconWrap}>
            <TypeIcon color="#FFFFFF" size={18} strokeWidth={2} />
          </View>
          <Text style={styles.headerType}>
            {typeMeta.label} · {account.currency}
            {account.isArchived ? " · Archived" : ""}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rename account"
            hitSlop={8}
            onPress={() => {
              setNameText(account.name)
              setRenameOpen(true)
            }}
          >
            <Pencil color="rgba(255,255,255,0.9)" size={18} strokeWidth={2} />
          </Pressable>
        </View>
        <Text style={styles.headerName} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.headerBalance} numberOfLines={1}>
          {formatCurrency(account.balance, account.currency)}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <ActionButton
          label="Add transaction"
          icon={<Plus color={colors.accent} size={18} strokeWidth={2.25} />}
          onPress={() => setTransactionSheetOpen(true)}
          disabled={account.isArchived}
        />
        <ActionButton
          label={account.isArchived ? "Unarchive" : "Archive"}
          icon={
            account.isArchived ? (
              <ArchiveRestore color={colors.accent} size={18} strokeWidth={2} />
            ) : (
              <Archive color={colors.accent} size={18} strokeWidth={2} />
            )
          }
          onPress={toggleArchive}
        />
        <ActionButton
          label="Delete"
          icon={<Trash2 color={colors.destructive} size={18} strokeWidth={2} />}
          onPress={confirmDelete}
          destructive
        />
      </View>

      {/* Transactions */}
      {transactionsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No transactions"
          description="Activity on this account will appear here."
        />
      ) : (
        <FlashList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Rename sheet */}
      <SheetModal visible={renameOpen} onClose={() => setRenameOpen(false)} title="Rename Account">
        <View style={styles.renameBody}>
          <TextField
            label="Name"
            value={nameText}
            onChangeText={setNameText}
            autoFocus
            placeholder="Account name"
          />
          <Button
            title="Save"
            onPress={submitRename}
            disabled={!nameText.trim()}
            loading={patchAccount.isPending}
          />
        </View>
      </SheetModal>

      <AddTransactionSheet
        visible={transactionSheetOpen}
        onClose={() => setTransactionSheetOpen(false)}
        accounts={accounts}
        initialAccountId={account.id}
        submitting={createTransaction.isPending}
        onSubmit={(input) =>
          createTransaction.mutate(input, { onSuccess: () => setTransactionSheetOpen(false) })
        }
      />
    </View>
  )
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  destructive = false,
}: {
  label: string
  icon: React.ReactNode
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: colors.surfaceSecondary,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon}
      <Text
        style={[
          styles.actionLabel,
          { color: destructive ? colors.destructive : colors.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    margin: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md + 4,
    gap: spacing.xs,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerType: {
    flex: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerName: {
    color: "rgba(255,255,255,0.9)",
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  headerBalance: {
    color: "#FFFFFF",
    fontSize: typography.title1.fontSize,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xs,
  },
  actionLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  renameBody: {
    gap: spacing.md,
  },
})

// Full transaction feed with search + category/type filters (plan.md Phase 6).
import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { ReceiptText, Search as SearchIcon, Trash2, X } from "lucide-react-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { TransactionRow } from "@/components/finance/transaction-row"
import { EmptyState } from "@/components/ui/empty-state"
import { getListSeparator } from "@/components/ui/list-separator"
import { SwipeableRow } from "@/components/ui/swipeable-row"
import { useDeleteTransaction, useTransactions } from "@/hooks/use-finance"
import {
  TRANSACTION_CATEGORIES,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const TYPE_OPTIONS: { value: TransactionType | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "debit", label: "Expenses" },
  { value: "credit", label: "Income" },
]

const Separator = getListSeparator(spacing.md + 40 + spacing.sm + 4)

export default function TransactionsScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [queryText, setQueryText] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [category, setCategory] = useState<TransactionCategory | null>(null)
  const [type, setType] = useState<TransactionType | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(queryText.trim()), 300)
    return () => clearTimeout(handle)
  }, [queryText])

  const transactionsQuery = useTransactions({
    ...(debouncedQuery ? { q: debouncedQuery } : null),
    ...(category ? { category } : null),
    ...(type ? { type } : null),
  })
  const deleteMutation = useDeleteTransaction()

  const transactions = transactionsQuery.data ?? []
  const hasFilters = !!debouncedQuery || !!category || !!type

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <SwipeableRow
        rightActions={[
          {
            label: "Delete",
            icon: Trash2,
            color: colors.destructive,
            onPress: () => deleteMutation.mutate(item.id),
          },
        ]}
      >
        <TransactionRow
          transaction={item}
          onPress={(t) => router.push(`/finance/transaction/${t.id}`)}
        />
      </SwipeableRow>
    ),
    [colors.destructive, deleteMutation, router],
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.separator },
          ]}
        >
          <SearchIcon color={colors.textTertiary} size={18} strokeWidth={2} />
          <TextInput
            value={queryText}
            onChangeText={setQueryText}
            placeholder="Search merchant, notes…"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Search transactions"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {queryText.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setQueryText("")}
            >
              <X color={colors.textTertiary} size={16} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Type segment */}
      <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
        {TYPE_OPTIONS.map((opt) => {
          const active = type === opt.value
          return (
            <Pressable
              key={opt.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setType(opt.value)}
              style={[styles.segmentItem, active ? { backgroundColor: colors.surface } : null]}
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

      {/* Category chips */}
      <View style={styles.chipBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBar}
        >
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
                  { backgroundColor: active ? meta.color : withAlpha(meta.color, 0.15) },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? "#FFFFFF" : meta.color }]}>
                  {meta.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {transactionsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={hasFilters ? "No matching transactions" : "No transactions yet"}
          description={
            hasFilters
              ? "Try a different search or clear the filters."
              : "Log expenses and income from the Finance tab."
          }
        />
      ) : (
        <FlashList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + 4,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    paddingVertical: 0,
  },
  segment: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.md - 3,
  },
  segmentText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  chipBarWrap: {
    paddingBottom: spacing.sm,
  },
  chipBar: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    flexDirection: "row",
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 40 + spacing.sm + 4,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
})

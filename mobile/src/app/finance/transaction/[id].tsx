// Transaction detail — edit category/merchant/notes, recurring flag, receipt photo.
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import { Camera, Trash2 } from "lucide-react-native"

import { categoryMeta, withAlpha } from "@/components/finance/category-meta"
import { LinkedItems } from "@/components/glue/linked-items"
import { formatTransactionDate } from "@/components/finance/transaction-row"
import { Button } from "@/components/ui/button"
import { TextField } from "@/components/ui/text-field"
import { useDeleteTransaction, usePatchTransaction, useTransaction } from "@/hooks/use-finance"
import { formatSignedAmount } from "@/lib/money"
import {
  TRANSACTION_CATEGORIES,
  type TransactionCategory,
} from "@/lib/schemas/finance.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

export default function TransactionDetailScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const transactionQuery = useTransaction(id)
  const patchMutation = usePatchTransaction()
  const deleteMutation = useDeleteTransaction()

  const transaction = transactionQuery.data

  const [merchant, setMerchant] = useState("")
  const [notes, setNotes] = useState("")
  const [category, setCategory] = useState<TransactionCategory | null>(null)
  const [seeded, setSeeded] = useState(false)

  // Seed the editable fields once the transaction loads.
  useEffect(() => {
    if (transaction && !seeded) {
      setMerchant(transaction.merchant ?? "")
      setNotes(transaction.notes ?? "")
      setCategory(transaction.category)
      setSeeded(true)
    }
  }, [transaction, seeded])

  if (transactionQuery.isLoading || !transaction) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  const meta = categoryMeta(transaction.category)
  const Icon = meta.icon
  const isCredit = transaction.type === "credit"

  const dirty =
    merchant.trim() !== (transaction.merchant ?? "") ||
    notes.trim() !== (transaction.notes ?? "") ||
    category !== transaction.category

  const save = () => {
    patchMutation.mutate({
      id: transaction.id,
      input: {
        merchant: merchant.trim() || null,
        notes: notes.trim() || null,
        category,
      },
    })
  }

  const toggleRecurring = (value: boolean) => {
    patchMutation.mutate({ id: transaction.id, input: { isRecurring: value } })
  }

  const attachReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.4,
      base64: true,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset?.base64) return
    const mime = asset.mimeType ?? "image/jpeg"
    patchMutation.mutate({
      id: transaction.id,
      input: { receiptUrl: `data:${mime};base64,${asset.base64}` },
    })
  }

  const removeReceipt = () => {
    patchMutation.mutate({ id: transaction.id, input: { receiptUrl: null } })
  }

  const confirmDelete = () => {
    Alert.alert("Delete transaction", "This will also adjust the account balance.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteMutation.mutate(transaction.id, { onSuccess: () => router.back() }),
      },
    ])
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Amount header */}
      <View style={styles.amountBlock}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(meta.color, 0.15) }]}>
          <Icon color={meta.color} size={28} strokeWidth={2} />
        </View>
        <Text
          style={[styles.amount, { color: isCredit ? colors.success : colors.text }]}
          numberOfLines={1}
        >
          {formatSignedAmount(transaction.amount, transaction.currency, transaction.type)}
        </Text>
        <Text style={[styles.date, { color: colors.textTertiary }]}>
          {formatTransactionDate(transaction.date)}
          {" · "}
          {isCredit ? "Income" : "Expense"}
        </Text>
      </View>

      {/* Category picker */}
      <Text style={[styles.label, { color: colors.textTertiary }]}>Category</Text>
      <View style={styles.chipWrap}>
        {TRANSACTION_CATEGORIES.map((cat) => {
          const catMeta = categoryMeta(cat)
          const active = category === cat
          return (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(active ? null : cat)}
              style={[
                styles.chip,
                { backgroundColor: active ? catMeta.color : withAlpha(catMeta.color, 0.15) },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#FFFFFF" : catMeta.color }]}>
                {catMeta.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <TextField
        label="Merchant"
        value={merchant}
        onChangeText={setMerchant}
        placeholder="e.g. Tesco"
      />
      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Add a note…"
        multiline
      />

      {/* Recurring flag */}
      <View style={[styles.switchRow, { borderColor: colors.separator }]}>
        <View style={styles.switchLabelWrap}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Recurring payment</Text>
          <Text style={[styles.switchHint, { color: colors.textTertiary }]}>
            Mark subscriptions and regular bills
          </Text>
        </View>
        <Switch
          value={transaction.isRecurring}
          onValueChange={toggleRecurring}
          trackColor={{ true: colors.accent }}
          accessibilityLabel="Recurring payment"
        />
      </View>

      {/* Receipt */}
      <Text style={[styles.label, { color: colors.textTertiary }]}>Receipt</Text>
      {transaction.receiptUrl ? (
        <View style={styles.receiptWrap}>
          <Image
            source={{ uri: transaction.receiptUrl }}
            style={[styles.receipt, { backgroundColor: colors.surfaceSecondary }]}
            contentFit="cover"
            accessibilityLabel="Receipt photo"
          />
          <Button
            title="Remove Receipt"
            variant="secondary"
            onPress={removeReceipt}
            loading={patchMutation.isPending}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach receipt photo"
          onPress={attachReceipt}
          style={({ pressed }) => [
            styles.receiptButton,
            {
              borderColor: colors.separator,
              backgroundColor: pressed ? colors.surfaceSecondary : "transparent",
            },
          ]}
        >
          <Camera color={colors.accent} size={20} strokeWidth={2} />
          <Text style={[styles.receiptButtonText, { color: colors.accent }]}>
            Attach receipt photo
          </Text>
        </Pressable>
      )}

      {dirty ? (
        <Button title="Save Changes" onPress={save} loading={patchMutation.isPending} />
      ) : null}

      {/* Cross-module links (superapp glue) */}
      <LinkedItems entityType="transaction" entityId={transaction.id} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete transaction"
        onPress={confirmDelete}
        style={({ pressed }) => [styles.deleteRow, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Trash2 color={colors.destructive} size={18} strokeWidth={2} />
        <Text style={[styles.deleteText, { color: colors.destructive }]}>
          Delete Transaction
        </Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  amountBlock: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  amount: {
    fontSize: typography.largeTitle.fontSize,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  date: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  label: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: -spacing.sm,
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm + 4,
  },
  switchLabelWrap: {
    flex: 1,
    gap: 2,
  },
  switchLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  switchHint: {
    fontSize: typography.footnote.fontSize,
  },
  receiptWrap: {
    gap: spacing.sm,
  },
  receipt: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
  },
  receiptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: "dashed",
    paddingVertical: spacing.md,
  },
  receiptButtonText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  deleteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  deleteText: {
    fontSize: typography.body.fontSize,
    fontWeight: "600",
  },
})

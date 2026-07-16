import { useCallback, useMemo, useState } from "react"
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
import { useFocusEffect, useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { Archive, BellOff, Clock, Inbox, Search, SquarePen, Trash2 } from "lucide-react-native"

import { ScreenHeader } from "@/components/screen-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row"
import { ThreadRow } from "@/components/mail/thread-row"
import { SnoozePicker } from "@/components/mail/snooze-picker"
import {
  useDeleteThread,
  useMailAccounts,
  usePatchThread,
  useSnoozeThread,
  useSyncAccounts,
  useThreads,
  useUnsnoozeThread,
} from "@/hooks/use-mail"
import type { MailFolder, MailThread } from "@/lib/schemas/mail.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const FOLDERS: { key: MailFolder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "archive", label: "Archive" },
  { key: "trash", label: "Trash" },
  { key: "snoozed", label: "Snoozed" },
  { key: "outbox", label: "Outbox" },
]

export default function MailScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [folder, setFolder] = useState<MailFolder>("inbox")
  const [snoozeTarget, setSnoozeTarget] = useState<string | null>(null)

  const accountsQuery = useMailAccounts()
  const accounts = accountsQuery.data ?? []
  const hasAccounts = accounts.length > 0

  const threadsQuery = useThreads(folder, hasAccounts)
  const syncMutation = useSyncAccounts()
  const patchMutation = usePatchThread(folder)
  const deleteMutation = useDeleteThread(folder)
  const snoozeMutation = useSnoozeThread(folder)
  const unsnoozeMutation = useUnsnoozeThread()

  const threads = useMemo(
    () => threadsQuery.data?.pages.flatMap((p) => p.threads) ?? [],
    [threadsQuery.data],
  )

  const accountIdsKey = accounts.map((a) => a.id).join(",")

  const runSync = useCallback(() => {
    if (accounts.length > 0 && !syncMutation.isPending) {
      syncMutation.mutate(accounts.map((a) => a.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdsKey, syncMutation.isPending])

  // Sync when the tab gains focus (serverless on-demand sync model).
  useFocusEffect(
    useCallback(() => {
      runSync()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountIdsKey]),
  )

  const swipeActionsFor = useCallback(
    (thread: MailThread): { right: SwipeAction[]; left: SwipeAction[] } => {
      if (folder === "snoozed") {
        return {
          right: [
            {
              label: "Unsnooze",
              icon: BellOff,
              color: colors.accent,
              onPress: () => unsnoozeMutation.mutate(thread.id),
            },
          ],
          left: [],
        }
      }
      const right: SwipeAction[] = [
        {
          label: "Archive",
          icon: Archive,
          color: colors.success,
          onPress: () => patchMutation.mutate({ id: thread.id, input: { folder: "archive" } }),
        },
        {
          label: "Trash",
          icon: Trash2,
          color: colors.destructive,
          onPress: () => deleteMutation.mutate(thread.id),
        },
      ]
      const left: SwipeAction[] =
        folder === "inbox"
          ? [
              {
                label: "Snooze",
                icon: Clock,
                color: colors.warning,
                onPress: () => setSnoozeTarget(thread.id),
              },
            ]
          : []
      return { right, left }
    },
    [folder, colors, patchMutation, deleteMutation, unsnoozeMutation],
  )

  const renderItem = useCallback(
    ({ item }: { item: MailThread }) => {
      const { right, left } = swipeActionsFor(item)
      return (
        <SwipeableRow rightActions={right} leftActions={left}>
          <ThreadRow thread={item} onPress={() => router.push(`/mail/thread/${item.id}`)} />
        </SwipeableRow>
      )
    },
    [swipeActionsFor, router],
  )

  if (accountsQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Mail" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  if (!hasAccounts) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Mail" />
        <EmptyState
          icon={Inbox}
          title="No mail account yet"
          description="Connect an IMAP account (Gmail, Outlook, or any provider with an app password) to see your inbox here."
          action={
            <Button
              title="Add mail account"
              onPress={() => router.push("/mail/account-setup")}
              style={styles.emptyAction}
            />
          }
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Mail"
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search mail"
            hitSlop={8}
            onPress={() => router.push("/mail/search")}
          >
            <Search color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
        }
      />

      <View style={styles.folderBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.folderBar}
        >
          {FOLDERS.map((f) => {
            const active = f.key === folder
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFolder(f.key)}
                style={[
                  styles.folderChip,
                  { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                ]}
              >
                <Text
                  style={[
                    styles.folderChipText,
                    { color: active ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {threadsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={`Nothing in ${FOLDERS.find((f) => f.key === folder)?.label ?? folder}`}
          description={folder === "inbox" ? "Pull down to sync your account." : undefined}
        />
      ) : (
        <FlashList
          data={threads}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={syncMutation.isPending}
              onRefresh={runSync}
              tintColor={colors.accent}
            />
          }
          onEndReached={() => {
            if (threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) {
              threadsQuery.fetchNextPage()
            }
          }}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          )}
          ListFooterComponent={
            threadsQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.accent} style={styles.footerSpinner} />
            ) : null
          }
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Compose email"
        onPress={() => router.push("/mail/compose")}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <SquarePen color="#FFFFFF" size={24} strokeWidth={2} />
      </Pressable>

      <SnoozePicker
        visible={snoozeTarget != null}
        onClose={() => setSnoozeTarget(null)}
        onPick={(until) => {
          if (snoozeTarget) {
            snoozeMutation.mutate({ id: snoozeTarget, until: until.toISOString() })
          }
          setSnoozeTarget(null)
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyAction: {
    marginTop: spacing.sm,
    alignSelf: "center",
    minWidth: 200,
  },
  folderBarWrap: {
    paddingBottom: spacing.sm,
  },
  folderBar: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    flexDirection: "row",
  },
  folderChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  folderChipText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 26,
  },
  footerSpinner: {
    paddingVertical: spacing.md,
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

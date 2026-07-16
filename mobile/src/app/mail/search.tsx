import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { SearchX, Search as SearchIcon, X } from "lucide-react-native"

import { EmptyState } from "@/components/ui/empty-state"
import { ThreadRow } from "@/components/mail/thread-row"
import { useSearchMail } from "@/hooks/use-mail"
import type { MailThread } from "@/lib/schemas/mail.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const DEBOUNCE_MS = 300

export default function SearchScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const searchQuery = useSearchMail(debounced)
  const results = searchQuery.data ?? []
  const active = debounced.length >= 2

  const renderItem = useCallback(
    ({ item }: { item: MailThread }) => (
      <ThreadRow thread={item} onPress={() => router.push(`/mail/thread/${item.id}`)} />
    ),
    [router],
  )

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={styles.searchBarWrap}>
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceSecondary }]}>
          <SearchIcon color={colors.textTertiary} size={18} strokeWidth={1.75} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            placeholder="Search sender, subject, or content"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search mail"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setQuery("")}
            >
              <X color={colors.textTertiary} size={18} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!active ? (
        <EmptyState
          icon={SearchIcon}
          title="Search your mail"
          description="Type at least two characters to search across senders, subjects, and message content."
        />
      ) : searchQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No results"
          description={`Nothing matched "${debounced}".`}
        />
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item: MailThread) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }: { item: MailThread }) => (
            <ThreadRow thread={item} onPress={() => router.push(`/mail/thread/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarWrap: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    paddingVertical: spacing.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 26,
  },
})

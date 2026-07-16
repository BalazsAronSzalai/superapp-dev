// Notes search — full-text search across titles and content, plus tag
// browsing when the query is empty (plan.md Phase 5).
import { useEffect, useState } from "react"
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
import { SearchX, Search as SearchIcon, X } from "lucide-react-native"

import { EmptyState } from "@/components/ui/empty-state"
import { NoteRow } from "@/components/notes/note-row"
import { useNotes, useNoteTags, useSearchNotes } from "@/hooks/use-notes"
import type { NoteSummary } from "@/lib/schemas/note.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const DEBOUNCE_MS = 300

export default function NotesSearchScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  /** Tag filter used when no text query is active. */
  const [tag, setTag] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const active = debounced.length >= 2
  const searchQuery = useSearchNotes(debounced)
  const tagsQuery = useNoteTags()
  const taggedQuery = useNotes(tag && !active ? { tag } : {})

  const tags = tagsQuery.data ?? []
  const results = active ? (searchQuery.data ?? []) : tag ? (taggedQuery.data ?? []) : []
  const loading = active ? searchQuery.isLoading : tag ? taggedQuery.isLoading : false

  const renderItem = ({ item }: { item: NoteSummary }) => (
    <NoteRow note={item} onPress={(n) => router.push(`/notes/note/${n.id}`)} />
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
            placeholder="Search titles and content"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search notes"
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

      {/* Tag chips — browse by tag when not typing a query. */}
      {!active && tags.length > 0 ? (
        <View style={styles.chipBarWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipBar}
          >
            {tags.map((t) => {
              const selected = t === tag
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setTag(selected ? null : t)}
                  style={[
                    styles.chip,
                    { backgroundColor: selected ? colors.accent : colors.surfaceSecondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.textSecondary },
                    ]}
                  >
                    #{t}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}

      {!active && !tag ? (
        <EmptyState
          icon={SearchIcon}
          title="Search your notes"
          description={
            tags.length > 0
              ? "Type at least two characters, or pick a tag above to browse."
              : "Type at least two characters to search across titles and content."
          }
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No results"
          description={active ? `Nothing matches "${debounced}".` : `No notes tagged #${tag}.`}
        />
      ) : (
        <FlashList
          data={results}
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
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    padding: 0,
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
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
})

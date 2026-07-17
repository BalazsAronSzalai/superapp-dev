// Universal search across all modules (plan.md Phase 7 superapp glue):
// one query hits mail, tasks, events, notes, and transactions at once.
import { useCallback, useEffect, useMemo, useState } from "react"
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
import { SearchResultRow } from "@/components/glue/search-result-row"
import { useUniversalSearch } from "@/hooks/use-glue"
import { entityRoute, SEARCH_TYPE_META } from "@/lib/entity-routes"
import { SEARCH_TYPES, type SearchResultItem, type SearchType } from "@/lib/schemas/glue.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const DEBOUNCE_MS = 300

type ListRow =
  | { kind: "header"; type: SearchType; count: number }
  | { kind: "result"; item: SearchResultItem }

export default function UniversalSearchScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [typeFilter, setTypeFilter] = useState<SearchType | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const active = debounced.length >= 2
  const searchQuery = useUniversalSearch(debounced, typeFilter ? [typeFilter] : undefined)
  const data = searchQuery.data

  const rows = useMemo<ListRow[]>(() => {
    if (!data) return []
    const out: ListRow[] = []
    for (const type of SEARCH_TYPES) {
      const items = data[type]
      if (items.length === 0) continue
      out.push({ kind: "header", type, count: items.length })
      for (const item of items) out.push({ kind: "result", item })
    }
    return out
  }, [data])

  const openResult = useCallback(
    (item: SearchResultItem) => {
      const route = entityRoute(item.entityType, item.id)
      if (route) router.push(route as never)
    },
    [router],
  )

  const renderItem = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === "header") {
        return (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              {SEARCH_TYPE_META[item.type].label}
            </Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{item.count}</Text>
          </View>
        )
      }
      return <SearchResultRow item={item.item} onPress={openResult} />
    },
    [colors.textTertiary, openResult],
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
            placeholder="Search mail, tasks, events, notes…"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Universal search"
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

      <View style={styles.chipBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBar}
        >
          {SEARCH_TYPES.map((type) => {
            const selected = typeFilter === type
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setTypeFilter(selected ? null : type)}
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
                  {SEARCH_TYPE_META[type].label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {!active ? (
        <EmptyState
          icon={SearchIcon}
          title="Search everything"
          description="Type at least two characters to search across mail, tasks, events, notes, and transactions."
        />
      ) : searchQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No results"
          description={`Nothing matches "${debounced}".`}
        />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(row) =>
            row.kind === "header" ? `header-${row.type}` : `${row.item.entityType}-${row.item.id}`
          }
          getItemType={(row) => row.kind}
          keyboardShouldPersistTaps="handled"
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
})

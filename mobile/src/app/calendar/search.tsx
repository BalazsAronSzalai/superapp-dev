// Calendar search — full-text search across event titles, notes, and locations.
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { SearchX, Search as SearchIcon, X } from "lucide-react-native"

import { EmptyState } from "@/components/ui/empty-state"
import { getListSeparator } from "@/components/ui/list-separator"
import { EventRow, formatDayLabel } from "@/components/calendar/event-row"
import { useCalendars, useSearchEvents } from "@/hooks/use-calendar"
import type { CalendarEvent } from "@/lib/schemas/calendar.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const DEBOUNCE_MS = 300
const Separator = getListSeparator(32)

export default function CalendarSearchScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const searchQuery = useSearchEvents(debounced)
  const calendarsQuery = useCalendars()
  const results = searchQuery.data ?? []
  const active = debounced.length >= 2

  const calendarColor = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const c of calendarsQuery.data ?? []) map.set(c.id, c.color)
    return map
  }, [calendarsQuery.data])

  const renderItem = useCallback(
    ({ item }: { item: CalendarEvent }) => (
      <View style={styles.resultRow}>
        <Text style={[styles.resultDate, { color: colors.textTertiary }]}>
          {formatDayLabel(new Date(item.startTime))}
        </Text>
        <EventRow
          event={item}
          color={calendarColor.get(item.calendarId)}
          onPress={(ev) => router.push(`/calendar/event/${ev.id}`)}
        />
      </View>
    ),
    [calendarColor, router, colors.textTertiary],
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
            placeholder="Search title, notes, or location"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search events"
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
          title="Search your events"
          description="Type at least two characters to search across titles, notes, and locations."
        />
      ) : searchQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No results"
          description={`Nothing matches "${debounced}".`}
        />
      ) : (
        <FlashList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={Separator}
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
  resultRow: {
    paddingTop: spacing.xs,
  },
  resultDate: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
})

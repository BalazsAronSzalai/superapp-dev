// Cross-module linking UI (plan.md Phase 7 superapp glue): shows the links
// attached to an entity, lets the user unlink, and add new links by
// searching across every module. Drop-in section for detail screens.
import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { Link2, Plus, Search as SearchIcon, X } from "lucide-react-native"

import { Card } from "@/components/ui/card"
import { SheetModal } from "@/components/ui/modal"
import { SearchResultRow } from "@/components/glue/search-result-row"
import { useCreateLink, useDeleteLink, useLinks, useUniversalSearch } from "@/hooks/use-glue"
import { ENTITY_META, entityRoute } from "@/lib/entity-routes"
import { SEARCH_TYPES, type EntityLink, type EntityLinkType, type SearchResultItem } from "@/lib/schemas/glue.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const DEBOUNCE_MS = 300

function confirmUnlink(title: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(`Remove the link to "${title}"?`)) onConfirm()
    return
  }
  Alert.alert("Remove link", `Remove the link to "${title}"?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: onConfirm },
  ])
}

function LinkRow({
  link,
  onOpen,
  onUnlink,
}: {
  link: EntityLink
  onOpen: (link: EntityLink) => void
  onUnlink: (link: EntityLink) => void
}) {
  const { colors } = useAppTheme()
  const meta = ENTITY_META[link.other.type]
  const Icon = meta.icon
  return (
    <View style={styles.linkRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(link)}
        style={styles.linkRowMain}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
          <Icon color={colors.textSecondary} size={16} strokeWidth={1.75} />
        </View>
        <View style={styles.linkRowBody}>
          <Text style={[styles.linkTitle, { color: colors.text }]} numberOfLines={1}>
            {link.other.title}
          </Text>
          <Text style={[styles.linkSubtitle, { color: colors.textTertiary }]}>{meta.label}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove link to ${link.other.title}`}
        hitSlop={8}
        onPress={() => confirmUnlink(link.other.title, () => onUnlink(link))}
      >
        <X color={colors.textTertiary} size={18} strokeWidth={2} />
      </Pressable>
    </View>
  )
}

export function LinkedItems({
  entityType,
  entityId,
}: {
  entityType: EntityLinkType
  entityId: string | undefined
}) {
  const { colors } = useAppTheme()
  const router = useRouter()

  const linksQuery = useLinks(entityType, entityId)
  const createLink = useCreateLink()
  const deleteLink = useDeleteLink(entityType, entityId ?? "")

  const [pickerVisible, setPickerVisible] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const searchQuery = useUniversalSearch(debounced, undefined)
  const links = linksQuery.data ?? []

  const results = useMemo<SearchResultItem[]>(() => {
    if (!searchQuery.data) return []
    const linkedIds = new Set(links.map((l) => l.other.id))
    const out: SearchResultItem[] = []
    for (const type of SEARCH_TYPES) {
      for (const item of searchQuery.data[type]) {
        // Hide self and already-linked entities.
        if (item.id === entityId || linkedIds.has(item.id)) continue
        out.push(item)
      }
    }
    return out
  }, [searchQuery.data, links, entityId])

  if (!entityId) return null

  const openLink = (link: EntityLink) => {
    const route = entityRoute(link.other.type, link.other.id)
    if (route) router.push(route as never)
  }

  const addLink = (item: SearchResultItem) => {
    createLink.mutate(
      {
        sourceType: entityType,
        sourceId: entityId,
        targetType: item.entityType,
        targetId: item.id,
      },
      {
        onSettled: () => {
          setPickerVisible(false)
          setQuery("")
        },
      },
    )
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Linked items</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add link"
          hitSlop={8}
          onPress={() => setPickerVisible(true)}
          style={styles.addButton}
        >
          <Plus color={colors.accent} size={16} strokeWidth={2} />
          <Text style={[styles.addText, { color: colors.accent }]}>Link</Text>
        </Pressable>
      </View>

      {links.length > 0 ? (
        <Card style={styles.listCard}>
          {links.map((link, i) => (
            <View key={link.id}>
              {i > 0 ? (
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
              ) : null}
              <LinkRow
                link={link}
                onOpen={openLink}
                onUnlink={(l) => deleteLink.mutate(l.id)}
              />
            </View>
          ))}
        </Card>
      ) : (
        <Card style={styles.emptyCard}>
          <Link2 color={colors.textTertiary} size={18} strokeWidth={1.75} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Connect this to emails, tasks, events, notes, or transactions.
          </Text>
        </Card>
      )}

      <SheetModal
        visible={pickerVisible}
        onClose={() => {
          setPickerVisible(false)
          setQuery("")
        }}
        title="Add link"
      >
        <View style={styles.pickerBody}>
          <View style={[styles.searchBar, { backgroundColor: colors.surfaceSecondary }]}>
            <SearchIcon color={colors.textTertiary} size={18} strokeWidth={1.75} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              placeholder="Search anything to link"
              placeholderTextColor={colors.textTertiary}
              style={[styles.searchInput, { color: colors.text }]}
              accessibilityLabel="Search entities to link"
            />
          </View>
          {createLink.isPending || (debounced.length >= 2 && searchQuery.isLoading) ? (
            <View style={styles.pickerCenter}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : debounced.length < 2 ? (
            <Text style={[styles.pickerHint, { color: colors.textTertiary }]}>
              Type at least two characters to search across all modules.
            </Text>
          ) : results.length === 0 ? (
            <Text style={[styles.pickerHint, { color: colors.textTertiary }]}>
              {`Nothing matches "${debounced}".`}
            </Text>
          ) : (
            <ScrollView
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
            >
              {results.map((item) => (
                <SearchResultRow
                  key={`${item.entityType}-${item.id}`}
                  item={item}
                  onPress={addLink}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </SheetModal>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  addText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 40,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRowBody: {
    flex: 1,
    gap: 2,
  },
  linkTitle: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  linkSubtitle: {
    fontSize: typography.footnote.fontSize,
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: {
    flex: 1,
    fontSize: typography.footnote.fontSize,
    lineHeight: typography.footnote.lineHeight,
  },
  pickerBody: {
    gap: spacing.sm,
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
  pickerCenter: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  pickerHint: {
    fontSize: typography.footnote.fontSize,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  pickerList: {
    maxHeight: 320,
    marginHorizontal: -spacing.md,
  },
})

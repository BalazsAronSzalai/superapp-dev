// Row for a universal-search result (also reused by the link picker sheet).
import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { ENTITY_META } from "@/lib/entity-routes"
import type { SearchResultItem } from "@/lib/schemas/glue.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export const SearchResultRow = memo(function SearchResultRow({
  item,
  onPress,
}: {
  item: SearchResultItem
  onPress: (item: SearchResultItem) => void
}) {
  const { colors } = useAppTheme()
  const meta = ENTITY_META[item.entityType]
  const Icon = meta.icon
  const dateLabel = formatDate(item.date)

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
        <Icon color={colors.textSecondary} size={16} strokeWidth={1.75} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      {dateLabel ? (
        <Text style={[styles.date, { color: colors.textTertiary }]}>{dateLabel}</Text>
      ) : null}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "500",
  },
  subtitle: {
    fontSize: typography.footnote.fontSize,
  },
  date: {
    fontSize: typography.footnote.fontSize,
  },
})

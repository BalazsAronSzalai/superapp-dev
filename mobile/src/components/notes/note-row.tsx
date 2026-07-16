import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Pin } from "lucide-react-native"

import type { NoteSummary } from "@/lib/schemas/note.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** "Today", "Yesterday", weekday, or "Jul 20" — Apple Notes-style labels. */
export function formatNoteDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDelta === 0) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  if (dayDelta === 1) return "Yesterday"
  if (dayDelta > 1 && dayDelta < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" })
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : null),
  })
}

interface NoteRowProps {
  note: NoteSummary
  onPress: (note: NoteSummary) => void
}

function NoteRowInner({ note, onPress }: NoteRowProps) {
  const { colors } = useAppTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={note.title || "Untitled note"}
      onPress={() => onPress(note)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceSecondary : colors.background },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {note.title || "Untitled"}
          </Text>
          {note.isPinned ? (
            <Pin color={colors.warning} size={14} strokeWidth={2} fill={colors.warning} />
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.date, { color: colors.textTertiary }]}>
            {formatNoteDate(note.updatedAt)}
          </Text>
          <Text numberOfLines={1} style={[styles.snippet, { color: colors.textTertiary }]}>
            {note.snippet || "No additional text"}
          </Text>
        </View>
        {note.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {note.tags.map((tag) => (
              <View key={tag} style={[styles.tagChip, { backgroundColor: colors.accentMuted }]}>
                <Text style={[styles.tagText, { color: colors.accent }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

export const NoteRow = memo(NoteRowInner)

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  content: {
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.headline.fontSize,
    lineHeight: typography.headline.lineHeight,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  date: {
    fontSize: typography.footnote.fontSize,
  },
  snippet: {
    flex: 1,
    fontSize: typography.footnote.fontSize,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
  },
  tagChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  tagText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
})

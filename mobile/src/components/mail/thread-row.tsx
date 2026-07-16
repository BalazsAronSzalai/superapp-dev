import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Flag, Paperclip } from "lucide-react-native"

import { spacing, typography, useAppTheme } from "@/theme"
import type { MailThread } from "@/lib/schemas/mail.schemas"

/** "Jane Doe <jane@x.com>" → "Jane Doe"; "jane@x.com" → "jane@x.com". */
export function senderName(fromAddr: string | null): string {
  if (!fromAddr) return "Unknown sender"
  const match = fromAddr.match(/^"?([^"<]+)"?\s*</)
  if (match?.[1]) return match[1].trim()
  return fromAddr.replace(/[<>]/g, "").trim()
}

/** Compact relative timestamp for list rows. */
export function formatListTime(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(
    undefined,
    sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" },
  )
}

interface ThreadRowProps {
  thread: MailThread
  onPress: () => void
}

function ThreadRowInner({ thread, onPress }: ThreadRowProps) {
  const { colors } = useAppTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Email from ${senderName(thread.fromAddr)}: ${thread.subject || "(no subject)"}${thread.isUnread ? ", unread" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceSecondary : colors.background },
      ]}
    >
      <View style={styles.unreadColumn}>
        {thread.isUnread ? (
          <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
        ) : null}
      </View>
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text
            numberOfLines={1}
            style={[
              styles.sender,
              { color: colors.text, fontWeight: thread.isUnread ? "700" : "500" },
            ]}
          >
            {senderName(thread.fromAddr)}
          </Text>
          <View style={styles.meta}>
            {thread.hasAttachments ? (
              <Paperclip color={colors.textTertiary} size={13} strokeWidth={2} />
            ) : null}
            {thread.isFlagged ? (
              <Flag color={colors.warning} size={13} strokeWidth={2} fill={colors.warning} />
            ) : null}
            <Text style={[styles.time, { color: colors.textTertiary }]}>
              {formatListTime(thread.lastMessageAt)}
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.subject,
            { color: colors.text, fontWeight: thread.isUnread ? "600" : "400" },
          ]}
        >
          {thread.subject || "(no subject)"}
          {thread.messageCount > 1 ? (
            <Text style={{ color: colors.textTertiary }}>{`  (${thread.messageCount})`}</Text>
          ) : null}
        </Text>
        <Text numberOfLines={2} style={[styles.snippet, { color: colors.textTertiary }]}>
          {thread.snippet || " "}
        </Text>
      </View>
    </Pressable>
  )
}

/** Memoized: FlashList rows only re-render when their thread data changes. */
export const ThreadRow = memo(ThreadRowInner)

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.md,
  },
  unreadColumn: {
    width: 26,
    alignItems: "center",
    paddingTop: 6,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  content: {
    flex: 1,
    gap: 1,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sender: {
    flex: 1,
    fontSize: typography.callout.fontSize,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  time: {
    fontSize: typography.footnote.fontSize,
  },
  subject: {
    fontSize: typography.subheadline.fontSize,
  },
  snippet: {
    fontSize: typography.footnote.fontSize,
    lineHeight: typography.footnote.lineHeight,
  },
})

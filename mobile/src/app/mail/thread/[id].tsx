import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"
import { Forward, Paperclip, Reply, ReplyAll } from "lucide-react-native"

import { senderName } from "@/components/mail/thread-row"
import { useThread } from "@/hooks/use-mail"
import * as mailApi from "@/lib/mail-api"
import { useQueryClient } from "@tanstack/react-query"
import { mailKeys } from "@/hooks/use-mail"
import type { AttachmentMeta, EmailMessage } from "@/lib/schemas/mail.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** Very small HTML → plain text fallback for message bodies. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function messageBody(email: EmailMessage): string {
  if (email.bodyText?.trim()) return email.bodyText.trim()
  if (email.bodyHtml) return htmlToText(email.bodyHtml)
  return ""
}

function formatMessageTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Sanitize a filename for the local cache path. */
function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment"
}

interface AttachmentChipProps {
  emailId: string
  index: number
  meta: AttachmentMeta
}

function AttachmentChip({ emailId, index, meta }: AttachmentChipProps) {
  const { colors } = useAppTheme()
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(false)

  const onPress = async () => {
    if (downloading) return
    setDownloading(true)
    setError(false)
    try {
      const { url, headers } = await mailApi.attachmentDownloadRequest(emailId, index)
      const dest = `${FileSystem.cacheDirectory}${safeFilename(meta.filename)}`
      const result = await FileSystem.downloadAsync(url, dest, { headers })
      if (result.status !== 200) throw new Error(`HTTP ${result.status}`)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: meta.contentType })
      }
    } catch {
      setError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Download attachment ${meta.filename}, ${formatSize(meta.size)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.attachmentChip,
        {
          backgroundColor: pressed ? colors.surfaceSecondary : colors.backgroundSecondary,
          borderColor: error ? colors.destructive : colors.separator,
        },
      ]}
    >
      {downloading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Paperclip color={colors.accent} size={14} strokeWidth={2} />
      )}
      <View style={styles.attachmentLabels}>
        <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.text }]}>
          {meta.filename}
        </Text>
        <Text style={[styles.attachmentSize, { color: colors.textTertiary }]}>
          {error ? "Download failed — tap to retry" : formatSize(meta.size)}
        </Text>
      </View>
    </Pressable>
  )
}

function MessageCard({ email }: { email: EmailMessage }) {
  const { colors } = useAppTheme()
  const [expanded, setExpanded] = useState(true)
  const body = messageBody(email)

  return (
    <View style={[styles.message, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Message from ${senderName(email.fromAddr)}`}
        onPress={() => setExpanded((v) => !v)}
        style={styles.messageHeader}
      >
        <View style={styles.messageHeaderText}>
          <Text numberOfLines={1} style={[styles.messageFrom, { color: colors.text }]}>
            {email.isOutbound ? "You" : senderName(email.fromAddr)}
          </Text>
          <Text numberOfLines={1} style={[styles.messageTo, { color: colors.textTertiary }]}>
            {`To: ${email.to.map(senderName).join(", ")}`}
            {email.cc.length > 0 ? `  Cc: ${email.cc.map(senderName).join(", ")}` : ""}
          </Text>
        </View>
        <Text style={[styles.messageTime, { color: colors.textTertiary }]}>
          {formatMessageTime(email.sentAt)}
        </Text>
      </Pressable>

      {expanded ? (
        <>
          <Text selectable style={[styles.messageBody, { color: colors.textSecondary }]}>
            {body || "(empty message)"}
          </Text>
          {email.attachments.length > 0 ? (
            <View style={styles.attachmentList}>
              {email.attachments.map((meta, index) => (
                <AttachmentChip
                  key={`${email.id}-${index}`}
                  emailId={email.id}
                  index={index}
                  meta={meta}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

export default function ThreadScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()

  const threadQuery = useThread(id)
  const thread = threadQuery.data?.thread
  const emails = threadQuery.data?.emails ?? []

  // Mark the thread read once after it loads.
  const markedRead = useRef(false)
  useEffect(() => {
    if (thread?.isUnread && !markedRead.current) {
      markedRead.current = true
      mailApi
        .patchThread(thread.id, { isUnread: false })
        .then(() => queryClient.invalidateQueries({ queryKey: mailKeys.all }))
        .catch(() => {
          markedRead.current = false
        })
    }
  }, [thread, queryClient])

  /** Build compose params for reply / reply-all / forward. */
  const openCompose = (mode: "reply" | "reply-all" | "forward") => {
    if (!thread) return
    const last = [...emails].reverse().find((e) => !e.isOutbound) ?? emails[emails.length - 1]
    if (!last) return

    const quoted = `\n\n---- On ${formatMessageTime(last.sentAt)}, ${senderName(last.fromAddr)} wrote: ----\n${messageBody(last)}`
    const subjectBase = thread.subject.replace(/^((re|fwd?):\s*)+/i, "")
    const extractAddr = (s: string) => {
      const m = s.match(/<([^>]+)>/)
      return (m?.[1] ?? s).trim()
    }

    const params: Record<string, string> = {
      accountId: thread.accountId,
      body: quoted,
    }

    if (mode === "forward") {
      params.subject = `Fwd: ${subjectBase}`
    } else {
      params.subject = `Re: ${subjectBase}`
      params.threadId = thread.id
      if (last.messageId) params.inReplyTo = last.messageId
      params.to = extractAddr(last.fromAddr)
      if (mode === "reply-all") {
        const others = [...last.to, ...last.cc]
          .map(extractAddr)
          .filter((a) => a !== params.to)
        if (others.length > 0) params.cc = others.join(",")
      }
    }

    router.push({ pathname: "/mail/compose", params })
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: thread ? senderName(thread.fromAddr) : "Conversation" }} />

      {threadQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !thread ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Conversation not found.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.subject, { color: colors.text }]}>
              {thread.subject || "(no subject)"}
            </Text>
            {emails.map((email) => (
              <MessageCard key={email.id} email={email} />
            ))}
          </ScrollView>

          <View style={[styles.actionBar, { borderTopColor: colors.separator, backgroundColor: colors.background }]}>
            {(
              [
                { label: "Reply", icon: Reply, mode: "reply" },
                { label: "Reply all", icon: ReplyAll, mode: "reply-all" },
                { label: "Forward", icon: Forward, mode: "forward" },
              ] as const
            ).map(({ label, icon: Icon, mode }) => (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => openCompose(mode)}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" },
                ]}
              >
                <Icon color={colors.accent} size={20} strokeWidth={1.75} />
                <Text style={[styles.actionLabel, { color: colors.accent }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
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
  errorText: {
    fontSize: typography.body.fontSize,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  subject: {
    fontSize: typography.title3.fontSize,
    lineHeight: typography.title3.lineHeight,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  message: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  messageHeaderText: {
    flex: 1,
    gap: 1,
  },
  messageFrom: {
    fontSize: typography.callout.fontSize,
    fontWeight: "600",
  },
  messageTo: {
    fontSize: typography.footnote.fontSize,
  },
  messageTime: {
    fontSize: typography.footnote.fontSize,
  },
  messageBody: {
    fontSize: typography.subheadline.fontSize,
    lineHeight: 22,
  },
  attachmentList: {
    gap: spacing.xs,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachmentLabels: {
    flex: 1,
  },
  attachmentName: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  attachmentSize: {
    fontSize: typography.caption.fontSize,
  },
  actionBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  actionLabel: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
})

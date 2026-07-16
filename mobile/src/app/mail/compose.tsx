import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import * as FileSystem from "expo-file-system/legacy"
import { Clock, ImageIcon, Paperclip, Send, X } from "lucide-react-native"

import { SnoozePicker } from "@/components/mail/snooze-picker"
import { useMailAccounts, useSendMail } from "@/hooks/use-mail"
import { ApiError } from "@/lib/api"
import { sendMailSchema, type SendAttachment } from "@/lib/schemas/mail.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** Total attachment payload cap (base64 inflates ~4/3, keep source under ~7 MB). */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface PickedAttachment extends SendAttachment {
  size: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface RecipientFieldProps {
  label: string
  chips: string[]
  onChange: (chips: string[]) => void
  autoFocus?: boolean
}

/** Email chips input: comma / space / submit commits the current entry. */
function RecipientField({ label, chips, onChange, autoFocus }: RecipientFieldProps) {
  const { colors } = useAppTheme()
  const [draft, setDraft] = useState("")

  const commit = (raw: string) => {
    const value = raw.trim().replace(/[,;]$/, "")
    if (!value) return
    if (EMAIL_RE.test(value) && !chips.includes(value)) {
      onChange([...chips, value])
      setDraft("")
    }
  }

  return (
    <View style={[styles.recipientRow, { borderBottomColor: colors.separator }]}>
      <Text style={[styles.recipientLabel, { color: colors.textTertiary }]}>{label}</Text>
      <View style={styles.chipArea}>
        {chips.map((chip) => (
          <Pressable
            key={chip}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${chip}`}
            onPress={() => onChange(chips.filter((c) => c !== chip))}
            style={[styles.chip, { backgroundColor: colors.accentMuted }]}
          >
            <Text numberOfLines={1} style={[styles.chipText, { color: colors.accent }]}>
              {chip}
            </Text>
            <X color={colors.accent} size={12} strokeWidth={2.5} />
          </Pressable>
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => {
            if (/[,;\s]$/.test(text)) {
              commit(text)
            } else {
              setDraft(text)
            }
          }}
          onSubmitEditing={() => commit(draft)}
          onBlur={() => commit(draft)}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder={chips.length === 0 ? "email@example.com" : ""}
          placeholderTextColor={colors.textTertiary}
          style={[styles.chipInput, { color: colors.text }]}
          accessibilityLabel={`${label} recipients`}
        />
      </View>
    </View>
  )
}

export default function ComposeScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{
    accountId?: string
    to?: string
    cc?: string
    subject?: string
    body?: string
    threadId?: string
    inReplyTo?: string
  }>()

  const accountsQuery = useMailAccounts()
  const accounts = accountsQuery.data ?? []
  const sendMutation = useSendMail()

  const [accountId, setAccountId] = useState<string | undefined>(params.accountId)
  const [to, setTo] = useState<string[]>(params.to ? params.to.split(",").filter(Boolean) : [])
  const [cc, setCc] = useState<string[]>(params.cc ? params.cc.split(",").filter(Boolean) : [])
  const [bcc, setBcc] = useState<string[]>([])
  const [showCcBcc, setShowCcBcc] = useState((params.cc?.length ?? 0) > 0)
  const [subject, setSubject] = useState(params.subject ?? "")
  const [body, setBody] = useState(params.body ?? "")
  const [attachments, setAttachments] = useState<PickedAttachment[]>([])
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeAccountId = accountId ?? accounts[0]?.id
  const activeAccount = accounts.find((a) => a.id === activeAccountId)

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, a) => sum + a.size, 0),
    [attachments],
  )

  const addAttachment = (att: PickedAttachment) => {
    if (totalAttachmentBytes + att.size > MAX_ATTACHMENT_BYTES) {
      setError(`Attachments are limited to ${formatSize(MAX_ATTACHMENT_BYTES)} total.`)
      return
    }
    setError(null)
    setAttachments((prev) => [...prev, att])
  }

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    addAttachment({
      filename: asset.name,
      contentType: asset.mimeType ?? "application/octet-stream",
      contentBase64: base64,
      size: asset.size ?? Math.ceil((base64.length * 3) / 4),
    })
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (!asset.base64) return
    const filename = asset.fileName ?? `photo-${Date.now()}.jpg`
    addAttachment({
      filename,
      contentType: asset.mimeType ?? "image/jpeg",
      contentBase64: asset.base64,
      size: asset.fileSize ?? Math.ceil((asset.base64.length * 3) / 4),
    })
  }

  const send = async (scheduledAt?: Date) => {
    setError(null)
    if (!activeAccountId) {
      setError("Add a mail account first.")
      return
    }
    const parsed = sendMailSchema.safeParse({
      accountId: activeAccountId,
      to,
      cc,
      bcc,
      subject: subject.trim(),
      bodyText: body,
      threadId: params.threadId || undefined,
      inReplyTo: params.inReplyTo || undefined,
      attachments: attachments.map(({ size: _size, ...rest }) => rest),
      scheduledAt: scheduledAt?.toISOString(),
    })
    if (!parsed.success) {
      setError(to.length === 0 ? "Add at least one recipient." : "Check the message fields.")
      return
    }
    try {
      await sendMutation.mutateAsync(parsed.data)
      router.back()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the message. Try again.")
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {accounts.length > 1 ? (
          <View style={[styles.recipientRow, { borderBottomColor: colors.separator }]}>
            <Text style={[styles.recipientLabel, { color: colors.textTertiary }]}>From</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.accountChips}>
                {accounts.map((account) => {
                  const active = account.id === activeAccountId
                  return (
                    <Pressable
                      key={account.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setAccountId(account.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? "#FFFFFF" : colors.textSecondary },
                        ]}
                      >
                        {account.email}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          </View>
        ) : activeAccount ? (
          <View style={[styles.recipientRow, { borderBottomColor: colors.separator }]}>
            <Text style={[styles.recipientLabel, { color: colors.textTertiary }]}>From</Text>
            <Text style={[styles.fromText, { color: colors.textSecondary }]}>
              {activeAccount.email}
            </Text>
          </View>
        ) : null}

        <RecipientField label="To" chips={to} onChange={setTo} autoFocus={to.length === 0} />

        {showCcBcc ? (
          <>
            <RecipientField label="Cc" chips={cc} onChange={setCc} />
            <RecipientField label="Bcc" chips={bcc} onChange={setBcc} />
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Cc or Bcc recipients"
            onPress={() => setShowCcBcc(true)}
            style={[styles.recipientRow, { borderBottomColor: colors.separator }]}
          >
            <Text style={[styles.ccToggle, { color: colors.textTertiary }]}>Cc/Bcc</Text>
          </Pressable>
        )}

        <View style={[styles.recipientRow, { borderBottomColor: colors.separator }]}>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor={colors.textTertiary}
            style={[styles.subjectInput, { color: colors.text }]}
            accessibilityLabel="Subject"
          />
        </View>

        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
          placeholder="Write your message…"
          placeholderTextColor={colors.textTertiary}
          style={[styles.bodyInput, { color: colors.text }]}
          accessibilityLabel="Message body"
        />

        {attachments.length > 0 ? (
          <View style={styles.attachmentList}>
            {attachments.map((att, index) => (
              <View
                key={`${att.filename}-${index}`}
                style={[
                  styles.attachmentChip,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.separator },
                ]}
              >
                <Paperclip color={colors.accent} size={14} strokeWidth={2} />
                <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.text }]}>
                  {att.filename}
                </Text>
                <Text style={[styles.attachmentSize, { color: colors.textTertiary }]}>
                  {formatSize(att.size)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove attachment ${att.filename}`}
                  hitSlop={8}
                  onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X color={colors.textTertiary} size={16} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.toolbar, { borderTopColor: colors.separator, backgroundColor: colors.background }]}>
        <View style={styles.toolbarLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach file"
            hitSlop={8}
            onPress={pickDocument}
            style={styles.toolButton}
          >
            <Paperclip color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach photo"
            hitSlop={8}
            onPress={pickImage}
            style={styles.toolButton}
          >
            <ImageIcon color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Schedule send"
            hitSlop={8}
            onPress={() => setSchedulePickerOpen(true)}
            style={styles.toolButton}
          >
            <Clock color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={sendMutation.isPending}
          onPress={() => send()}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: colors.accent, opacity: pressed || sendMutation.isPending ? 0.7 : 1 },
          ]}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Send color="#FFFFFF" size={16} strokeWidth={2} />
              <Text style={styles.sendLabel}>Send</Text>
            </>
          )}
        </Pressable>
      </View>

      <SnoozePicker
        visible={schedulePickerOpen}
        title="Send later"
        onClose={() => setSchedulePickerOpen(false)}
        onPick={(when) => {
          setSchedulePickerOpen(false)
          send(when)
        }}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  recipientLabel: {
    fontSize: typography.subheadline.fontSize,
    width: 36,
  },
  fromText: {
    fontSize: typography.subheadline.fontSize,
  },
  chipArea: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    maxWidth: 220,
  },
  chipText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  chipInput: {
    flexGrow: 1,
    minWidth: 120,
    fontSize: typography.subheadline.fontSize,
    paddingVertical: 4,
  },
  accountChips: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  ccToggle: {
    fontSize: typography.subheadline.fontSize,
  },
  subjectInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "500",
    paddingVertical: 4,
  },
  bodyInput: {
    minHeight: 180,
    fontSize: typography.body.fontSize,
    lineHeight: 22,
    paddingTop: spacing.md,
  },
  attachmentList: {
    gap: spacing.xs,
    marginTop: spacing.sm,
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
  attachmentName: {
    flex: 1,
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
  },
  attachmentSize: {
    fontSize: typography.caption.fontSize,
  },
  error: {
    marginTop: spacing.sm,
    fontSize: typography.footnote.fontSize,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  toolButton: {
    padding: spacing.xs,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    minWidth: 88,
    justifyContent: "center",
  },
  sendLabel: {
    color: "#FFFFFF",
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
})

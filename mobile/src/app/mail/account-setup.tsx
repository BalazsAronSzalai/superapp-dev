import { useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useRouter } from "expo-router"

import { Button } from "@/components/ui/button"
import { TextField } from "@/components/ui/text-field"
import { ApiError } from "@/lib/api"
import { useCreateMailAccount } from "@/hooks/use-mail"
import { createMailAccountSchema } from "@/lib/schemas/mail.schemas"
import { spacing, typography, useAppTheme } from "@/theme"

/** Prefill IMAP/SMTP hosts for common providers based on the email domain. */
function providerDefaults(email: string): { imapHost: string; smtpHost: string } | null {
  const domain = email.split("@")[1]?.toLowerCase()
  if (!domain) return null
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { imapHost: "imap.gmail.com", smtpHost: "smtp.gmail.com" }
  }
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { imapHost: "outlook.office365.com", smtpHost: "smtp-mail.outlook.com" }
  }
  if (["yahoo.com", "yahoo.co.uk"].includes(domain)) {
    return { imapHost: "imap.mail.yahoo.com", smtpHost: "smtp.mail.yahoo.com" }
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return { imapHost: "imap.mail.me.com", smtpHost: "smtp.mail.me.com" }
  }
  return null
}

export default function AccountSetupScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const createAccount = useCreateMailAccount()

  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [imapHost, setImapHost] = useState("")
  const [imapPort, setImapPort] = useState("993")
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("465")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const onEmailBlur = () => {
    const defaults = providerDefaults(email.trim())
    if (defaults) {
      if (!imapHost) setImapHost(defaults.imapHost)
      if (!smtpHost) setSmtpHost(defaults.smtpHost)
    }
    if (!username) setUsername(email.trim())
  }

  const onSubmit = async () => {
    setError(null)
    const parsed = createMailAccountSchema.safeParse({
      email: email.trim(),
      displayName: displayName.trim() || undefined,
      imapHost: imapHost.trim(),
      imapPort: Number(imapPort),
      imapSecure: true,
      smtpHost: smtpHost.trim(),
      smtpPort: Number(smtpPort),
      smtpSecure: Number(smtpPort) === 465,
      username: username.trim() || email.trim(),
      password,
    })
    if (!parsed.success) {
      setError("Check the form: every field except display name is required.")
      return
    }
    try {
      await createAccount.mutateAsync(parsed.data)
      router.back()
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Could not verify the account. Check the credentials and try again.",
      )
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Works with any IMAP provider. For Gmail and Outlook, use an app password instead of
          your regular password.
        </Text>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>ACCOUNT</Text>
          <TextField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            onBlur={onEmailBlur}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            testID="mail-setup-email"
          />
          <TextField
            label="Display name (optional)"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your Name"
            testID="mail-setup-display-name"
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>INCOMING (IMAP)</Text>
          <TextField
            label="IMAP host"
            value={imapHost}
            onChangeText={setImapHost}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="imap.example.com"
            testID="mail-setup-imap-host"
          />
          <TextField
            label="IMAP port"
            value={imapPort}
            onChangeText={setImapPort}
            keyboardType="number-pad"
            placeholder="993"
            testID="mail-setup-imap-port"
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>OUTGOING (SMTP)</Text>
          <TextField
            label="SMTP host"
            value={smtpHost}
            onChangeText={setSmtpHost}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="smtp.example.com"
            testID="mail-setup-smtp-host"
          />
          <TextField
            label="SMTP port"
            value={smtpPort}
            onChangeText={setSmtpPort}
            keyboardType="number-pad"
            placeholder="465"
            testID="mail-setup-smtp-port"
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>CREDENTIALS</Text>
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Usually your email address"
            testID="mail-setup-username"
          />
          <TextField
            label="App password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="App-specific password"
            error={error}
            testID="mail-setup-password"
          />
        </View>

        <Button
          title={createAccount.isPending ? "Verifying…" : "Verify & add account"}
          onPress={onSubmit}
          loading={createAccount.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  hint: {
    fontSize: typography.footnote.fontSize,
    lineHeight: typography.footnote.lineHeight,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
})

import { useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"

import { Button } from "@/components/ui/button"
import { TextField } from "@/components/ui/text-field"
import { ApiError } from "@/lib/api"
import { useAuthStore } from "@/lib/auth/store"
import { loginSchema, twoFaCodeSchema } from "@/lib/schemas/auth.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

export default function LoginScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const verify2fa = useAuthStore((s) => s.verify2fa)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 2FA challenge step (login step 2 for TOTP-enabled accounts).
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const codeInputRef = useRef<TextInput>(null)

  const onSubmit = async () => {
    setError(null)
    const parsed = loginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError("Enter a valid email and password.")
      return
    }
    setSubmitting(true)
    try {
      const result = await login(parsed.data.email, parsed.data.password)
      if (result.requires2fa) {
        setPendingToken(result.pendingToken)
        setCode("")
        setTimeout(() => codeInputRef.current?.focus(), 250)
      }
      // Otherwise the protected stack swaps to (tabs) automatically.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign in. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const onVerifyCode = async () => {
    if (!pendingToken) return
    setError(null)
    const parsed = twoFaCodeSchema.safeParse({ code: code.trim() })
    if (!parsed.success) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }
    setSubmitting(true)
    try {
      await verify2fa(pendingToken, parsed.data.code)
      // Protected stack swaps to (tabs) automatically.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify the code. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const backToCredentials = () => {
    setPendingToken(null)
    setCode("")
    setError(null)
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {pendingToken ? (
            <>
              <View style={styles.header}>
                <Text style={[styles.brand, { color: colors.accent }]}>Superapp</Text>
                <Text style={[styles.title, { color: colors.text }]}>Two-factor code</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Enter the 6-digit code from your authenticator app
                </Text>
              </View>

              <View style={styles.form}>
                <TextInput
                  ref={codeInputRef}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Verification code"
                  testID="login-2fa-code"
                  onSubmitEditing={onVerifyCode}
                  style={[
                    styles.codeInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: error ? colors.destructive : colors.separator,
                    },
                  ]}
                />
                {error ? (
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
                ) : null}
                <Button
                  title="Verify"
                  onPress={onVerifyCode}
                  loading={submitting}
                  disabled={code.length !== 6}
                />
              </View>

              <View style={styles.footerRow}>
                <Pressable accessibilityRole="button" onPress={backToCredentials} hitSlop={8}>
                  <Text style={[styles.link, { color: colors.accent }]}>
                    Back to sign in
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={[styles.brand, { color: colors.accent }]}>Superapp</Text>
                <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Sign in to your account
                </Text>
              </View>

              <View style={styles.form}>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  testID="login-email"
                />
                <TextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                  placeholder="Your password"
                  error={error}
                  testID="login-password"
                  onSubmitEditing={onSubmit}
                />
                <Button title="Sign in" onPress={onSubmit} loading={submitting} />
              </View>

              <View style={styles.footerRow}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.subheadline.fontSize,
                  }}
                >
                  {"Don't have an account?"}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push("/register")}
                  hitSlop={8}
                >
                  <Text style={[styles.link, { color: colors.accent }]}>Create one</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.xs,
  },
  brand: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: typography.largeTitle.fontSize,
    lineHeight: typography.largeTitle.lineHeight,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.body.fontSize,
  },
  form: {
    gap: spacing.md,
  },
  codeInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: typography.title2.fontSize,
    fontWeight: "600",
    letterSpacing: 8,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  errorText: {
    fontSize: typography.footnote.fontSize,
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  link: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
})

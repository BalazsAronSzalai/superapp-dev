import { useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"

import { Button } from "@/components/ui/button"
import { TextField } from "@/components/ui/text-field"
import { ApiError } from "@/lib/api"
import { useAuthStore } from "@/lib/auth/store"
import { registerSchema } from "@/lib/schemas/auth.schemas"
import { spacing, typography, useAppTheme } from "@/theme"

export default function RegisterScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const registerUser = useAuthStore((s) => s.register)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async () => {
    setError(null)
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    const parsed = registerSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError("Enter a valid email and a password of at least 8 characters.")
      return
    }
    setSubmitting(true)
    try {
      await registerUser(parsed.data.email, parsed.data.password)
      // Protected stack swaps to (tabs) automatically.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create account. Try again.")
    } finally {
      setSubmitting(false)
    }
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
          <View style={styles.header}>
            <Text style={[styles.brand, { color: colors.accent }]}>Superapp</Text>
            <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              One account for mail, tasks, calendar, notes and finance
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
              testID="register-email"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="At least 8 characters"
              testID="register-password"
            />
            <TextField
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Repeat your password"
              error={error}
              testID="register-confirm"
              onSubmitEditing={onSubmit}
            />
            <Button title="Create account" onPress={onSubmit} loading={submitting} />
          </View>

          <View style={styles.footerRow}>
            <Text style={{ color: colors.textSecondary, fontSize: typography.subheadline.fontSize }}>
              Already have an account?
            </Text>
            <Pressable accessibilityRole="link" onPress={() => router.back()} hitSlop={8}>
              <Text style={[styles.link, { color: colors.accent }]}>Sign in</Text>
            </Pressable>
          </View>
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
    lineHeight: typography.body.lineHeight,
  },
  form: {
    gap: spacing.md,
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

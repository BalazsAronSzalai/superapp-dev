// Settings UI for TOTP two-factor auth: setup (secret + confirm code),
// and disable (requires a valid current code). Backend: /api/auth/2fa/*.
import { useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { setStringAsync } from "expo-clipboard"
import { Copy, ShieldCheck, ShieldOff } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SheetModal } from "@/components/ui/modal"
import { api, ApiError } from "@/lib/api"
import { useAuthStore } from "@/lib/auth/store"
import {
  twoFaSetupResponseSchema,
  userSchema,
  type TwoFaSetupResponse,
  type User,
} from "@/lib/schemas/auth.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

type SheetMode = "enable" | "disable" | null

export function TwoFactorSection() {
  const { colors } = useAppTheme()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [sheetMode, setSheetMode] = useState<SheetMode>(null)
  const [setup, setSetup] = useState<TwoFaSetupResponse | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const enabled = user?.totpEnabled ?? false

  const closeSheet = () => {
    setSheetMode(null)
    setSetup(null)
    setCode("")
    setError(null)
    setCopied(false)
  }

  const startEnable = async () => {
    setError(null)
    setBusy(true)
    try {
      const data = await api("/api/auth/2fa/setup", { method: "POST" })
      setSetup(twoFaSetupResponseSchema.parse(data))
      setSheetMode("enable")
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start 2FA setup.")
      setSheetMode("enable")
    } finally {
      setBusy(false)
    }
  }

  const copySecret = async () => {
    if (!setup) return
    await setStringAsync(setup.manualCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const submitCode = async () => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }
    setError(null)
    setBusy(true)
    try {
      const path = sheetMode === "enable" ? "/api/auth/2fa/enable" : "/api/auth/2fa/disable"
      const data = await api<{ user: unknown }>(path, {
        method: "POST",
        body: { code: trimmed },
      })
      const nextUser: User = userSchema.parse(data.user)
      setUser(nextUser)
      closeSheet()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify the code. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const StatusIcon = enabled ? ShieldCheck : ShieldOff

  return (
    <Card>
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Security</Text>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
          <StatusIcon
            color={enabled ? colors.success : colors.textSecondary}
            size={18}
            strokeWidth={1.75}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            Two-factor authentication
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            {enabled
              ? "Enabled — a code is required at sign in"
              : "Protect your account with an authenticator app"}
          </Text>
        </View>
        {busy && sheetMode === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={enabled ? "Disable two-factor authentication" : "Enable two-factor authentication"}
            hitSlop={8}
            onPress={enabled ? () => setSheetMode("disable") : startEnable}
          >
            <Text
              style={[
                styles.actionText,
                { color: enabled ? colors.destructive : colors.accent },
              ]}
            >
              {enabled ? "Disable" : "Enable"}
            </Text>
          </Pressable>
        )}
      </View>

      <SheetModal
        visible={sheetMode !== null}
        onClose={closeSheet}
        title={sheetMode === "disable" ? "Disable 2FA" : "Enable 2FA"}
      >
        <View style={styles.sheetBody}>
          {sheetMode === "enable" && setup ? (
            <>
              <Text style={[styles.sheetText, { color: colors.textSecondary }]}>
                1. Add this secret to your authenticator app (Google Authenticator, 1Password,
                Authy, …), then enter the 6-digit code it shows.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy setup secret"
                onPress={copySecret}
                style={[styles.secretBox, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text
                  style={[styles.secretText, { color: colors.text }]}
                  numberOfLines={2}
                  selectable
                >
                  {setup.manualCode}
                </Text>
                <View style={styles.copyWrap}>
                  <Copy color={colors.accent} size={16} strokeWidth={2} />
                  <Text style={[styles.copyText, { color: colors.accent }]}>
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </View>
              </Pressable>
              <Text style={[styles.sheetText, { color: colors.textSecondary }]}>
                2. Confirm with the current code:
              </Text>
            </>
          ) : sheetMode === "disable" ? (
            <Text style={[styles.sheetText, { color: colors.textSecondary }]}>
              Enter the current code from your authenticator app to turn off two-factor
              authentication.
            </Text>
          ) : null}

          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Verification code"
            onSubmitEditing={submitCode}
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
            title={sheetMode === "disable" ? "Disable 2FA" : "Turn on 2FA"}
            variant={sheetMode === "disable" ? "destructive" : "primary"}
            onPress={submitCode}
            loading={busy}
            disabled={code.length !== 6}
          />
        </View>
      </SheetModal>
    </Card>
  )
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: typography.footnote.fontSize,
    lineHeight: typography.footnote.lineHeight,
  },
  actionText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
  },
  sheetBody: {
    gap: spacing.sm + 4,
  },
  sheetText: {
    fontSize: typography.subheadline.fontSize,
    lineHeight: typography.subheadline.lineHeight,
  },
  secretBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  secretText: {
    fontSize: typography.subheadline.fontSize,
    fontWeight: "600",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  copyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  copyText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
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
})

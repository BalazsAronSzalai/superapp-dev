import { Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native"
import { Pressable } from "react-native"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TwoFactorSection } from "@/components/settings/two-factor-section"
import { useAuthStore } from "@/lib/auth/store"
import { radius, spacing, typography, useAppTheme, useThemePreference } from "@/theme"

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const

export default function SettingsScreen() {
  const { colors } = useAppTheme()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const biometricLockEnabled = useAuthStore((s) => s.biometricLockEnabled)
  const setBiometricLockEnabled = useAuthStore((s) => s.setBiometricLockEnabled)
  const preference = useThemePreference((s) => s.preference)
  const setPreference = useThemePreference((s) => s.setPreference)

  return (
    <ScrollView
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentContainerStyle={styles.content}
    >
      <Card>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Account</Text>
        <Text style={[styles.email, { color: colors.text }]}>{user?.email ?? "—"}</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Appearance</Text>
        <View style={[styles.segmented, { backgroundColor: colors.surfaceSecondary }]}>
          {themeOptions.map((opt) => {
            const selected = preference === opt.value
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setPreference(opt.value)}
                style={[
                  styles.segment,
                  selected && { backgroundColor: colors.surface },
                  selected && styles.segmentSelected,
                ]}
              >
                <Text
                  style={{
                    color: selected ? colors.text : colors.textSecondary,
                    fontWeight: selected ? "600" : "400",
                    fontSize: typography.subheadline.fontSize,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      <TwoFactorSection />

      {Platform.OS !== "web" ? (
        <Card>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Biometric unlock</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Require Face ID / fingerprint when opening the app
              </Text>
            </View>
            <Switch
              value={biometricLockEnabled}
              onValueChange={setBiometricLockEnabled}
              trackColor={{ true: colors.accent }}
            />
          </View>
        </Card>
      ) : null}

      <Button title="Sign out" variant="destructive" onPress={logout} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  email: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.sm,
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm - 2,
  },
  segmentSelected: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
})

import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Platform, StyleSheet, Text, View } from "react-native"
import { LockKeyhole } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/auth/store"
import { authenticateWithBiometrics, isBiometricAvailable } from "@/lib/biometrics"
import { spacing, typography, useAppTheme } from "@/theme"

/**
 * Biometric unlock (plan.md Phase 1). When the user has enabled the lock,
 * the app blurs behind a lock screen on cold start and on return from
 * background until Face ID / Touch ID / passcode succeeds.
 */
export function BiometricGate() {
  const status = useAuthStore((s) => s.status)
  const enabled = useAuthStore((s) => s.biometricLockEnabled)
  const { colors } = useAppTheme()
  const [locked, setLocked] = useState(false)
  const prompting = useRef(false)

  const unlock = useCallback(async () => {
    if (prompting.current) return
    prompting.current = true
    try {
      const available = await isBiometricAvailable()
      if (!available) {
        // No biometrics enrolled (or web) — never brick the user out.
        setLocked(false)
        return
      }
      const ok = await authenticateWithBiometrics()
      if (ok) setLocked(false)
    } finally {
      prompting.current = false
    }
  }, [])

  // Lock on cold start when the feature is on.
  useEffect(() => {
    if (Platform.OS === "web") return
    if (enabled && status === "authenticated") {
      setLocked(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status])

  // Re-lock when returning from background.
  useEffect(() => {
    if (Platform.OS === "web" || !enabled) return
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && useAuthStore.getState().status === "authenticated") {
        setLocked(true)
      }
    })
    return () => sub.remove()
  }, [enabled])

  // Prompt as soon as we lock.
  useEffect(() => {
    if (locked) unlock()
  }, [locked, unlock])

  if (!locked || status !== "authenticated") return null

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
      <LockKeyhole color={colors.textTertiary} size={48} />
      <Text style={[styles.title, { color: colors.text }]}>Superapp is locked</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Unlock with biometrics to continue
      </Text>
      <Button title="Unlock" onPress={unlock} style={styles.button} />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    zIndex: 100,
  },
  title: {
    fontSize: typography.title2.fontSize,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.subheadline.fontSize,
    textAlign: "center",
  },
  button: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
})

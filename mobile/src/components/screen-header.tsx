import { Pressable, StyleSheet, Text, View } from "react-native"
import type { ReactNode } from "react"
import { useRouter } from "expo-router"
import { Settings } from "lucide-react-native"

import { spacing, typography, useAppTheme } from "@/theme"

interface ScreenHeaderProps {
  title: string
  /** Extra actions rendered left of the settings gear. */
  actions?: ReactNode
  showSettings?: boolean
}

/** Large-title header shared by all module screens (Apple-style). */
export function ScreenHeader({ title, actions, showSettings = true }: ScreenHeaderProps) {
  const { colors } = useAppTheme()
  const router = useRouter()

  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={styles.actions}>
        {actions}
        {showSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            hitSlop={8}
            onPress={() => router.push("/settings")}
          >
            <Settings color={colors.textSecondary} size={22} strokeWidth={1.75} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: typography.largeTitle.fontSize,
    lineHeight: typography.largeTitle.lineHeight,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
})

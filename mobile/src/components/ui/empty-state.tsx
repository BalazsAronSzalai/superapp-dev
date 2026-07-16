import { StyleSheet, Text, View } from "react-native"
import type { ComponentType, ReactNode } from "react"
import type { LucideProps } from "lucide-react-native"

import { radius, spacing, typography, useAppTheme } from "@/theme"

interface EmptyStateProps {
  icon: ComponentType<LucideProps>
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const { colors } = useAppTheme()

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
        <Icon color={colors.textTertiary} size={32} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.title3.fontSize,
    fontWeight: "600",
    textAlign: "center",
  },
  description: {
    fontSize: typography.subheadline.fontSize,
    lineHeight: typography.subheadline.lineHeight,
    textAlign: "center",
    maxWidth: 300,
  },
})

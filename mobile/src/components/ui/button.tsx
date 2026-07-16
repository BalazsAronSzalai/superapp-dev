import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useAppTheme, radius, spacing, typography } from "@/theme"

type Variant = "primary" | "secondary" | "ghost" | "destructive"

interface ButtonProps {
  title: string
  onPress?: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const { colors } = useAppTheme()

  const backgroundColor = {
    primary: colors.accent,
    secondary: colors.surfaceSecondary,
    ghost: "transparent",
    destructive: colors.destructive,
  }[variant]

  const textColor = {
    primary: "#FFFFFF",
    secondary: colors.text,
    ghost: colors.accent,
    destructive: "#FFFFFF",
  }[variant]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  label: {
    fontSize: typography.headline.fontSize,
    fontWeight: "600",
  },
})

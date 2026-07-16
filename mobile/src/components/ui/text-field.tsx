import { useState } from "react"
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native"
import { useAppTheme, radius, spacing, typography } from "@/theme"

interface TextFieldProps extends TextInputProps {
  label?: string
  error?: string | null
}

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const { colors } = useAppTheme()
  const [focused, setFocused] = useState(false)

  const borderColor = error ? colors.destructive : focused ? colors.accent : colors.separator

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: colors.textTertiary }]}>{label}</Text>
      ) : null}
      <TextInput
        {...inputProps}
        onFocus={(e) => {
          setFocused(true)
          inputProps.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          inputProps.onBlur?.(e)
        }}
        placeholderTextColor={colors.textTertiary}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surfaceSecondary,
            borderColor,
          },
          style,
        ]}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: typography.body.fontSize,
    minHeight: 50,
  },
  error: {
    fontSize: typography.footnote.fontSize,
  },
})

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import type { ReactNode } from "react"
import { useAppTheme, radius, spacing } from "@/theme"

interface CardProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

export function Card({ children, style }: CardProps) {
  const { colors, scheme } = useAppTheme()
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.separator,
          shadowOpacity: scheme === "light" ? 0.06 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
})

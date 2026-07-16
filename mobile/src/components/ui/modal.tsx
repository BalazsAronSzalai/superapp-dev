import {
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { X } from "lucide-react-native"
import type { ReactNode } from "react"

import { radius, spacing, typography, useAppTheme } from "@/theme"

interface SheetModalProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Extra styles for the sheet container. */
  contentStyle?: StyleProp<ViewStyle>
  /** Allow dismissing by tapping the backdrop. Defaults to true. */
  dismissOnBackdrop?: boolean
}

/**
 * Apple-style bottom sheet modal (plan.md Phase 1 shared component library).
 * Slides up from the bottom with a dimmed backdrop and a grabber handle.
 */
export function SheetModal({
  visible,
  onClose,
  title,
  children,
  contentStyle,
  dismissOnBackdrop = true,
}: SheetModalProps) {
  const { colors } = useAppTheme()

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdropContainer}>
        <Pressable
          accessibilityLabel="Close modal"
          style={styles.backdrop}
          onPress={dismissOnBackdrop ? onClose : undefined}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface },
            contentStyle,
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
          <View style={styles.header}>
            {title ? (
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : (
              <View />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
            >
              <X color={colors.textSecondary} size={18} strokeWidth={2} />
            </Pressable>
          </View>
          <SafeAreaView edges={["bottom"]}>
            <View style={styles.body}>{children}</View>
          </SafeAreaView>
        </View>
      </View>
    </RNModal>
  )
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.4)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    borderRadius: radius.full,
    height: 5,
    marginBottom: spacing.sm,
    width: 36,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.headline.fontSize,
    fontWeight: "600",
    lineHeight: typography.headline.lineHeight,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: radius.full,
    height: 30,
    justifyContent: "center",
    marginLeft: spacing.sm,
    width: 30,
  },
  body: {
    paddingBottom: spacing.md,
  },
})

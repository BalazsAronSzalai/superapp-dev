import { useRef, type ReactNode, type ComponentType } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable"
import type { LucideProps } from "lucide-react-native"

import { spacing, typography } from "@/theme"

export interface SwipeAction {
  label: string
  icon?: ComponentType<LucideProps>
  color: string
  onPress: () => void
}

interface SwipeableRowProps {
  children: ReactNode
  /** Actions revealed when swiping left (rendered on the right side). */
  rightActions?: SwipeAction[]
  /** Actions revealed when swiping right (rendered on the left side). */
  leftActions?: SwipeAction[]
}

function ActionButtons({
  actions,
  swipeable,
}: {
  actions: SwipeAction[]
  swipeable: React.RefObject<SwipeableMethods | null>
}) {
  return (
    <View style={styles.actionsRow}>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => {
              swipeable.current?.close()
              action.onPress()
            }}
            style={[styles.action, { backgroundColor: action.color }]}
          >
            {Icon ? <Icon color="#FFFFFF" size={20} strokeWidth={2} /> : null}
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * Swipeable list row (Reanimated 4 + Gesture Handler, plan.md Phase 1).
 * Used for archive/delete/flag in Mail and complete/delete in To-Do.
 */
export function SwipeableRow({ children, rightActions, leftActions }: SwipeableRowProps) {
  const ref = useRef<SwipeableMethods>(null)

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={
        rightActions?.length
          ? () => <ActionButtons actions={rightActions} swipeable={ref} />
          : undefined
      }
      renderLeftActions={
        leftActions?.length
          ? () => <ActionButtons actions={leftActions} swipeable={ref} />
          : undefined
      }
    >
      {children}
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
    width: 76,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
})

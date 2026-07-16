import { Pressable, StyleSheet, Text, View } from "react-native"
import { CalendarClock, Moon, Sun, Sunrise } from "lucide-react-native"
import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react-native"

import { SheetModal } from "@/components/ui/modal"
import { radius, spacing, typography, useAppTheme } from "@/theme"

interface SnoozeOption {
  label: string
  detail: string
  icon: ComponentType<LucideProps>
  compute: () => Date
}

function at(date: Date, hours: number): Date {
  const d = new Date(date)
  d.setHours(hours, 0, 0, 0)
  return d
}

const OPTIONS: SnoozeOption[] = [
  {
    label: "Later today",
    detail: "In 3 hours",
    icon: Sun,
    compute: () => new Date(Date.now() + 3 * 60 * 60 * 1000),
  },
  {
    label: "This evening",
    detail: "Today, 6:00 PM",
    icon: Moon,
    compute: () => {
      const d = at(new Date(), 18)
      // If 6 PM already passed, fall back to +3h.
      return d.getTime() > Date.now() ? d : new Date(Date.now() + 3 * 60 * 60 * 1000)
    },
  },
  {
    label: "Tomorrow",
    detail: "8:00 AM",
    icon: Sunrise,
    compute: () => {
      const d = at(new Date(), 8)
      d.setDate(d.getDate() + 1)
      return d
    },
  },
  {
    label: "Next week",
    detail: "Monday, 8:00 AM",
    icon: CalendarClock,
    compute: () => {
      const d = at(new Date(), 8)
      const day = d.getDay()
      const daysUntilMonday = ((8 - day) % 7) || 7
      d.setDate(d.getDate() + daysUntilMonday)
      return d
    },
  },
]

interface SnoozePickerProps {
  visible: boolean
  onClose: () => void
  onPick: (until: Date) => void
  title?: string
}

/** Bottom-sheet snooze/schedule preset picker (Mail module). */
export function SnoozePicker({ visible, onClose, onPick, title = "Snooze until" }: SnoozePickerProps) {
  const { colors } = useAppTheme()

  return (
    <SheetModal visible={visible} onClose={onClose} title={title}>
      <View style={styles.list}>
        {OPTIONS.map((option) => {
          const Icon = option.icon
          return (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}, ${option.detail}`}
              onPress={() => {
                onClose()
                onPick(option.compute())
              }}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
                <Icon color={colors.accent} size={18} strokeWidth={1.75} />
              </View>
              <View style={styles.labels}>
                <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
                <Text style={[styles.detail, { color: colors.textTertiary }]}>
                  {option.detail}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  labels: {
    flex: 1,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  detail: {
    fontSize: typography.footnote.fontSize,
  },
})

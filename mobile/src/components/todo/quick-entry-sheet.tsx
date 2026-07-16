import { useMemo, useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import { CalendarClock, Flag, Hash, Moon, Repeat } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { parseQuickEntry } from "@/lib/task-parser"
import { formatTaskDate } from "@/components/todo/task-row"
import { radius, spacing, typography, useAppTheme } from "@/theme"
import type { CreateTaskInput } from "@/lib/schemas/task.schemas"

const PRIORITY_NAMES = ["", "Low", "Medium", "High"] as const

interface QuickEntrySheetProps {
  visible: boolean
  onClose: () => void
  onSubmit: (input: CreateTaskInput) => void
  /** Pre-assign the created task to a list. */
  listId?: string
  submitting?: boolean
}

/**
 * Things-style natural-language quick entry.
 * Type e.g. "Buy milk tomorrow #errand !high" — recognized tokens are
 * lifted out of the title and previewed as chips below the input.
 */
export function QuickEntrySheet({
  visible,
  onClose,
  onSubmit,
  listId,
  submitting = false,
}: QuickEntrySheetProps) {
  const { colors } = useAppTheme()
  const [text, setText] = useState("")

  const parsed = useMemo(() => parseQuickEntry(text), [text])
  const canSubmit = parsed.title.length > 0 && !submitting

  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      title: parsed.title,
      listId: listId ?? null,
      scheduledDate: parsed.scheduledDate,
      priority: parsed.priority,
      rrule: parsed.rrule,
      isSomeday: parsed.isSomeday,
      tags: parsed.tags,
      sortOrder: 0,
    })
    setText("")
  }

  const close = () => {
    setText("")
    onClose()
  }

  const chips: { key: string; icon: typeof Hash; label: string }[] = []
  if (parsed.scheduledDate) {
    chips.push({ key: "date", icon: CalendarClock, label: formatTaskDate(parsed.scheduledDate) })
  }
  if (parsed.rrule) chips.push({ key: "rrule", icon: Repeat, label: "Repeats" })
  if (parsed.priority > 0) {
    chips.push({ key: "prio", icon: Flag, label: PRIORITY_NAMES[parsed.priority] ?? "" })
  }
  if (parsed.isSomeday) chips.push({ key: "someday", icon: Moon, label: "Someday" })
  for (const tag of parsed.tags) chips.push({ key: `tag-${tag}`, icon: Hash, label: tag })

  return (
    <SheetModal visible={visible} onClose={close} title="New To-Do">
      <View style={styles.body}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder="e.g. Buy milk tomorrow #errand !high"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="New to-do"
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.separator,
            },
          ]}
        />

        {chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.map(({ key, icon: Icon, label }) => (
              <View key={key} style={[styles.chip, { backgroundColor: colors.accentMuted }]}>
                <Icon color={colors.accent} size={12} strokeWidth={2} />
                <Text style={[styles.chipText, { color: colors.accent }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {"Try: tomorrow, next fri 3pm, every week, #tag, !high, someday"}
          </Text>
        )}

        <Button title="Add To-Do" onPress={submit} disabled={!canSubmit} loading={submitting} />
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: typography.body.fontSize,
    minHeight: 50,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  hint: {
    fontSize: typography.footnote.fontSize,
  },
})

import { useMemo, useState } from "react"
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { BellRing, CalendarClock, MapPin, Repeat, Sun } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { formatDayLabel, formatEventTime } from "@/components/calendar/event-row"
import { parseQuickEvent } from "@/lib/event-parser"
import type { Calendar, CreateEventInput } from "@/lib/schemas/calendar.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

interface EventQuickEntrySheetProps {
  visible: boolean
  onClose: () => void
  onSubmit: (input: CreateEventInput) => void
  calendars: Calendar[]
  /** Pre-select a calendar (defaults to the first one). */
  defaultCalendarId?: string
  /** Default date used when the text has no explicit date (selected day). */
  defaultDate?: Date
  submitting?: boolean
}

/**
 * Fantastical-style natural-language event entry.
 * Type e.g. "Lunch with Anna tomorrow 12pm at Cafe Kor" — recognized tokens
 * are lifted out of the title and previewed as chips below the input.
 */
export function EventQuickEntrySheet({
  visible,
  onClose,
  onSubmit,
  calendars,
  defaultCalendarId,
  defaultDate,
  submitting = false,
}: EventQuickEntrySheetProps) {
  const { colors } = useAppTheme()
  const [text, setText] = useState("")
  const [calendarId, setCalendarId] = useState<string | null>(null)

  const parsed = useMemo(() => parseQuickEvent(text), [text])
  const selectedCalendarId = calendarId ?? defaultCalendarId ?? calendars[0]?.id ?? null
  const canSubmit = parsed.title.length > 0 && !!selectedCalendarId && !submitting

  const submit = () => {
    if (!canSubmit || !selectedCalendarId) return

    let { startTime, endTime } = parsed
    // No explicit date in the text and a day is selected in the calendar →
    // anchor the event on that day, keeping the parsed (or default) clock time.
    if (!parsed.hasExplicitTime && defaultDate) {
      const start = new Date(parsed.startTime)
      const durationMs = new Date(parsed.endTime).getTime() - start.getTime()
      const anchored = new Date(defaultDate)
      anchored.setHours(start.getHours(), start.getMinutes(), 0, 0)
      startTime = anchored.toISOString()
      endTime = new Date(anchored.getTime() + durationMs).toISOString()
    }

    onSubmit({
      calendarId: selectedCalendarId,
      title: parsed.title,
      startTime,
      endTime,
      allDay: parsed.allDay,
      location: parsed.location,
      rrule: parsed.rrule,
      reminderMinutes: parsed.reminderMinutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    })
    setText("")
  }

  const close = () => {
    setText("")
    setCalendarId(null)
    onClose()
  }

  const start = new Date(parsed.startTime)
  const chips: { key: string; icon: typeof MapPin; label: string }[] = []
  if (parsed.allDay) {
    chips.push({ key: "allday", icon: Sun, label: `All day · ${formatDayLabel(start)}` })
  } else if (parsed.hasExplicitTime) {
    chips.push({
      key: "when",
      icon: CalendarClock,
      label: `${formatDayLabel(start)} ${formatEventTime(parsed.startTime)}`,
    })
  }
  if (parsed.location) chips.push({ key: "loc", icon: MapPin, label: parsed.location })
  if (parsed.rrule) chips.push({ key: "rrule", icon: Repeat, label: "Repeats" })
  if (parsed.reminderMinutes != null) {
    chips.push({ key: "remind", icon: BellRing, label: `${parsed.reminderMinutes} min before` })
  }

  return (
    <SheetModal visible={visible} onClose={close} title="New Event">
      <View style={styles.body}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder="e.g. Lunch tomorrow 12pm at Cafe Kor"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="New event"
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
                <Text style={[styles.chipText, { color: colors.accent }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {"Try: tomorrow 3pm, fri 9-10am, all day, every monday, at <place>"}
          </Text>
        )}

        {calendars.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.calendarBar}
          >
            {calendars.map((cal) => {
              const active = cal.id === selectedCalendarId
              return (
                <Button
                  key={cal.id}
                  title={cal.name}
                  variant={active ? "primary" : "secondary"}
                  onPress={() => setCalendarId(cal.id)}
                  style={styles.calendarChip}
                />
              )
            })}
          </ScrollView>
        ) : null}

        <Button title="Add Event" onPress={submit} disabled={!canSubmit} loading={submitting} />
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
    maxWidth: 260,
  },
  chipText: {
    flexShrink: 1,
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  hint: {
    fontSize: typography.footnote.fontSize,
  },
  calendarBar: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  calendarChip: {
    paddingVertical: spacing.sm,
    minHeight: 0,
  },
})

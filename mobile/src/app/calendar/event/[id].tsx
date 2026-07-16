// Event detail — edit title/notes/location, calendar, times, reminder, recurrence.
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  Clock,
  MapPin,
  Repeat,
} from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { SheetModal } from "@/components/ui/modal"
import { LinkedItems } from "@/components/glue/linked-items"
import { formatDayLabel, formatEventTime } from "@/components/calendar/event-row"
import {
  useCalendars,
  useDeleteEvent,
  useEvent,
  usePatchEvent,
} from "@/hooks/use-calendar"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const REMINDER_OPTIONS = [
  { value: null, label: "None" },
  { value: 5, label: "5m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 1440, label: "1d" },
] as const

const DAY_SHIFTS = [
  { label: "−1 week", days: -7 },
  { label: "−1 day", days: -1 },
  { label: "+1 day", days: 1 },
  { label: "+1 week", days: 7 },
] as const

/** Time chips 06:00–22:00 on the half hour. */
const TIME_SLOTS: { label: string; hours: number; minutes: number }[] = []
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) continue
    TIME_SLOTS.push({
      label: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
      hours: h,
      minutes: m,
    })
  }
}

const DURATION_OPTIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "90 min", minutes: 90 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
  { label: "Full day", minutes: 480 },
] as const

function confirmDelete(title: string, onConfirm: () => void) {
  const message = `Delete "${title}"?`
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm()
    return
  }
  Alert.alert("Delete event", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ])
}

export default function EventDetailScreen() {
  const { colors } = useAppTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const eventQuery = useEvent(id)
  const calendarsQuery = useCalendars()
  const patchMutation = usePatchEvent()
  const deleteMutation = useDeleteEvent()

  const event = eventQuery.data
  const calendars = calendarsQuery.data ?? []

  // Local draft state for save-on-blur text edits.
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [location, setLocation] = useState("")
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false)
  const [startPickerOpen, setStartPickerOpen] = useState(false)
  const [endPickerOpen, setEndPickerOpen] = useState(false)

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setNotes(event.description ?? "")
      setLocation(event.location ?? "")
    }
  }, [event?.id, event?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (eventQuery.isLoading || !event) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  const calendar = calendars.find((c) => c.id === event.calendarId)
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000)

  const patch = (input: Parameters<typeof patchMutation.mutate>[0]["input"]) =>
    patchMutation.mutate({ id: event.id, input })

  const saveTitle = () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== event.title) patch({ title: trimmed })
    else setTitle(event.title)
  }

  const saveNotes = () => {
    const trimmed = notes.trim()
    if (trimmed !== (event.description ?? "")) patch({ description: trimmed || null })
  }

  const saveLocation = () => {
    const trimmed = location.trim()
    if (trimmed !== (event.location ?? "")) patch({ location: trimmed || null })
  }

  /** Move the start, preserving the event's duration. */
  const moveStart = (next: Date) => {
    const duration = end.getTime() - start.getTime()
    patch({
      startTime: next.toISOString(),
      endTime: new Date(next.getTime() + duration).toISOString(),
    })
  }

  const setDuration = (minutes: number) => {
    patch({ endTime: new Date(start.getTime() + minutes * 60_000).toISOString() })
  }

  const toggleAllDay = (allDay: boolean) => {
    if (allDay) {
      const s = new Date(start)
      s.setHours(0, 0, 0, 0)
      patch({
        allDay: true,
        startTime: s.toISOString(),
        endTime: new Date(s.getTime() + 86_400_000).toISOString(),
      })
    } else {
      const s = new Date(start)
      s.setHours(9, 0, 0, 0)
      patch({
        allDay: false,
        startTime: s.toISOString(),
        endTime: new Date(s.getTime() + 3_600_000).toISOString(),
      })
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title */}
      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        multiline
        accessibilityLabel="Event title"
        style={[styles.titleInput, { color: colors.text }]}
      />

      {/* Notes */}
      <TextInput
        value={notes}
        onChangeText={setNotes}
        onBlur={saveNotes}
        multiline
        placeholder="Notes"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Notes"
        style={[
          styles.notesInput,
          {
            color: colors.textSecondary,
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.separator,
          },
        ]}
      />

      {/* Metadata */}
      <View style={[styles.metaCard, { backgroundColor: colors.surfaceSecondary }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change calendar"
          onPress={() => setCalendarPickerOpen(true)}
          style={styles.metaRow}
        >
          <View
            style={[styles.calendarDot, { backgroundColor: calendar?.color ?? colors.accent }]}
          />
          <Text style={[styles.metaLabel, { color: colors.text }]}>Calendar</Text>
          <Text style={[styles.metaValue, { color: colors.textSecondary }]} numberOfLines={1}>
            {calendar?.name ?? "…"}
          </Text>
          <ChevronRight color={colors.textTertiary} size={16} strokeWidth={2} />
        </Pressable>

        <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />

        <View style={styles.metaRow}>
          <CalendarDays color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>All-day</Text>
          <View style={styles.metaValue} />
          <Switch
            value={event.allDay}
            onValueChange={toggleAllDay}
            trackColor={{ true: colors.accent, false: colors.separator }}
            accessibilityLabel="All-day"
          />
        </View>

        <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change start"
          onPress={() => setStartPickerOpen(true)}
          style={styles.metaRow}
        >
          <Clock color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>Starts</Text>
          <Text style={[styles.metaValue, { color: colors.textSecondary }]}>
            {formatDayLabel(start)}
            {event.allDay ? "" : ` ${formatEventTime(event.startTime)}`}
          </Text>
          <ChevronRight color={colors.textTertiary} size={16} strokeWidth={2} />
        </Pressable>

        {!event.allDay ? (
          <>
            <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change end"
              onPress={() => setEndPickerOpen(true)}
              style={styles.metaRow}
            >
              <Clock color={colors.textTertiary} size={18} strokeWidth={2} />
              <Text style={[styles.metaLabel, { color: colors.text }]}>Ends</Text>
              <Text style={[styles.metaValue, { color: colors.textSecondary }]}>
                {formatDayLabel(end)} {formatEventTime(event.endTime)}
              </Text>
              <ChevronRight color={colors.textTertiary} size={16} strokeWidth={2} />
            </Pressable>
          </>
        ) : null}

        <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />

        <View style={styles.metaRow}>
          <MapPin color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>Location</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            onBlur={saveLocation}
            placeholder="Add location"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Location"
            style={[styles.locationInput, { color: colors.textSecondary }]}
          />
        </View>

        <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />

        <View style={styles.metaRow}>
          <BellRing color={colors.accent} size={18} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.text }]}>Alert</Text>
          <View style={styles.reminderOptions}>
            {REMINDER_OPTIONS.map((opt) => {
              const active = event.reminderMinutes === opt.value
              return (
                <Pressable
                  key={opt.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => patch({ reminderMinutes: opt.value })}
                  style={[
                    styles.reminderChip,
                    { backgroundColor: active ? colors.accent : colors.background },
                  ]}
                >
                  <Text
                    style={[
                      styles.reminderChipText,
                      { color: active ? "#FFFFFF" : colors.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {event.rrule ? (
          <>
            <View style={[styles.metaSeparator, { backgroundColor: colors.separator }]} />
            <View style={styles.metaRow}>
              <Repeat color={colors.accent} size={18} strokeWidth={2} />
              <Text style={[styles.metaLabel, { color: colors.text }]}>Repeats</Text>
              <Text style={[styles.metaValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {event.rrule}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove repeat"
                hitSlop={8}
                onPress={() => patch({ rrule: null })}
              >
                <Text style={[styles.removeText, { color: colors.destructive }]}>Remove</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      {/* Cross-module links (superapp glue) */}
      <LinkedItems entityType="event" entityId={event.id} />

      <Button
        title="Delete Event"
        variant="destructive"
        onPress={() =>
          confirmDelete(event.title, () =>
            deleteMutation.mutate(event.id, { onSuccess: () => router.back() }),
          )
        }
        style={styles.deleteButton}
      />

      {/* Calendar picker */}
      <SheetModal
        visible={calendarPickerOpen}
        onClose={() => setCalendarPickerOpen(false)}
        title="Calendar"
      >
        <View style={styles.sheetOptions}>
          {calendars.map((cal) => (
            <Button
              key={cal.id}
              title={cal.name}
              variant={event.calendarId === cal.id ? "primary" : "secondary"}
              onPress={() => {
                patch({ calendarId: cal.id })
                setCalendarPickerOpen(false)
              }}
            />
          ))}
        </View>
      </SheetModal>

      {/* Start picker: shift the day, then pick a time slot */}
      <SheetModal
        visible={startPickerOpen}
        onClose={() => setStartPickerOpen(false)}
        title="Starts"
      >
        <View style={styles.sheetOptions}>
          <View style={styles.shiftRow}>
            {DAY_SHIFTS.map((shift) => (
              <Pressable
                key={shift.label}
                accessibilityRole="button"
                accessibilityLabel={`Shift ${shift.label}`}
                onPress={() => {
                  const next = new Date(start)
                  next.setDate(next.getDate() + shift.days)
                  moveStart(next)
                }}
                style={[styles.shiftChip, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={[styles.shiftChipText, { color: colors.accent }]}>{shift.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
            {formatDayLabel(start)}
            {event.allDay ? "" : ` · ${formatEventTime(event.startTime)}`}
          </Text>
          {!event.allDay ? (
            <ScrollView style={styles.slotScroll}>
              <View style={styles.slotGrid}>
                {TIME_SLOTS.map((slot) => {
                  const active =
                    start.getHours() === slot.hours && start.getMinutes() === slot.minutes
                  return (
                    <Pressable
                      key={slot.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        const next = new Date(start)
                        next.setHours(slot.hours, slot.minutes, 0, 0)
                        moveStart(next)
                        setStartPickerOpen(false)
                      }}
                      style={[
                        styles.slotChip,
                        { backgroundColor: active ? colors.accent : colors.surfaceSecondary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotChipText,
                          { color: active ? "#FFFFFF" : colors.textSecondary },
                        ]}
                      >
                        {slot.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </SheetModal>

      {/* End picker: duration from start */}
      <SheetModal visible={endPickerOpen} onClose={() => setEndPickerOpen(false)} title="Duration">
        <View style={styles.sheetOptions}>
          {DURATION_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              title={opt.label}
              variant={durationMinutes === opt.minutes ? "primary" : "secondary"}
              onPress={() => {
                setDuration(opt.minutes)
                setEndPickerOpen(false)
              }}
            />
          ))}
        </View>
      </SheetModal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  titleInput: {
    fontSize: typography.title2.fontSize,
    lineHeight: typography.title2.lineHeight,
    fontWeight: "700",
    padding: 0,
  },
  notesInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    minHeight: 80,
    textAlignVertical: "top",
  },
  metaCard: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  calendarDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    marginHorizontal: 2,
  },
  metaLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: typography.body.fontSize,
  },
  metaSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  locationInput: {
    flex: 1,
    textAlign: "right",
    fontSize: typography.body.fontSize,
    padding: 0,
  },
  reminderOptions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.xs + 2,
  },
  reminderChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  reminderChipText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
  removeText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  deleteButton: {
    marginTop: spacing.sm,
  },
  sheetOptions: {
    gap: spacing.sm,
  },
  sheetHint: {
    fontSize: typography.footnote.fontSize,
    textAlign: "center",
  },
  shiftRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  shiftChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  shiftChipText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
  slotScroll: {
    maxHeight: 240,
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  slotChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  slotChipText: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
  },
})

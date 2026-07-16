// Calendars management — create/rename/recolor/delete calendars, sync device
// calendars (expo-calendar) into the app, and import .ics files.
import { useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarDays, FileUp, Pencil, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SheetModal } from "@/components/ui/modal"
import { TextField } from "@/components/ui/text-field"
import { calendarKeys, useCalendars, useCreateCalendar, useDeleteCalendar, usePatchCalendar } from "@/hooks/use-calendar"
import * as calendarApi from "@/lib/calendar-api"
import {
  isDeviceCalendarAvailable,
  listDeviceCalendars,
  requestDeviceCalendarAccess,
  syncDeviceCalendar,
  type DeviceCalendar,
} from "@/lib/device-calendar"
import type { Calendar } from "@/lib/schemas/calendar.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** iOS system palette swatches for calendar colors. */
const CALENDAR_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF3B30",
  "#AF52DE",
  "#FF2D55",
  "#5AC8FA",
  "#8E8E93",
] as const

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`)
    return
  }
  Alert.alert(title, message)
}

function confirmDelete(name: string, onConfirm: () => void) {
  const message = `Delete "${name}"? All of its events will be deleted too.`
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm()
    return
  }
  Alert.alert("Delete calendar", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ])
}

interface EditorState {
  /** null = creating a new calendar. */
  calendar: Calendar | null
  name: string
  color: string
}

export default function CalendarsScreen() {
  const { colors } = useAppTheme()
  const queryClient = useQueryClient()

  const calendarsQuery = useCalendars()
  const createMutation = useCreateCalendar()
  const patchMutation = usePatchCalendar()
  const deleteMutation = useDeleteCalendar()

  const calendars = calendarsQuery.data ?? []
  const [editor, setEditor] = useState<EditorState | null>(null)

  // Device sync state.
  const [devicePickerOpen, setDevicePickerOpen] = useState(false)
  const [deviceCalendars, setDeviceCalendars] = useState<DeviceCalendar[]>([])
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  // .ics import state.
  const [icsPickerOpen, setIcsPickerOpen] = useState(false)
  const [icsText, setIcsText] = useState<string | null>(null)
  const [icsImporting, setIcsImporting] = useState(false)

  const openCreate = () => setEditor({ calendar: null, name: "", color: CALENDAR_COLORS[0] })
  const openEdit = (calendar: Calendar) =>
    setEditor({ calendar, name: calendar.name, color: calendar.color ?? CALENDAR_COLORS[0] })

  const saving = createMutation.isPending || patchMutation.isPending
  const canSave = (editor?.name.trim().length ?? 0) > 0 && !saving

  const save = () => {
    if (!editor || !canSave) return
    const name = editor.name.trim()
    const onSuccess = () => setEditor(null)
    if (editor.calendar) {
      patchMutation.mutate(
        { id: editor.calendar.id, input: { name, color: editor.color } },
        { onSuccess },
      )
    } else {
      createMutation.mutate({ name, color: editor.color }, { onSuccess })
    }
  }

  // ---------------------------------------------------------------------------
  // Device calendar sync (device → app, idempotent .ics import)
  // ---------------------------------------------------------------------------

  const openDevicePicker = async () => {
    if (!isDeviceCalendarAvailable()) {
      notify("Not available", "Device calendars are only available on iOS and Android.")
      return
    }
    setDeviceLoading(true)
    try {
      const granted = await requestDeviceCalendarAccess()
      if (!granted) {
        notify("Permission needed", "Allow calendar access in system settings to sync device calendars.")
        return
      }
      setDeviceCalendars(await listDeviceCalendars())
      setDevicePickerOpen(true)
    } catch {
      notify("Sync failed", "Could not read device calendars.")
    } finally {
      setDeviceLoading(false)
    }
  }

  /** Import a device calendar into an app calendar of the same name (created on demand). */
  const syncDevice = async (device: DeviceCalendar) => {
    setSyncingId(device.id)
    try {
      let target = calendars.find((c) => c.name === device.title)
      if (!target) {
        const created = await calendarApi.createCalendar({
          name: device.title,
          color: device.color ?? undefined,
        })
        target = created.calendar
      }
      const result = await syncDeviceCalendar(device.id, target.id)
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      notify(
        "Sync complete",
        `${device.title}: ${result.imported} imported, ${result.skipped} already synced.`,
      )
    } catch {
      notify("Sync failed", `Could not import events from "${device.title}".`)
    } finally {
      setSyncingId(null)
    }
  }

  // ---------------------------------------------------------------------------
  // .ics file import
  // ---------------------------------------------------------------------------

  const pickIcsFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/calendar", "*/*"],
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    try {
      const text = await new File(asset.uri).text()
      if (!text.includes("BEGIN:VCALENDAR")) {
        notify("Invalid file", "That file doesn't look like an .ics calendar.")
        return
      }
      setIcsText(text)
      setIcsPickerOpen(true)
    } catch {
      notify("Import failed", "Could not read the selected file.")
    }
  }

  const importIcsInto = async (calendarId: string) => {
    if (!icsText) return
    setIcsImporting(true)
    try {
      const result = await calendarApi.importIcs({ calendarId, ics: icsText })
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      setIcsPickerOpen(false)
      setIcsText(null)
      notify("Import complete", `${result.imported} imported, ${result.skipped} skipped.`)
    } catch {
      notify("Import failed", "The server could not import that file.")
    } finally {
      setIcsImporting(false)
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {calendarsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {calendars.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No calendars yet"
              description="Create color-coded calendars like Personal, Work, or Family."
              action={
                <Button title="Create a calendar" onPress={openCreate} style={styles.emptyAction} />
              }
            />
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
              {calendars.map((calendar, i) => (
                <View key={calendar.id}>
                  {i > 0 ? (
                    <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                  ) : null}
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: calendar.color ?? colors.accent },
                      ]}
                    />
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                      {calendar.name}
                    </Text>
                    <Text style={[styles.rowCount, { color: colors.textTertiary }]}>
                      {calendar.eventCount ?? 0}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit calendar ${calendar.name}`}
                      hitSlop={8}
                      onPress={() => openEdit(calendar)}
                    >
                      <Pencil color={colors.textTertiary} size={17} strokeWidth={1.75} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete calendar ${calendar.name}`}
                      hitSlop={8}
                      onPress={() =>
                        confirmDelete(calendar.name, () => deleteMutation.mutate(calendar.id))
                      }
                    >
                      <Trash2 color={colors.textTertiary} size={17} strokeWidth={1.75} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Import section */}
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Import</Text>
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sync device calendars"
              onPress={openDevicePicker}
              disabled={deviceLoading}
              style={({ pressed }) => [styles.row, { opacity: pressed || deviceLoading ? 0.7 : 1 }]}
            >
              <Smartphone color={colors.accent} size={20} strokeWidth={2} />
              <View style={styles.importBody}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Device calendars</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  Pull events from iCloud, Google, and other device calendars
                </Text>
              </View>
              {deviceLoading ? <ActivityIndicator color={colors.accent} /> : null}
            </Pressable>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Import .ics file"
              onPress={pickIcsFile}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            >
              <FileUp color={colors.accent} size={20} strokeWidth={2} />
              <View style={styles.importBody}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Import .ics file</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  Add events from an exported calendar file
                </Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New calendar"
        onPress={openCreate}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Plus color="#FFFFFF" size={26} strokeWidth={2.25} />
      </Pressable>

      {/* Create / edit calendar */}
      <SheetModal
        visible={editor != null}
        onClose={() => setEditor(null)}
        title={editor?.calendar ? "Edit Calendar" : "New Calendar"}
      >
        {editor ? (
          <View style={styles.editorBody}>
            <TextField
              label="Name"
              value={editor.name}
              onChangeText={(name) => setEditor({ ...editor, name })}
              placeholder="e.g. Work"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <View>
              <Text style={[styles.swatchLabel, { color: colors.textTertiary }]}>Color</Text>
              <View style={styles.swatches}>
                {CALENDAR_COLORS.map((c) => {
                  const active = editor.color === c
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`Color ${c}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setEditor({ ...editor, color: c })}
                      style={[
                        styles.swatch,
                        { backgroundColor: c },
                        active ? { borderColor: colors.text, borderWidth: 2 } : null,
                      ]}
                    />
                  )
                })}
              </View>
            </View>
            <Button
              title={editor.calendar ? "Save" : "Create Calendar"}
              onPress={save}
              disabled={!canSave}
              loading={saving}
            />
          </View>
        ) : null}
      </SheetModal>

      {/* Device calendar picker */}
      <SheetModal
        visible={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        title="Sync Device Calendar"
      >
        <View style={styles.editorBody}>
          {deviceCalendars.length === 0 ? (
            <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
              No device calendars found.
            </Text>
          ) : (
            deviceCalendars.map((device) => (
              <Pressable
                key={device.id}
                accessibilityRole="button"
                accessibilityLabel={`Sync ${device.title}`}
                disabled={syncingId !== null}
                onPress={() => syncDevice(device)}
                style={({ pressed }) => [
                  styles.deviceRow,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    opacity: pressed || (syncingId && syncingId !== device.id) ? 0.6 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.colorDot, { backgroundColor: device.color ?? colors.accent }]}
                />
                <View style={styles.importBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                    {device.title}
                  </Text>
                  {device.source ? (
                    <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                      {device.source}
                    </Text>
                  ) : null}
                </View>
                {syncingId === device.id ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <RefreshCw color={colors.textTertiary} size={17} strokeWidth={1.75} />
                )}
              </Pressable>
            ))
          )}
          <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
            Events from the last 30 days and next 90 days are imported. Re-syncing only adds new
            events.
          </Text>
        </View>
      </SheetModal>

      {/* .ics import target picker */}
      <SheetModal
        visible={icsPickerOpen}
        onClose={() => {
          setIcsPickerOpen(false)
          setIcsText(null)
        }}
        title="Import Into"
      >
        <View style={styles.editorBody}>
          {calendars.map((calendar) => (
            <Button
              key={calendar.id}
              title={calendar.name}
              variant="secondary"
              onPress={() => importIcsInto(calendar.id)}
              loading={icsImporting}
            />
          ))}
          {calendars.length === 0 ? (
            <Text style={[styles.sheetHint, { color: colors.textTertiary }]}>
              Create a calendar first to import events into it.
            </Text>
          ) : null}
        </View>
      </SheetModal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyAction: {
    marginTop: spacing.sm,
    alignSelf: "center",
    minWidth: 200,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 96,
    gap: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: typography.footnote.fontSize,
  },
  rowCount: {
    flex: 1,
    textAlign: "right",
    fontSize: typography.subheadline.fontSize,
    marginRight: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  importBody: {
    flex: 1,
    gap: 1,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  editorBody: {
    gap: spacing.md,
  },
  swatchLabel: {
    fontSize: typography.footnote.fontSize,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm + 2,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
  },
  sheetHint: {
    fontSize: typography.footnote.fontSize,
    textAlign: "center",
  },
})

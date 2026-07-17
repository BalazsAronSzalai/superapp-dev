import { describe, it, expect } from "@jest/globals"
import { buildIcs, parseIcs, type IcsEvent } from "../src/services/ics.js"

const timedEvent: IcsEvent = {
  uid: "evt-1@superapp",
  title: "Team sync; planning, review",
  description: "Line one\nLine two",
  location: "Room 42",
  start: new Date("2026-07-16T09:00:00Z"),
  end: new Date("2026-07-16T10:00:00Z"),
  allDay: false,
  rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
}

const allDayEvent: IcsEvent = {
  uid: "evt-2@superapp",
  title: "Holiday",
  description: null,
  location: null,
  start: new Date("2026-08-20T00:00:00Z"),
  end: new Date("2026-08-21T00:00:00Z"),
  allDay: true,
  rrule: null,
}

describe("buildIcs", () => {
  it("emits a VCALENDAR wrapper with calendar name", () => {
    const ics = buildIcs("My Cal", [])
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics).toContain("X-WR-CALNAME:My Cal")
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true)
  })

  it("escapes commas, semicolons and newlines per RFC 5545", () => {
    const ics = buildIcs("Cal", [timedEvent])
    expect(ics).toContain("SUMMARY:Team sync\\; planning\\, review")
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two")
  })

  it("uses UTC basic format for timed events", () => {
    const ics = buildIcs("Cal", [timedEvent])
    expect(ics).toContain("DTSTART:20260716T090000Z")
    expect(ics).toContain("DTEND:20260716T100000Z")
  })

  it("uses VALUE=DATE for all-day events", () => {
    const ics = buildIcs("Cal", [allDayEvent])
    expect(ics).toContain("DTSTART;VALUE=DATE:20260820")
    expect(ics).toContain("DTEND;VALUE=DATE:20260821")
  })

  it("folds lines longer than 75 characters", () => {
    const long = { ...timedEvent, title: "X".repeat(200), description: null }
    const ics = buildIcs("Cal", [long])
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })
})

describe("parseIcs", () => {
  it("round-trips its own export", () => {
    const ics = buildIcs("Cal", [timedEvent, allDayEvent])
    const parsed = parseIcs(ics)
    expect(parsed).toHaveLength(2)

    const [a, b] = parsed
    expect(a?.uid).toBe(timedEvent.uid)
    expect(a?.title).toBe(timedEvent.title)
    expect(a?.description).toBe(timedEvent.description)
    expect(a?.location).toBe(timedEvent.location)
    expect(a?.start.toISOString()).toBe(timedEvent.start.toISOString())
    expect(a?.end.toISOString()).toBe(timedEvent.end.toISOString())
    expect(a?.allDay).toBe(false)
    expect(a?.rrule).toBe(timedEvent.rrule)

    expect(b?.uid).toBe(allDayEvent.uid)
    expect(b?.allDay).toBe(true)
    expect(b?.start.toISOString()).toBe(allDayEvent.start.toISOString())
  })

  it("unfolds continuation lines", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:folded-1",
      "SUMMARY:Hello",
      " World",
      "DTSTART:20260716T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")
    const [ev] = parseIcs(ics)
    expect(ev?.title).toBe("HelloWorld")
  })

  it("defaults a missing DTEND to +1h (timed) and +1d (all-day)", () => {
    const timed = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:No end",
      "DTSTART:20260716T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n")
    const [t] = parseIcs(timed)
    expect(t?.end.getTime()).toBe(t!.start.getTime() + 3_600_000)

    const allday = timed.replace("DTSTART:20260716T090000Z", "DTSTART;VALUE=DATE:20260716")
    const [ad] = parseIcs(allday)
    expect(ad?.allDay).toBe(true)
    expect(ad?.end.getTime()).toBe(ad!.start.getTime() + 86_400_000)
  })

  it("skips events without SUMMARY or DTSTART", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:no-start",
      "SUMMARY:Missing start",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:no-summary",
      "DTSTART:20260716T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n")
    expect(parseIcs(ics)).toEqual([])
  })

  it("generates a fallback uid when UID is absent", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:No uid",
      "DTSTART:20260716T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n")
    const [ev] = parseIcs(ics)
    expect(ev?.uid).toBeTruthy()
  })

  it("unescapes TEXT values on import", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:esc-1",
      "SUMMARY:a\\, b\\; c\\nnew",
      "DTSTART:20260716T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n")
    const [ev] = parseIcs(ics)
    expect(ev?.title).toBe("a, b; c\nnew")
  })
})

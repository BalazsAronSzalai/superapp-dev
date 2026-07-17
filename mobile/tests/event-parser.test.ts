import { describe, it, expect } from "@jest/globals"
import { parseQuickEvent } from "../src/lib/event-parser"

// Fixed reference point: Friday, 17 July 2026, 10:00 local time.
// All expectations are built with local-time Date constructors so the suite
// is deterministic regardless of the machine's timezone.
const NOW = new Date(2026, 6, 17, 10, 0, 0, 0)

/** Local-time ISO helper (month is 0-based, mirrors the Date constructor). */
const iso = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo, d, h, mi, 0, 0).toISOString()

describe("parseQuickEvent — no tokens", () => {
  it("defaults to the next full hour for one hour", () => {
    const r = parseQuickEvent("Coffee", NOW)
    expect(r.title).toBe("Coffee")
    expect(r.startTime).toBe(iso(2026, 6, 17, 11))
    expect(r.endTime).toBe(iso(2026, 6, 17, 12))
    expect(r.hasExplicitTime).toBe(false)
    expect(r.allDay).toBe(false)
    expect(r.location).toBeNull()
    expect(r.rrule).toBeNull()
    expect(r.reminderMinutes).toBeNull()
  })
})

describe("parseQuickEvent — dates and times", () => {
  it("parses date + time + location", () => {
    const r = parseQuickEvent("Lunch with Anna tomorrow 12pm at Cafe Kor", NOW)
    expect(r.title).toBe("Lunch with Anna")
    expect(r.startTime).toBe(iso(2026, 6, 18, 12))
    expect(r.endTime).toBe(iso(2026, 6, 18, 13))
    expect(r.location).toBe("Cafe Kor")
    expect(r.hasExplicitTime).toBe(true)
  })

  it("defaults to 09:00 when a date is given without a time", () => {
    const r = parseQuickEvent("Review jul 20", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 20, 9))
    expect(r.endTime).toBe(iso(2026, 6, 20, 10))
  })

  it("parses 'tonight' defaulting to 20:00", () => {
    const r = parseQuickEvent("Dinner tonight", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 20))
  })

  it("treats 'at 9am' as a time, not a location", () => {
    const r = parseQuickEvent("Breakfast today at 9am", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 9))
    expect(r.location).toBeNull()
    expect(r.title).toBe("Breakfast")
  })

  it("parses 24h clock times", () => {
    const r = parseQuickEvent("Standup today 17:30", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 17, 30))
  })
})

describe("parseQuickEvent — time ranges and durations", () => {
  it("parses a time range", () => {
    const r = parseQuickEvent("Meeting today 3pm-4:30pm", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 15))
    expect(r.endTime).toBe(iso(2026, 6, 17, 16, 30))
    expect(r.title).toBe("Meeting")
  })

  it("parses '<time> to <time>' ranges", () => {
    const r = parseQuickEvent("Workshop today 15:00 to 16:30", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 15))
    expect(r.endTime).toBe(iso(2026, 6, 17, 16, 30))
  })

  it("rolls overnight ranges to the next day", () => {
    const r = parseQuickEvent("Party today 11pm-1am", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 23))
    expect(r.endTime).toBe(iso(2026, 6, 18, 1))
  })

  it("parses 'for 90 min' durations", () => {
    const r = parseQuickEvent("Gym today 6pm for 90 min", NOW)
    expect(r.startTime).toBe(iso(2026, 6, 17, 18))
    expect(r.endTime).toBe(iso(2026, 6, 17, 19, 30))
  })

  it("parses fractional hour durations like 'for 1.5h'", () => {
    const r = parseQuickEvent("Deep work today 9am for 1.5h", NOW)
    expect(r.endTime).toBe(iso(2026, 6, 17, 10, 30))
  })
})

describe("parseQuickEvent — all day", () => {
  it("spans midnight to midnight", () => {
    const r = parseQuickEvent("Conference tomorrow all day", NOW)
    expect(r.allDay).toBe(true)
    expect(r.startTime).toBe(iso(2026, 6, 18))
    expect(r.endTime).toBe(iso(2026, 6, 19))
    expect(r.title).toBe("Conference")
  })
})

describe("parseQuickEvent — reminders", () => {
  it("parses 'remind 30 min before'", () => {
    const r = parseQuickEvent("Call landlord tomorrow 10am remind 30 min before", NOW)
    expect(r.reminderMinutes).toBe(30)
    expect(r.title).toBe("Call landlord")
  })

  it("parses 'alert 1 hour before' as 60 minutes", () => {
    expect(parseQuickEvent("Flight jul 22 6am alert 1 hour before", NOW).reminderMinutes).toBe(60)
  })
})

describe("parseQuickEvent — recurrence", () => {
  it("parses 'every monday' and anchors the start to that weekday", () => {
    const r = parseQuickEvent("Standup every monday 9:15am", NOW)
    expect(r.rrule).toBe("FREQ=WEEKLY;BYDAY=MO")
    // NOW is Friday Jul 17 → next Monday is Jul 20.
    expect(r.startTime).toBe(iso(2026, 6, 20, 9, 15))
  })

  it("parses weekday lists like 'every mon,wed'", () => {
    expect(parseQuickEvent("Standup every mon,wed 9am", NOW).rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE")
  })

  it("parses 'every 2 weeks' with an interval", () => {
    const r = parseQuickEvent("Payday every 2 weeks", NOW)
    expect(r.rrule).toBe("FREQ=WEEKLY;INTERVAL=2")
  })

  it.each([
    ["daily", "FREQ=DAILY"],
    ["weekly", "FREQ=WEEKLY"],
    ["monthly", "FREQ=MONTHLY"],
    ["yearly", "FREQ=YEARLY"],
  ])("parses '%s'", (token, expected) => {
    expect(parseQuickEvent(`Backup ${token}`, NOW).rrule).toBe(expected)
  })
})

describe("parseQuickEvent — combined input", () => {
  it("parses the kitchen-sink example", () => {
    const r = parseQuickEvent("Gym every monday 6pm for 90 min at Iron Works remind 15 min before", NOW)
    expect(r.title).toBe("Gym")
    expect(r.rrule).toBe("FREQ=WEEKLY;BYDAY=MO")
    expect(r.startTime).toBe(iso(2026, 6, 20, 18))
    expect(r.endTime).toBe(iso(2026, 6, 20, 19, 30))
    expect(r.location).toBe("Iron Works")
    expect(r.reminderMinutes).toBe(15)
  })
})

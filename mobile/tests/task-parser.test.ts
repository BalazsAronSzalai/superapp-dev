import { describe, it, expect } from "@jest/globals"
import { parseQuickEntry } from "../src/lib/task-parser"

// Fixed reference point: Friday, 17 July 2026, 10:00 local time.
// All expectations are built with local-time Date constructors so the suite
// is deterministic regardless of the machine's timezone.
const NOW = new Date(2026, 6, 17, 10, 0, 0, 0)

/** Local-time ISO helper (month is 0-based, mirrors the Date constructor). */
const iso = (y: number, mo: number, d: number, h = 9, mi = 0) =>
  new Date(y, mo, d, h, mi, 0, 0).toISOString()

describe("parseQuickEntry — no tokens", () => {
  it("returns the input as title with all defaults", () => {
    const r = parseQuickEntry("Call mom", NOW)
    expect(r).toEqual({
      title: "Call mom",
      scheduledDate: null,
      tags: [],
      priority: 0,
      rrule: null,
      isSomeday: false,
      matched: [],
    })
  })

  it("collapses extra whitespace in the title", () => {
    expect(parseQuickEntry("  Buy   milk  ", NOW).title).toBe("Buy milk")
  })
})

describe("parseQuickEntry — tags", () => {
  it("extracts a single #tag and strips it from the title", () => {
    const r = parseQuickEntry("Buy milk #errand", NOW)
    expect(r.title).toBe("Buy milk")
    expect(r.tags).toEqual(["errand"])
  })

  it("extracts multiple tags, lowercased", () => {
    const r = parseQuickEntry("Clean garage #Home #Chores", NOW)
    expect(r.tags).toEqual(["home", "chores"])
    expect(r.title).toBe("Clean garage")
  })
})

describe("parseQuickEntry — priority", () => {
  it.each([
    ["!low", 1],
    ["!med", 2],
    ["!medium", 2],
    ["!high", 3],
  ])("parses named priority %s", (token, expected) => {
    const r = parseQuickEntry(`Pay rent ${token}`, NOW)
    expect(r.priority).toBe(expected)
    expect(r.title).toBe("Pay rent")
  })

  it.each([
    ["!", 1],
    ["!!", 2],
    ["!!!", 3],
  ])("parses bang priority %s", (token, expected) => {
    const r = parseQuickEntry(`Pay rent ${token}`, NOW)
    expect(r.priority).toBe(expected)
    expect(r.title).toBe("Pay rent")
  })
})

describe("parseQuickEntry — dates", () => {
  it("parses 'today' with a default 09:00 time", () => {
    const r = parseQuickEntry("Water plants today", NOW)
    expect(r.scheduledDate).toBe(iso(2026, 6, 17))
    expect(r.title).toBe("Water plants")
  })

  it("parses 'tomorrow'", () => {
    expect(parseQuickEntry("Buy milk tomorrow", NOW).scheduledDate).toBe(iso(2026, 6, 18))
  })

  it("parses 'tonight' defaulting to 20:00", () => {
    expect(parseQuickEntry("Movie tonight", NOW).scheduledDate).toBe(iso(2026, 6, 17, 20))
  })

  it("parses 'in 2 weeks'", () => {
    expect(parseQuickEntry("Renew passport in 2 weeks", NOW).scheduledDate).toBe(iso(2026, 6, 31))
  })

  it("parses 'in 3 days'", () => {
    expect(parseQuickEntry("Follow up in 3 days", NOW).scheduledDate).toBe(iso(2026, 6, 20))
  })

  it("parses 'next week' as next Monday", () => {
    // NOW is a Friday → next Monday is Jul 20.
    expect(parseQuickEntry("Plan sprint next week", NOW).scheduledDate).toBe(iso(2026, 6, 20))
  })

  it("parses a weekday name, rolling a same-day match a full week forward", () => {
    // NOW is a Friday, so "friday" means next Friday (Jul 24).
    expect(parseQuickEntry("Team lunch friday", NOW).scheduledDate).toBe(iso(2026, 6, 24))
  })

  it("parses an upcoming weekday name", () => {
    // Next Tuesday after Fri Jul 17 is Jul 21.
    expect(parseQuickEntry("Dentist tue", NOW).scheduledDate).toBe(iso(2026, 6, 21))
  })

  it("parses month-day dates ('jul 20' and '20 jul')", () => {
    expect(parseQuickEntry("Flight jul 20", NOW).scheduledDate).toBe(iso(2026, 6, 20))
    expect(parseQuickEntry("Flight 20 jul", NOW).scheduledDate).toBe(iso(2026, 6, 20))
  })

  it("rolls a past month-day date to next year", () => {
    expect(parseQuickEntry("Taxes jan 5", NOW).scheduledDate).toBe(iso(2027, 0, 5))
  })

  it("respects an explicit year", () => {
    expect(parseQuickEntry("Reunion jul 20 2027", NOW).scheduledDate).toBe(iso(2027, 6, 20))
  })
})

describe("parseQuickEntry — times", () => {
  it("combines a date with an am/pm time", () => {
    const r = parseQuickEntry("Dentist tomorrow 3pm", NOW)
    expect(r.scheduledDate).toBe(iso(2026, 6, 18, 15))
    expect(r.title).toBe("Dentist")
  })

  it("parses 24h clock times", () => {
    expect(parseQuickEntry("Standup today 17:30", NOW).scheduledDate).toBe(iso(2026, 6, 17, 17, 30))
  })

  it("parses 'at <time>'", () => {
    expect(parseQuickEntry("Call bank tomorrow at 9am", NOW).scheduledDate).toBe(iso(2026, 6, 18, 9))
  })

  it("handles 12am / 12pm correctly", () => {
    expect(parseQuickEntry("Lunch today 12pm", NOW).scheduledDate).toBe(iso(2026, 6, 17, 12))
    expect(parseQuickEntry("Backup today 12am", NOW).scheduledDate).toBe(iso(2026, 6, 17, 0))
  })

  it("ignores a bare ambiguous number as a time", () => {
    const r = parseQuickEntry("Buy 3 apples today", NOW)
    expect(r.title).toBe("Buy 3 apples")
    expect(r.scheduledDate).toBe(iso(2026, 6, 17))
  })
})

describe("parseQuickEntry — recurrence", () => {
  it("parses 'every N days' with an interval", () => {
    const r = parseQuickEntry("Water plants every 2 days", NOW)
    expect(r.rrule).toBe("FREQ=DAILY;INTERVAL=2")
    expect(r.title).toBe("Water plants")
  })

  it("anchors a recurring task without a date to today", () => {
    expect(parseQuickEntry("Water plants every 2 days", NOW).scheduledDate).toBe(iso(2026, 6, 17))
  })

  it("parses 'every monday'", () => {
    expect(parseQuickEntry("Gym every monday", NOW).rrule).toBe("FREQ=WEEKLY;BYDAY=MO")
  })

  it("parses weekday lists like 'every mon,wed,fri'", () => {
    expect(parseQuickEntry("Standup every mon,wed,fri", NOW).rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR")
  })

  it.each([
    ["daily", "FREQ=DAILY"],
    ["weekly", "FREQ=WEEKLY"],
    ["monthly", "FREQ=MONTHLY"],
    ["yearly", "FREQ=YEARLY"],
    ["every day", "FREQ=DAILY"],
    ["every month", "FREQ=MONTHLY"],
  ])("parses '%s'", (token, expected) => {
    expect(parseQuickEntry(`Review notes ${token}`, NOW).rrule).toBe(expected)
  })
})

describe("parseQuickEntry — someday", () => {
  it("parks the task in Someday and strips the token", () => {
    const r = parseQuickEntry("Learn piano someday", NOW)
    expect(r.isSomeday).toBe(true)
    expect(r.title).toBe("Learn piano")
    expect(r.scheduledDate).toBeNull()
  })
})

describe("parseQuickEntry — combined input", () => {
  it("parses the kitchen-sink example", () => {
    const r = parseQuickEntry("Buy milk tomorrow 5pm #errand #groceries !high", NOW)
    expect(r.title).toBe("Buy milk")
    expect(r.scheduledDate).toBe(iso(2026, 6, 18, 17))
    expect(r.tags).toEqual(["errand", "groceries"])
    expect(r.priority).toBe(3)
    expect(r.rrule).toBeNull()
    expect(r.isSomeday).toBe(false)
    expect(r.matched.length).toBeGreaterThanOrEqual(3)
  })
})

import { describe, it, expect } from "@jest/globals"
import { parseRrule, nextOccurrence, occurrencesBetween } from "../src/services/recurrence.js"

// All dates constructed in UTC to stay deterministic regardless of server TZ.
const d = (iso: string) => new Date(iso)

describe("parseRrule", () => {
  it("parses a simple daily rule with default interval", () => {
    expect(parseRrule("FREQ=DAILY")).toEqual({
      freq: "DAILY",
      interval: 1,
      byDay: [],
      byMonthDay: null,
    })
  })

  it("strips an RRULE: prefix and is case-insensitive", () => {
    expect(parseRrule("rrule:freq=weekly;interval=2")).toEqual({
      freq: "WEEKLY",
      interval: 2,
      byDay: [],
      byMonthDay: null,
    })
  })

  it("parses BYDAY codes into sorted JS weekday numbers", () => {
    expect(parseRrule("FREQ=WEEKLY;BYDAY=FR,MO,WE")?.byDay).toEqual([1, 3, 5])
  })

  it("parses BYMONTHDAY", () => {
    expect(parseRrule("FREQ=MONTHLY;BYMONTHDAY=15")?.byMonthDay).toBe(15)
  })

  it("ignores unknown keys like UNTIL/COUNT", () => {
    expect(parseRrule("FREQ=DAILY;COUNT=10;UNTIL=20270101T000000Z")?.freq).toBe("DAILY")
  })

  it.each([
    ["", "empty string"],
    ["FREQ=HOURLY", "unsupported freq"],
    ["INTERVAL=2", "missing freq"],
    ["FREQ=DAILY;INTERVAL=0", "interval below 1"],
    ["FREQ=DAILY;INTERVAL=1000", "interval above 999"],
    ["FREQ=WEEKLY;BYDAY=XX", "invalid BYDAY code"],
    ["FREQ=MONTHLY;BYMONTHDAY=32", "BYMONTHDAY out of range"],
  ])("returns null for %s (%s)", (rrule) => {
    expect(parseRrule(rrule)).toBeNull()
  })
})

describe("nextOccurrence", () => {
  it("advances a daily rule by one day, preserving time of day", () => {
    const next = nextOccurrence("FREQ=DAILY", d("2026-03-02T09:30:00Z"), d("2026-03-02T10:00:00Z"))
    expect(next?.toISOString()).toBe("2026-03-03T09:30:00.000Z")
  })

  it("keeps a daily interval rule on its grid when 'after' is mid-window", () => {
    // Base Mar 1, every 3 days → Mar 4, Mar 7, ... After Mar 5 → Mar 7.
    const next = nextOccurrence(
      "FREQ=DAILY;INTERVAL=3",
      d("2026-03-01T08:00:00Z"),
      d("2026-03-05T00:00:00Z"),
    )
    expect(next?.toISOString()).toBe("2026-03-07T08:00:00.000Z")
  })

  it("returns the next allowed weekday for WEEKLY;BYDAY", () => {
    // 2026-03-05 is a Thursday; next MO/WE is Monday 2026-03-09.
    const next = nextOccurrence(
      "FREQ=WEEKLY;BYDAY=MO,WE",
      d("2026-03-05T12:00:00Z"),
      d("2026-03-05T12:00:00Z"),
    )
    expect(next?.toISOString()).toBe("2026-03-09T12:00:00.000Z")
  })

  it("advances plain WEEKLY by 7 * interval days", () => {
    const next = nextOccurrence(
      "FREQ=WEEKLY;INTERVAL=2",
      d("2026-03-02T07:00:00Z"),
      d("2026-03-02T07:00:00Z"),
    )
    expect(next?.toISOString()).toBe("2026-03-16T07:00:00.000Z")
  })

  it("clamps MONTHLY to the last day of shorter months", () => {
    // Base Jan 31 → February (2026 is not a leap year) clamps to Feb 28.
    const next = nextOccurrence(
      "FREQ=MONTHLY",
      d("2026-01-31T10:00:00Z"),
      d("2026-01-31T10:00:00Z"),
    )
    expect(next?.getUTCMonth()).toBe(1) // February
    expect(next?.getUTCDate()).toBe(28)
  })

  it("honours BYMONTHDAY for MONTHLY rules", () => {
    const next = nextOccurrence(
      "FREQ=MONTHLY;BYMONTHDAY=15",
      d("2026-03-15T09:00:00Z"),
      d("2026-03-20T00:00:00Z"),
    )
    expect(next?.toISOString()).toBe("2026-04-15T09:00:00.000Z")
  })

  it("advances YEARLY by interval years", () => {
    const next = nextOccurrence(
      "FREQ=YEARLY",
      d("2026-06-01T00:00:00Z"),
      d("2026-06-01T00:00:00Z"),
    )
    expect(next?.toISOString()).toBe("2027-06-01T00:00:00.000Z")
  })

  it("skips forward past a far-future 'after' floor", () => {
    const next = nextOccurrence("FREQ=DAILY", d("2026-01-01T06:00:00Z"), d("2026-01-10T12:00:00Z"))
    expect(next?.toISOString()).toBe("2026-01-11T06:00:00.000Z")
  })

  it("returns null for an unparseable rule", () => {
    expect(nextOccurrence("FREQ=NOPE", d("2026-01-01T00:00:00Z"))).toBeNull()
  })
})

describe("occurrencesBetween", () => {
  it("expands a daily rule inside the window, including the base", () => {
    const out = occurrencesBetween(
      "FREQ=DAILY",
      d("2026-03-01T09:00:00Z"),
      d("2026-03-01T00:00:00Z"),
      d("2026-03-04T23:59:59Z"),
    )
    expect(out.map((x) => x.toISOString())).toEqual([
      "2026-03-01T09:00:00.000Z",
      "2026-03-02T09:00:00.000Z",
      "2026-03-03T09:00:00.000Z",
      "2026-03-04T09:00:00.000Z",
    ])
  })

  it("excludes occurrences before the range start", () => {
    const out = occurrencesBetween(
      "FREQ=DAILY",
      d("2026-03-01T09:00:00Z"),
      d("2026-03-03T00:00:00Z"),
      d("2026-03-04T23:59:59Z"),
    )
    expect(out.map((x) => x.toISOString())).toEqual([
      "2026-03-03T09:00:00.000Z",
      "2026-03-04T09:00:00.000Z",
    ])
  })

  it("returns [] for an inverted range", () => {
    expect(
      occurrencesBetween(
        "FREQ=DAILY",
        d("2026-03-01T00:00:00Z"),
        d("2026-03-10T00:00:00Z"),
        d("2026-03-05T00:00:00Z"),
      ),
    ).toEqual([])
  })

  it("returns [] for an unparseable rule", () => {
    expect(
      occurrencesBetween("garbage", d("2026-03-01T00:00:00Z"), d("2026-03-01T00:00:00Z"), d("2026-03-31T00:00:00Z")),
    ).toEqual([])
  })

  it("caps the number of occurrences at max", () => {
    const out = occurrencesBetween(
      "FREQ=DAILY",
      d("2026-01-01T00:00:00Z"),
      d("2026-01-01T00:00:00Z"),
      d("2027-01-01T00:00:00Z"),
      10,
    )
    expect(out).toHaveLength(10)
  })
})

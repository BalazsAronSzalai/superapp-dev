/**
 * Natural-language event parser for the Calendar module (Fantastical-style).
 *
 * Extracts structured event fields from a single input line, e.g.:
 *   "Lunch with Anna tomorrow 12pm at Cafe Kor"
 *   "Standup every weekday 9:15am"        (weekday list via "every mon,tue,…")
 *   "Flight to Berlin jul 22 6am-8:30am"
 *   "Conference friday all day"
 *   "Gym every monday 6pm for 90 min"
 *
 * Supported tokens (case-insensitive):
 *   Dates:      today, tonight, tomorrow, next week, weekday names
 *               ("fri", "friday", "next friday"), "in N days/weeks",
 *               "jul 20" / "20 jul" style month-day dates
 *   Times:      9am, 5pm, 17:30, "at 9am"; ranges "3pm-4pm", "15:00-16:30"
 *   Duration:   "for 30 min", "for 2 hours", "for 1.5h"
 *   All-day:    "all day"
 *   Location:   "at <place>" (after time extraction, so "at 3pm" is a time)
 *   Recurrence: daily/weekly/monthly/yearly, "every day/week/month/year",
 *               "every N days/weeks", "every monday", "every mon,wed"
 *   Reminder:   "remind 30 min before", "alert 1 hour before"
 *
 * Pure + dependency-free so it can be unit-tested in isolation.
 */

export interface ParsedQuickEvent {
  /** Input with all recognized tokens stripped out. */
  title: string
  /** ISO datetime. Defaults to the next full hour today when no date/time given. */
  startTime: string
  /** ISO datetime (startTime + 1h unless a range/duration/all-day was given). */
  endTime: string
  allDay: boolean
  location: string | null
  /** RFC 5545 RRULE string or null. */
  rrule: string | null
  /** Minutes before start, or null. */
  reminderMinutes: number | null
  /** Human-readable summary of what was recognized (for UI hints). */
  matched: string[]
  /** True when any date or time token was found (vs. pure defaults). */
  hasExplicitTime: boolean
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

const WEEKDAY_RRULE_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const WEEKDAY_ALT = Object.keys(WEEKDAYS).join("|")
const MONTH_ALT = Object.keys(MONTHS).join("|")

interface TimeParts {
  hours: number
  minutes: number
}

function parseTimeToken(raw: string): TimeParts | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return null
  let hours = Number.parseInt(m[1]!, 10)
  const minutes = m[2] ? Number.parseInt(m[2], 10) : 0
  const meridiem = m[3]?.toLowerCase()
  if (hours > 23 || minutes > 59) return null
  if (meridiem === "pm" && hours < 12) hours += 12
  if (meridiem === "am" && hours === 12) hours = 0
  // Bare "3" without am/pm or colon is too ambiguous — require a marker.
  if (!meridiem && !m[2]) return null
  return { hours, minutes }
}

function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from)
  let delta = (weekday - d.getDay() + 7) % 7
  if (delta === 0) delta = 7 // "friday" on a Friday means next Friday
  d.setDate(d.getDate() + delta)
  return d
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s{2,}/g, " ").trim()
}

const TIME_RE = String.raw`\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)`

/** Parse a quick-event line. `now` is injectable for tests. */
export function parseQuickEvent(input: string, now: Date = new Date()): ParsedQuickEvent {
  let text = ` ${input} ` // pad so \s-delimited regexes match at the edges
  const matched: string[] = []

  // -------------------------------------------------------------------------
  // All-day
  // -------------------------------------------------------------------------
  let allDay = false
  text = text.replace(/(^|\s)all[\s-]day(?=\s|$)/i, (_all, pre: string) => {
    allDay = true
    return pre
  })

  // -------------------------------------------------------------------------
  // Reminder: "remind/alert N min/hours before"
  // -------------------------------------------------------------------------
  let reminderMinutes: number | null = null
  text = text.replace(
    /(^|\s)(?:remind(?:er)?|alert)\s+(?:me\s+)?(\d{1,4})\s*(min(?:ute)?s?|h(?:ou)?rs?|h)\s+before(?=\s|$)/i,
    (_all, pre: string, n: string, unit: string) => {
      const value = Number.parseInt(n, 10)
      reminderMinutes = /^h/i.test(unit) ? value * 60 : value
      return pre
    },
  )
  if (reminderMinutes !== null) matched.push(`reminder: ${reminderMinutes} min before`)

  // -------------------------------------------------------------------------
  // Recurrence → RRULE
  // -------------------------------------------------------------------------
  let rrule: string | null = null

  // "every N days/weeks/months/years"
  text = text.replace(
    /(^|\s)every\s+(\d{1,3})\s+(day|week|month|year)s?(?=\s|$)/i,
    (_all, pre: string, n: string, unit: string) => {
      const freq = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" }[
        unit.toLowerCase() as "day" | "week" | "month" | "year"
      ]
      rrule = `FREQ=${freq};INTERVAL=${Number.parseInt(n, 10)}`
      return pre
    },
  )

  // "every monday" / "every mon,wed,fri" (also anchors the date)
  let recurringAnchorWeekday: number | null = null
  if (!rrule) {
    const everyDayRe = new RegExp(
      `(^|\\s)every\\s+((?:${WEEKDAY_ALT})(?:\\s*,\\s*(?:${WEEKDAY_ALT}))*)(?=\\s|$)`,
      "i",
    )
    text = text.replace(everyDayRe, (_all, pre: string, days: string) => {
      const nums = days
        .split(",")
        .map((d) => WEEKDAYS[d.trim().toLowerCase()])
        .filter((d): d is number => d !== undefined)
      const codes = nums.map((d) => WEEKDAY_RRULE_CODES[d])
      rrule = `FREQ=WEEKLY;BYDAY=${codes.join(",")}`
      recurringAnchorWeekday = nums[0] ?? null
      return pre
    })
  }

  // "every day/week/month/year", "daily/weekly/monthly/yearly"
  if (!rrule) {
    text = text.replace(
      /(^|\s)(?:every\s+(day|week|month|year)|(daily|weekly|monthly|yearly))(?=\s|$)/i,
      (_all, pre: string, unit?: string, word?: string) => {
        const key = (unit ?? word!.replace(/ly$/i, "").replace(/i$/i, "y")).toLowerCase()
        const freq = { day: "DAILY", dai: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" }[
          key as "day" | "week" | "month" | "year"
        ]
        if (freq) rrule = `FREQ=${freq}`
        return pre
      },
    )
  }
  if (rrule) matched.push(`repeats: ${rrule}`)

  // -------------------------------------------------------------------------
  // Time range: "3pm-4pm", "15:00 - 16:30", "3pm to 4:30pm"
  // -------------------------------------------------------------------------
  let startClock: TimeParts | null = null
  let endClock: TimeParts | null = null

  const rangeRe = new RegExp(
    `(^|\\s)(?:at\\s+|from\\s+)?(${TIME_RE})\\s*(?:-|–|to|until)\\s*(${TIME_RE})(?=\\s|$)`,
    "i",
  )
  text = text.replace(rangeRe, (all, pre: string, t1: string, t2: string) => {
    const p1 = parseTimeToken(t1)
    const p2 = parseTimeToken(t2)
    if (!p1 || !p2) return all
    startClock = p1
    endClock = p2
    return pre
  })

  // Single time: "3pm", "at 17:30"
  if (!startClock) {
    const singleRe = new RegExp(`(^|\\s)(?:at\\s+)?(${TIME_RE})(?=\\s|$)`, "i")
    text = text.replace(singleRe, (all, pre: string, t: string) => {
      const parsed = parseTimeToken(t)
      if (!parsed) return all
      startClock = parsed
      return pre
    })
  }

  // -------------------------------------------------------------------------
  // Duration: "for 30 min", "for 2 hours", "for 1.5h"
  // -------------------------------------------------------------------------
  let durationMinutes: number | null = null
  text = text.replace(
    /(^|\s)for\s+(\d{1,3}(?:\.\d)?)\s*(min(?:ute)?s?|h(?:ou)?rs?|h)(?=\s|$)/i,
    (_all, pre: string, n: string, unit: string) => {
      const value = Number.parseFloat(n)
      durationMinutes = Math.round(/^h/i.test(unit) ? value * 60 : value)
      return pre
    },
  )

  // -------------------------------------------------------------------------
  // Date
  // -------------------------------------------------------------------------
  let date: Date | null = null

  // today / tonight / tomorrow
  text = text.replace(
    /(^|\s)(today|tonight|tomorrow|tmrw|tmr)(?=\s|$)/i,
    (_all, pre: string, word: string) => {
      const w = word.toLowerCase()
      const d = new Date(now)
      if (w === "tomorrow" || w === "tmrw" || w === "tmr") d.setDate(d.getDate() + 1)
      if (w === "tonight" && !startClock) startClock = { hours: 20, minutes: 0 }
      date = d
      return pre
    },
  )

  // in N days / weeks
  if (!date) {
    text = text.replace(
      /(^|\s)in\s+(\d{1,3})\s+(day|week)s?(?=\s|$)/i,
      (_all, pre: string, n: string, unit: string) => {
        const d = new Date(now)
        d.setDate(d.getDate() + Number.parseInt(n, 10) * (unit.toLowerCase() === "week" ? 7 : 1))
        date = d
        return pre
      },
    )
  }

  // next week
  if (!date) {
    text = text.replace(/(^|\s)next\s+week(?=\s|$)/i, (_all, pre: string) => {
      const d = new Date(now)
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)) // next Monday
      date = d
      return pre
    })
  }

  // (next|this|on)? weekday
  if (!date) {
    const weekdayRe = new RegExp(`(^|\\s)(next\\s+|this\\s+|on\\s+)?(${WEEKDAY_ALT})(?=\\s|$)`, "i")
    text = text.replace(weekdayRe, (_all, pre: string, _qualifier: string | undefined, day: string) => {
      const weekday = WEEKDAYS[day.toLowerCase()]!
      date = nextWeekday(now, weekday)
      return pre
    })
  }

  // "jul 20" / "20 jul" (optionally "jul 20 2027")
  if (!date) {
    const mdRe = new RegExp(
      `(^|\\s)(?:on\\s+)?(?:(${MONTH_ALT})\\s+(\\d{1,2})|(\\d{1,2})\\s+(${MONTH_ALT}))(?:\\s+(\\d{4}))?(?=\\s|$)`,
      "i",
    )
    text = text.replace(mdRe, (all, pre: string, m1?: string, d1?: string, d2?: string, m2?: string, year?: string) => {
      const month = MONTHS[(m1 ?? m2 ?? "").toLowerCase()]
      const day = Number.parseInt(d1 ?? d2 ?? "", 10)
      if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) return all
      const d = new Date(now)
      d.setFullYear(year ? Number.parseInt(year, 10) : now.getFullYear(), month, day)
      // No explicit year and the date already passed → assume next year.
      if (!year && d.getTime() < now.getTime() - 86_400_000) d.setFullYear(d.getFullYear() + 1)
      date = d
      return pre
    })
  }

  // A recurring event needs an anchor date — the named weekday or today.
  if (!date && rrule) {
    date =
      recurringAnchorWeekday !== null && recurringAnchorWeekday !== now.getDay()
        ? nextWeekday(now, recurringAnchorWeekday)
        : new Date(now)
  }

  // -------------------------------------------------------------------------
  // Location: "at <place>" (times were consumed above, so this is a place)
  // -------------------------------------------------------------------------
  let location: string | null = null
  text = text.replace(
    /(^|\s)(?:at|@)\s+([\p{L}\p{N}][^,]{0,120}?)(?=\s*$|\s*,)/u,
    (_all, pre: string, place: string) => {
      location = collapseWhitespace(place)
      return pre
    },
  )
  if (location) matched.push(`location: ${location}`)

  // -------------------------------------------------------------------------
  // Assemble start/end
  // -------------------------------------------------------------------------
  const hasExplicitTime = date !== null || startClock !== null || allDay

  const base = date !== null ? new Date(date as Date) : new Date(now)
  let start: Date
  let end: Date

  if (allDay) {
    start = new Date(base)
    start.setHours(0, 0, 0, 0)
    end = new Date(start.getTime() + 86_400_000)
  } else {
    const clock: any = startClock
    if (clock) {
      start = new Date(base)
      start.setHours(clock.hours, clock.minutes, 0, 0)
    } else if (date !== null) {
      // Date but no time → default 09:00.
      start = new Date(base)
      start.setHours(9, 0, 0, 0)
    } else {
      // Nothing given → next full hour.
      start = new Date(now)
      start.setMinutes(0, 0, 0)
      start.setHours(start.getHours() + 1)
    }

    // Explicit any assignment drops strict control flow narrowing, unblocking 'never' type errors
    const endParts: any = endClock
    if (endParts && typeof endParts.hours === 'number') {
      end = new Date(start)
      end.setHours(endParts.hours, endParts.minutes, 0, 0)
      // "11pm-1am" style overnight ranges roll to the next day.
      if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1)
    } else if (durationMinutes) {
      end = new Date(start.getTime() + durationMinutes * 60_000)
    } else {
      end = new Date(start.getTime() + 3_600_000) // default 1 hour
    }
  }

  if (allDay) matched.push("all day")
  if (hasExplicitTime && !allDay) matched.push(`starts: ${start.toISOString()}`)

  return {
    title: collapseWhitespace(text),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    allDay,
    location,
    rrule,
    reminderMinutes,
    matched,
    hasExplicitTime,
  }
}

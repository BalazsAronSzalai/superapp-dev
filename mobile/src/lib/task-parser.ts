/**
 * Natural-language quick-entry parser for the To-Do module (Things-style).
 *
 * Extracts structured fields from a single input line, e.g.:
 *   "Buy milk tomorrow #errand !high"
 *   "Water plants every 2 days"
 *   "Dentist next friday 3pm"
 *   "Learn piano someday"
 *
 * Supported tokens (case-insensitive):
 *   Dates:      today, tonight, tomorrow, next week, weekday names
 *               ("fri", "friday", "next friday"), "in N days/weeks",
 *               "jul 20" / "20 jul" style month-day dates
 *   Time:       9am, 5pm, 17:30, "at 9", combined with a date token
 *   Tags:       #word (multiple allowed)
 *   Priority:   !low / !med / !medium / !high  or  ! / !! / !!!
 *   Recurrence: daily/weekly/monthly/yearly, "every day/week/month/year",
 *               "every N days/weeks/months", "every monday", "every mon,wed"
 *   Someday:    "someday" parks the task in the Someday view
 *
 * Pure + dependency-free so it can be unit-tested in isolation.
 */

export interface ParsedQuickEntry {
  /** Input with all recognized tokens stripped out. */
  title: string
  /** ISO datetime or null. Defaults to 09:00 local unless a time was given. */
  scheduledDate: string | null
  tags: string[]
  /** 0 = none, 1 = low, 2 = medium, 3 = high. */
  priority: number
  /** RFC 5545 RRULE string or null. */
  rrule: string | null
  isSomeday: boolean
  /** Human-readable summary of what was recognized (for UI hints). */
  matched: string[]
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

function nextWeekday(from: Date, weekday: number, forceNextWeek: boolean): Date {
  const d = new Date(from)
  let delta = (weekday - d.getDay() + 7) % 7
  if (delta === 0) delta = 7 // "friday" on a Friday means next Friday
  if (forceNextWeek && delta < 7 && weekday <= d.getDay()) delta += 0 // already next week via modulo
  d.setDate(d.getDate() + delta)
  return d
}

function atTime(date: Date, time: TimeParts | null): Date {
  const d = new Date(date)
  if (time) d.setHours(time.hours, time.minutes, 0, 0)
  else d.setHours(9, 0, 0, 0)
  return d
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s{2,}/g, " ").trim()
}

/** Parse a quick-entry line. `now` is injectable for tests. */
export function parseQuickEntry(input: string, now: Date = new Date()): ParsedQuickEntry {
  let text = ` ${input} ` // pad so \s-delimited regexes match at the edges
  const matched: string[] = []

  // -------------------------------------------------------------------------
  // Tags: #word
  // -------------------------------------------------------------------------
  const tags: string[] = []
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]{1,60})(?=\s|$)/gu, (_all, pre: string, tag: string) => {
    tags.push(tag.toLowerCase())
    return pre
  })
  if (tags.length > 0) matched.push(`tags: ${tags.map((t) => `#${t}`).join(" ")}`)

  // -------------------------------------------------------------------------
  // Priority: !low/!med/!medium/!high or !!!/!!/!
  // -------------------------------------------------------------------------
  let priority = 0
  text = text.replace(/(^|\s)!(high|medium|med|low)(?=\s|$)/i, (_all, pre: string, level: string) => {
    priority = level.toLowerCase() === "high" ? 3 : level.toLowerCase() === "low" ? 1 : 2
    return pre
  })
  if (priority === 0) {
    text = text.replace(/(^|\s)(!{1,3})(?=\s|$)/, (_all, pre: string, bangs: string) => {
      priority = bangs.length
      return pre
    })
  }
  if (priority > 0) matched.push(`priority: ${["", "low", "medium", "high"][priority]}`)

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

  // "every monday" / "every mon,wed,fri"
  if (!rrule) {
    const everyDayRe = new RegExp(
      `(^|\\s)every\\s+((?:${WEEKDAY_ALT})(?:\\s*,\\s*(?:${WEEKDAY_ALT}))*)(?=\\s|$)`,
      "i",
    )
    text = text.replace(everyDayRe, (_all, pre: string, days: string) => {
      const codes = days
        .split(",")
        .map((d) => WEEKDAYS[d.trim().toLowerCase()])
        .filter((d): d is number => d !== undefined)
        .map((d) => WEEKDAY_RRULE_CODES[d])
      rrule = `FREQ=WEEKLY;BYDAY=${codes.join(",")}`
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
  // Someday
  // -------------------------------------------------------------------------
  let isSomeday = false
  text = text.replace(/(^|\s)someday(?=\s|$)/i, (_all, pre: string) => {
    isSomeday = true
    return pre
  })
  if (isSomeday) matched.push("someday")

  // -------------------------------------------------------------------------
  // Time of day (captured first so date tokens can use it)
  // -------------------------------------------------------------------------
  let time: TimeParts | null = null
  text = text.replace(
    /(^|\s)(?:at\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))(?=\s|$)/i,
    (all, pre: string, t: string) => {
      const parsed = parseTimeToken(t)
      if (!parsed) return all
      time = parsed
      return pre
    },
  )

  // -------------------------------------------------------------------------
  // Date
  // -------------------------------------------------------------------------
  let date: Date | null = null

  // today / tonight / tomorrow
  text = text.replace(/(^|\s)(today|tonight|tomorrow|tmrw|tmr)(?=\s|$)/i, (_all, pre: string, word: string) => {
    const w = word.toLowerCase()
    const d = new Date(now)
    if (w === "tomorrow" || w === "tmrw" || w === "tmr") d.setDate(d.getDate() + 1)
    if (w === "tonight" && !time) time = { hours: 20, minutes: 0 }
    date = d
    return pre
  })

  // in N days / weeks
  if (!date) {
    text = text.replace(/(^|\s)in\s+(\d{1,3})\s+(day|week)s?(?=\s|$)/i, (_all, pre: string, n: string, unit: string) => {
      const d = new Date(now)
      d.setDate(d.getDate() + Number.parseInt(n, 10) * (unit.toLowerCase() === "week" ? 7 : 1))
      date = d
      return pre
    })
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

  // (next|this)? weekday
  if (!date) {
    const weekdayRe = new RegExp(`(^|\\s)(next\\s+|this\\s+|on\\s+)?(${WEEKDAY_ALT})(?=\\s|$)`, "i")
    text = text.replace(weekdayRe, (_all, pre: string, qualifier: string | undefined, day: string) => {
      const weekday = WEEKDAYS[day.toLowerCase()]!
      date = nextWeekday(now, weekday, /next/i.test(qualifier ?? ""))
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

  // A recurring task needs an anchor date — default to today.
  if (!date && rrule) date = new Date(now)

  const scheduledDate = date ? atTime(date, time).toISOString() : null
  if (scheduledDate) matched.push(`scheduled: ${scheduledDate}`)

  return {
    title: collapseWhitespace(text),
    scheduledDate,
    tags,
    priority,
    rrule,
    isSomeday,
    matched,
  }
}

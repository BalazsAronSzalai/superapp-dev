/**
 * Recurrence service for the To-Do module (plan.md Phase 3).
 *
 * Supports the RRULE subset the app generates (RFC 5545 syntax):
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY
 *   INTERVAL=n            (default 1)
 *   BYDAY=MO,TU,...       (WEEKLY only)
 *   BYMONTHDAY=n          (MONTHLY only)
 *
 * Kept dependency-free on purpose — full RRULE libraries drag in timezone
 * machinery we don't need for "repeat every N days/weeks/months".
 */

export interface ParsedRrule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  interval: number
  /** 0 = Sunday … 6 = Saturday (JS getDay convention). */
  byDay: number[]
  byMonthDay: number | null
}

const DAY_CODES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

/** Parse an RRULE string. Returns null when unsupported or malformed. */
export function parseRrule(rrule: string): ParsedRrule | null {
  const cleaned = rrule.trim().replace(/^RRULE:/i, "")
  if (!cleaned) return null

  let freq: ParsedRrule["freq"] | null = null
  let interval = 1
  const byDay: number[] = []
  let byMonthDay: number | null = null

  for (const part of cleaned.split(";")) {
    const [rawKey, rawValue] = part.split("=")
    if (!rawKey || !rawValue) continue
    const key = rawKey.trim().toUpperCase()
    const value = rawValue.trim().toUpperCase()

    if (key === "FREQ") {
      if (value === "DAILY" || value === "WEEKLY" || value === "MONTHLY" || value === "YEARLY") {
        freq = value
      } else {
        return null
      }
    } else if (key === "INTERVAL") {
      const n = Number.parseInt(value, 10)
      if (!Number.isFinite(n) || n < 1 || n > 999) return null
      interval = n
    } else if (key === "BYDAY") {
      for (const code of value.split(",")) {
        const day = DAY_CODES[code.trim()]
        if (day === undefined) return null
        byDay.push(day)
      }
    } else if (key === "BYMONTHDAY") {
      const n = Number.parseInt(value, 10)
      if (!Number.isFinite(n) || n < 1 || n > 31) return null
      byMonthDay = n
    }
    // Unknown keys (UNTIL, COUNT, …) are ignored rather than rejected.
  }

  if (!freq) return null
  return { freq, interval, byDay: byDay.sort((a, b) => a - b), byMonthDay }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonthsClamped(date: Date, months: number, dayOfMonth: number): Date {
  const d = new Date(date)
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(dayOfMonth, daysInMonth))
  return d
}

/**
 * Compute the next occurrence strictly after `after`, anchored at `base`
 * (the task's current due/scheduled date — preserves the time of day).
 * Returns null for unparseable rules.
 */
export function nextOccurrence(rrule: string, base: Date, after: Date = new Date()): Date | null {
  const rule = parseRrule(rrule)
  if (!rule) return null

  const floor = new Date(Math.max(base.getTime(), after.getTime()))

  if (rule.freq === "DAILY") {
    let next = addDays(base, rule.interval)
    while (next.getTime() <= floor.getTime()) next = addDays(next, rule.interval)
    return next
  }

  if (rule.freq === "WEEKLY") {
    if (rule.byDay.length === 0) {
      let next = addDays(base, 7 * rule.interval)
      while (next.getTime() <= floor.getTime()) next = addDays(next, 7 * rule.interval)
      return next
    }
    // Walk forward day by day (bounded) until we land on an allowed weekday
    // in an "active" week (interval counted from the base week's start).
    const baseWeekStart = addDays(base, -base.getDay())
    baseWeekStart.setHours(0, 0, 0, 0)
    let candidate = addDays(base, 1)
    for (let i = 0; i < 7 * rule.interval * 54 + 7; i++) {
      const candWeekStart = addDays(candidate, -candidate.getDay())
      candWeekStart.setHours(0, 0, 0, 0)
      const weeksApart = Math.round(
        (candWeekStart.getTime() - baseWeekStart.getTime()) / (7 * 86_400_000),
      )
      if (
        weeksApart % rule.interval === 0 &&
        rule.byDay.includes(candidate.getDay()) &&
        candidate.getTime() > floor.getTime()
      ) {
        return candidate
      }
      candidate = addDays(candidate, 1)
    }
    return null
  }

  if (rule.freq === "MONTHLY") {
    const dayOfMonth = rule.byMonthDay ?? base.getDate()
    let months = rule.interval
    let next = addMonthsClamped(base, months, dayOfMonth)
    while (next.getTime() <= floor.getTime()) {
      months += rule.interval
      next = addMonthsClamped(base, months, dayOfMonth)
    }
    return next
  }

  // YEARLY
  let years = rule.interval
  const yearly = (n: number): Date => {
    const d = new Date(base)
    d.setFullYear(d.getFullYear() + n)
    return d
  }
  let next = yearly(years)
  while (next.getTime() <= floor.getTime()) {
    years += rule.interval
    next = yearly(years)
  }
  return next
}

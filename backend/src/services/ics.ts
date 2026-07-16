/**
 * iCalendar (.ics) import/export for the Calendar module (plan.md Phase 4).
 *
 * Dependency-free on purpose. Supports the VEVENT subset the app needs:
 *   UID, SUMMARY, DESCRIPTION, LOCATION, DTSTART, DTEND, RRULE
 * Export emits RFC 5545-compliant output; import tolerates folded lines,
 * DATE (all-day) vs DATE-TIME values, and TZID/VALUE parameters (times with
 * a TZID but no trailing Z are treated as UTC-naive local — good enough for
 * round-tripping our own exports and common Google/Apple exports).
 */

export interface IcsEvent {
  /** Stable identifier (maps to events.external_id on import). */
  uid: string
  title: string
  description: string | null
  location: string | null
  start: Date
  end: Date
  allDay: boolean
  rrule: string | null
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

/** UTC "basic" format: 20260716T090000Z */
function toIcsDateTime(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** Date-only format for all-day events: 20260716 */
function toIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

/** Escape per RFC 5545 §3.3.11 (TEXT). */
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

/** Fold lines longer than 75 octets (approximated as chars) per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  return parts.join("\r\n")
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//superapp//calendar//EN",
    "CALSCALE:GREGORIAN",
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
  ]

  const now = toIcsDateTime(new Date())
  for (const ev of events) {
    lines.push("BEGIN:VEVENT")
    lines.push(foldLine(`UID:${escapeText(ev.uid)}`))
    lines.push(`DTSTAMP:${now}`)
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.start)}`)
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(ev.end)}`)
    } else {
      lines.push(`DTSTART:${toIcsDateTime(ev.start)}`)
      lines.push(`DTEND:${toIcsDateTime(ev.end)}`)
    }
    lines.push(foldLine(`SUMMARY:${escapeText(ev.title)}`))
    if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeText(ev.description)}`))
    if (ev.location) lines.push(foldLine(`LOCATION:${escapeText(ev.location)}`))
    if (ev.rrule) lines.push(foldLine(`RRULE:${ev.rrule}`))
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return lines.join("\r\n") + "\r\n"
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Undo RFC 5545 TEXT escaping. */
function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}

/** Unfold continuation lines (CRLF followed by space/tab). */
function unfold(ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/)
}

interface IcsProp {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): IcsProp | null {
  const colon = line.indexOf(":")
  if (colon < 0) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const [rawName, ...paramParts] = left.split(";")
  if (!rawName) return null
  const params: Record<string, string> = {}
  for (const part of paramParts) {
    const eq = part.indexOf("=")
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }
  return { name: rawName.toUpperCase(), params, value }
}

/**
 * Parse an ICS date or date-time value.
 * Returns the Date plus whether it was a date-only (all-day) value.
 */
function parseIcsDate(value: string): { date: Date; dateOnly: boolean } | null {
  // DATE: 20260716
  let m = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    return {
      date: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
      dateOnly: true,
    }
  }
  // DATE-TIME: 20260716T090000(Z)?
  m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m
    const date = z
      ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
      : // Floating/TZID-local — treat as UTC to stay deterministic server-side.
        new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
    return { date, dateOnly: false }
  }
  return null
}

export function parseIcs(ics: string): IcsEvent[] {
  const lines = unfold(ics)
  const events: IcsEvent[] = []

  let inEvent = false
  let uid: string | null = null
  let title: string | null = null
  let description: string | null = null
  let location: string | null = null
  let start: { date: Date; dateOnly: boolean } | null = null
  let end: { date: Date; dateOnly: boolean } | null = null
  let rrule: string | null = null

  const reset = () => {
    uid = title = description = location = rrule = null
    start = end = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (/^BEGIN:VEVENT$/i.test(line)) {
      inEvent = true
      reset()
      continue
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (inEvent && title !== null && start) {
        const allDay = start.dateOnly
        // DTEND is exclusive for all-day events; default to start when absent.
        const endDate = end?.date ?? new Date(start.date.getTime() + (allDay ? 86_400_000 : 3_600_000))
        events.push({
          uid: uid ?? `${start.date.getTime()}-${title}`,
          title,
          description,
          location,
          start: start.date,
          end: endDate,
          allDay,
          rrule,
        })
      }
      inEvent = false
      reset()
      continue
    }
    if (!inEvent) continue

    const prop = parseLine(line)
    if (!prop) continue

    switch (prop.name) {
      case "UID":
        uid = unescapeText(prop.value)
        break
      case "SUMMARY":
        title = unescapeText(prop.value)
        break
      case "DESCRIPTION":
        description = unescapeText(prop.value)
        break
      case "LOCATION":
        location = unescapeText(prop.value)
        break
      case "DTSTART":
        start = parseIcsDate(prop.value)
        break
      case "DTEND":
        end = parseIcsDate(prop.value)
        break
      case "RRULE":
        rrule = prop.value
        break
      default:
        break
    }
  }

  return events
}

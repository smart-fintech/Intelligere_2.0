/**
 * ONE place for dates. The whole project shows dates as DD-MM-YYYY.
 *
 * The backend does not send one single format - so far we have seen:
 *
 *   "2026-09-04"                 the usual API date
 *   "04-Sep-2026"                the free trial date at login
 *   "2026-09-04T10:30:00Z"       a full timestamp
 *   null                         nothing set yet (payment_at)
 *
 * ...so rather than guessing at each screen, everything goes through
 * formatDate() and comes out the same way:
 *
 *   import { formatDate } from '@/Utils/date'
 *
 *   formatDate('2026-09-04')            ->  '04-09-2026'
 *   formatDate('04-Sep-2026')           ->  '04-09-2026'
 *   formatDate('2026-09-04T10:30:00Z')  ->  '04-09-2026'
 *   formatDate(null)                    ->  '--'
 *
 * A value it cannot read comes back unchanged rather than as "Invalid Date",
 * so a screen never shows something worse than what the backend sent.
 */

/** Month names as the backend writes them, in the order they fall. */
const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/** Turns 4 into "04" - every part of the output is two digits. */
const pad = (number) => String(number).padStart(2, '0')

/* ------------------------------------------------------------------ */
/* Reading whatever came in                                           */
/* ------------------------------------------------------------------ */

/**
 * Works out the day, month and year from any of the shapes above.
 * Returns null when the value cannot be read as a date.
 *
 * The patterns are tried in order, most specific first, and only fall
 * through to the browser's own parser at the end.
 */
const readParts = (value) => {
  // Already a Date object.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() }
  }

  // A unix timestamp in milliseconds.
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? null
      : { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() }
  }

  if (typeof value !== 'string') return null

  const text = value.trim()
  if (!text) return null

  // ---- 2026-09-04, or 2026-09-04T10:30:00Z ----
  // Read by hand rather than with new Date(): the browser treats a bare
  // "2026-09-04" as UTC midnight, which in India (UTC+5:30) is still the
  // 4th, but in a negative timezone shows as the 3rd. Taking the numbers
  // straight out of the text keeps the day the backend meant.
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) {
    return { day: Number(ymd[3]), month: Number(ymd[2]), year: Number(ymd[1]) }
  }

  // ---- 04-Sep-2026, 4 September 2026, 04/Sep/2026 ----
  const named = text.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})/)
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1
    if (month > 0) {
      return { day: Number(named[1]), month, year: Number(named[3]) }
    }
  }

  // ---- 04-09-2026 or 04/09/2026 ----
  // Day first, which is how this project and its backend write dates.
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmy) {
    return { day: Number(dmy[1]), month: Number(dmy[2]), year: Number(dmy[3]) }
  }

  // ---- Anything else: let the browser try ----
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null

  return {
    day: parsed.getDate(),
    month: parsed.getMonth() + 1,
    year: parsed.getFullYear(),
  }
}

/* ------------------------------------------------------------------ */
/* The functions screens use                                          */
/* ------------------------------------------------------------------ */

/**
 * The project's display format: DD-MM-YYYY.
 *
 * `fallback` is what to show when there is no date - a dash by default, so
 * an empty cell in a table still lines up with the ones around it.
 */
export const formatDate = (value, fallback = '--') => {
  const parts = readParts(value)

  // Nothing at all - show the fallback.
  if (value === null || value === undefined || value === '') return fallback

  // Something we could not read - show it as it came rather than hiding it.
  if (!parts) return String(value)

  return `${pad(parts.day)}-${pad(parts.month)}-${parts.year}`
}

/**
 * The same date as YYYY-MM-DD, which is the only format an
 * <input type="date"> understands. Use it when a date has to be EDITED;
 * use formatDate when it is only being read.
 */
export const toInputDate = (value) => {
  const parts = readParts(value)
  if (!parts) return ''

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

/** True when the value is a date this file can read. */
export const isValidDate = (value) => readParts(value) !== null

/** Today, in the display format. */
export const today = () => formatDate(new Date())

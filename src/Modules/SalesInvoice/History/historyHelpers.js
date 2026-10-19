/**
 * THE DOCUMENT HISTORY - its options and how a saved document is read, with
 * no screen attached.
 *
 *   financialYearOptions(today)    the current Indian financial year and the
 *                                  five before it, "2026-2027" ...
 *   tallyYearOptions(today)        last, this and next calendar year
 *   MONTH_OPTIONS                  January..December, valued 1..12
 *   checkTallyRange(range)         what is wrong with a From / To range
 *   readHistoryRow(row)            a saved document as the table shows it
 *   historyTotal(rows)             their totals added up, in paise
 */

import { toPaise } from '@/Modules/Payment/pricing'

/* ------------------------------------------------------------------ */
/* Financial years - April to March                                   */
/* ------------------------------------------------------------------ */

/** The financial year a date falls in, as "2026-2027": from April it is the year that starts then. */
export const financialYearOf = (date = new Date()) => {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${start}-${start + 1}`
}

/** The current financial year first, then the five before it - worked out from `today`, never written down. */
export const financialYearOptions = (today = new Date()) => {
  const start = Number(financialYearOf(today).slice(0, 4))
  return Array.from({ length: 6 }, (_, back) => {
    const value = `${start - back}-${start - back + 1}`
    return { value, label: value }
  })
}

/* ------------------------------------------------------------------ */
/* The Tally fetch range                                              */
/* ------------------------------------------------------------------ */

/** Last year, this year and next year, as plain year labels ("2025", "2026", "2027"). */
export const tallyYearOptions = (today = new Date()) => {
  const year = today.getFullYear()
  return [year - 1, year, year + 1].map((value) => ({ value: String(value), label: String(value) }))
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** The months by name, each valued by its number (1 = January) - the form the fetch sends. */
export const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label }))

/**
 * Where a new fetch range starts: April of the current financial year to
 * this month - the year so far. Every value is one the dropdowns offer.
 */
export const defaultTallyRange = (today = new Date()) => {
  const fyStart = Number(financialYearOf(today).slice(0, 4))
  return {
    startYear: String(fyStart),
    startMonth: '4',
    endYear: String(today.getFullYear()),
    endMonth: String(today.getMonth() + 1),
  }
}

/**
 * What is wrong with a fetch range - {} when it is fine:
 *
 *   every year and month chosen
 *   the To month not before the From month (compared as year x 12 + month,
 *   so a range across years is fine and the same year compares the months)
 *   at least one voucher type
 */
export const checkTallyRange = ({ startYear, startMonth, endYear, endMonth, voucherTypes = [] }) => {
  const found = {}
  if (!startYear) found.startYear = 'Select the year'
  if (!startMonth) found.startMonth = 'Select the month'
  if (!endYear) found.endYear = 'Select the year'
  if (!endMonth) found.endMonth = 'Select the month'
  if (Object.keys(found).length === 0) {
    const from = Number(startYear) * 12 + Number(startMonth)
    const to = Number(endYear) * 12 + Number(endMonth)
    if (to < from) found.endMonth = 'The To month cannot be before the From month'
  }
  if (voucherTypes.length === 0) found.voucherTypes = 'Select at least one voucher type'
  return found
}

/* ------------------------------------------------------------------ */
/* A saved document, as the table shows it                            */
/* ------------------------------------------------------------------ */

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** An object the API may send as JSON text - read either way. */
const objectOf = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * The few fields the table shows, from the many the history sends:
 *
 *   id          document_id (what a delete names)
 *   buyerName   buyer_name
 *   buyerGstin  buyer_details.ledeger_gstin
 *   documentNo  document_no, else invoice_master_details.document_no
 *   documentDate  document_date, else invoice_master_details.document_date
 *   totalPaise  total_amount, in paise (null when it is not a number)
 */
export const readHistoryRow = (row) => {
  const master = objectOf(row.invoice_master_details)
  const buyer = objectOf(row.buyer_details)
  return {
    id: row.document_id ?? row.id ?? null,
    buyerName: text(row.buyer_name ?? buyer.ledeger_name),
    buyerGstin: text(buyer.ledeger_gstin ?? row.buyer_gstin),
    documentNo: text(row.document_no ?? master.document_no),
    documentDate: text(row.document_date ?? master.document_date),
    totalPaise: toPaise(row.total_amount),
  }
}

/** The documents' totals added up, in paise - each document once, by its id. */
export const historyTotal = (rows) => {
  const seen = new Set()
  return rows.reduce((sum, row) => {
    const key = row.id ?? `${row.documentNo}|${row.documentDate}`
    if (seen.has(key)) return sum
    seen.add(key)
    return sum + (row.totalPaise ?? 0)
  }, 0)
}

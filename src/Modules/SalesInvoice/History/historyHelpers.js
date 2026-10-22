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
 *   uniqueHistoryRows(rows)        each document once, by its document_id
 *   historyPartyOptions(rows)      the buyers (or sellers) the rows name, once each
 *   filterHistoryRows(rows, filters)   the rows every set filter lets through
 *   amountRangeError(filters)      what is wrong with a From / To amount
 *   historyTotal(rows)             their totals added up, in paise
 */

import { toPaise } from '@/Modules/Payment/pricing'
import { fileUrlOf } from '@/Services/salesInvoiceService'

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

/** "15/10/2026" (the history's document_date) or an ISO date, as YYYY-MM-DD - '' for none. */
export const isoDateOf = (value) => {
  const raw = text(value)
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : ''
}

/**
 * The few fields the table shows, from the many the history sends:
 *
 *   id          document_id (what a delete names, and each row's key)
 *   partyId     buyer_id - the ledger the document names: the buyer on a
 *               sale, the supplier on a purchase (what the Buyer / Seller
 *               filter matches on)
 *   buyerName   buyer_name
 *   buyerGstin  buyer_details.ledeger_gstin
 *   documentNo  document_no, else invoice_master_details.document_no
 *   documentDate  document_date, else invoice_master_details.document_date
 *   documentDay   the same as YYYY-MM-DD - what the date filter compares
 *   totalPaise  total_amount, in paise (null when it is not a number)
 *   fromTally   past_tally_invoice is true - a document fetched from Tally;
 *               anything else was made in Intelligere (the rule the earlier
 *               history screens filtered by). Such a document is not edited.
 *   pdfUrl      doc_pdf - the document's saved PDF - as a URL the browser
 *               opens; null when it has none
 *   source      the row as the server sent it - what Edit fills the form from
 */
export const readHistoryRow = (row) => {
  const master = objectOf(row.invoice_master_details)
  const buyer = objectOf(row.buyer_details)
  const documentDate = text(row.document_date ?? master.document_date)
  return {
    id: row.document_id ?? row.id ?? null,
    partyId: text(row.buyer_id ?? buyer.ledger_obj_id),
    buyerName: text(row.buyer_name ?? buyer.ledeger_name),
    buyerGstin: text(buyer.ledeger_gstin ?? row.buyer_gstin),
    documentNo: text(row.document_no ?? master.document_no),
    documentDate,
    documentDay: isoDateOf(documentDate),
    totalPaise: toPaise(row.total_amount),
    fromTally: row.past_tally_invoice === true || text(row.past_tally_invoice).toLowerCase() === 'true',
    pdfUrl: fileUrlOf(row.doc_pdf ?? row.doc_PDF),
    source: row,
  }
}

/** Each document once - by its document_id; a row without one is kept as it is. */
export const uniqueHistoryRows = (rows) => {
  const seen = new Set()
  return rows.filter((row) => {
    if (row.id === null || row.id === undefined) return true
    const key = String(row.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

/** The Source filter's choices - Tally or Intelligere by past_tally_invoice (readHistoryRow). */
export const HISTORY_SOURCE = Object.freeze({ TALLY: 'tally', INTELLIGERE: 'intelligere' })

/** No filter set. */
export const EMPTY_HISTORY_FILTERS = Object.freeze({ from: '', to: '', party: '', source: '', minAmount: '', maxAmount: '' })

/** The buyers (or sellers) the rows name - by their ledger id, once each, A-Z; a party without an id by its name. */
export const historyPartyOptions = (rows) => {
  const byValue = new Map()
  rows.forEach((row) => {
    const value = row.partyId || (row.buyerName ? `name:${row.buyerName}` : '')
    if (value && !byValue.has(value)) byValue.set(value, row.buyerName || `Ledger ${row.partyId}`)
  })
  return [...byValue.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

/** A typed amount in paise - null for nothing typed (never 0). */
const amountOf = (value) => (text(value) === '' ? null : toPaise(value))

/** What is wrong with the amount range - '' when it is fine. */
export const amountRangeError = ({ minAmount, maxAmount }) => {
  const min = amountOf(minAmount)
  const max = amountOf(maxAmount)
  return min !== null && max !== null && min > max ? 'From Amount is more than To Amount' : ''
}

/**
 * The rows every set filter lets through - an empty one lets everything:
 *
 *   from, to          document_date on or after / on or before (YYYY-MM-DD)
 *   party             the buyer / seller (historyPartyOptions' value)
 *   source            HISTORY_SOURCE.TALLY or .INTELLIGERE
 *   minAmount, maxAmount   total_amount at or above / at or below - not
 *                     applied while the range is the wrong way round
 */
export const filterHistoryRows = (rows, filters) => {
  const { from, to, party, source } = filters
  const rangeOk = !amountRangeError(filters)
  const min = rangeOk ? amountOf(filters.minAmount) : null
  const max = rangeOk ? amountOf(filters.maxAmount) : null
  return rows.filter((row) => {
    if ((from || to) && !row.documentDay) return false
    if (from && row.documentDay < from) return false
    if (to && row.documentDay > to) return false
    if (party && party !== (row.partyId || `name:${row.buyerName}`)) return false
    if (source === HISTORY_SOURCE.TALLY && !row.fromTally) return false
    if (source === HISTORY_SOURCE.INTELLIGERE && row.fromTally) return false
    if ((min !== null || max !== null) && row.totalPaise === null) return false
    if (min !== null && row.totalPaise < min) return false
    if (max !== null && row.totalPaise > max) return false
    return true
  })
}

/** Whether any filter is set. */
export const hasHistoryFilters = (filters) => Object.values(filters).some((value) => text(value) !== '')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A YYYY-MM-DD as the export takes it - "08-Jun-2025"; '' for none. */
export const exportDateOf = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value))
  return match ? `${match[3]}-${MONTHS[Number(match[2]) - 1]}-${match[1]}` : ''
}

/**
 * THE EXCEL EXPORT'S BODY (invoice/export-documents-excel/) - exactly the
 * filters the table is showing, nothing else:
 *
 *   date           the financial year chosen ("2025-2026") - always
 *   document_type  the document type chosen - always
 *   from_date, to_date     Document Date from / to, as "08-Jun-2025"
 *   ledger         the Buyer (or Seller) filter, by the ledger's name
 *   from_value, to_value   From / To Amount (total_amount) - not when the
 *                  range is the wrong way round, as the table does not apply it
 *   source         "Tally" | "Intelligere"
 *
 * A filter that is not set is left out - never sent empty, "null" or
 * "undefined".
 *   partyName   the name of the party the Buyer / Seller filter chose
 */
export const buildDocumentExportBody = ({ financialYear, documentType, filters, partyName }) => {
  const body = { date: text(financialYear), document_type: text(documentType) }
  const fromDate = exportDateOf(filters.from)
  const toDate = exportDateOf(filters.to)
  if (fromDate) body.from_date = fromDate
  if (toDate) body.to_date = toDate
  if (filters.party && text(partyName)) body.ledger = text(partyName)
  if (!amountRangeError(filters)) {
    if (amountOf(filters.minAmount) !== null) body.from_value = text(filters.minAmount)
    if (amountOf(filters.maxAmount) !== null) body.to_value = text(filters.maxAmount)
  }
  if (filters.source === HISTORY_SOURCE.TALLY) body.source = 'Tally'
  else if (filters.source === HISTORY_SOURCE.INTELLIGERE) body.source = 'Intelligere'
  return body
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

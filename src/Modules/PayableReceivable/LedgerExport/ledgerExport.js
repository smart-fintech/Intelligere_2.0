/**
 * Ledger Export's plain logic - no React, no requests.
 *
 *   groupLedgers      the company's ledgers, by group, for the report filters
 *   readLedgerReport / readErpLedgers   the replies
 *   toLedgerDate      a date as the ledger APIs want it, DD-MMM-YYYY
 *   balanceText / netText   an amount with its Dr or Cr
 *   financialYearOptions / currentFinancialYear   the April-March years
 *   checkSyncRange / checkReportFilters / checkBankEntry   what is wrong with a form - {} when fine
 *   filterErpRows / isFixedRow / rowDetails / erpLedgersCsv   the ERP list
 */

import { formatAmount } from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { compareToToday, toInputDate } from '@/Utils/date'

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const readMessage = (reply) => (isRecord(reply) && typeof reply.msg === 'string' ? reply.msg : null)
const toNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}
const byName = (a, b) => a.localeCompare(b)

/* ------------------------------------------------------------------ */
/* Dates and amounts                                                  */
/* ------------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-04-01" -> "01-Apr-2026". */
export const toLedgerDate = (value) => {
  const [year, month, day] = String(toInputDate(value) || '').split('-')
  return year ? `${day}-${MONTHS[Number(month) - 1]}-${year}` : ''
}

/** A running balance as sent (below 0 is Dr, above is Cr). Blank stays blank; 0 has no side. */
export const balanceText = (balance) => {
  if (balance === '' || balance === null || balance === undefined) return ''
  const number = toNumber(balance)
  if (number === 0) return formatAmount(0)
  return `${formatAmount(Math.abs(number))} ${number < 0 ? 'Dr' : 'Cr'}`
}

/** What debits and credits come to, with the side that is larger. */
export const netText = (debit, credit) => {
  const amount = Math.abs(credit - debit)
  if (amount === 0) return formatAmount(0)
  return `${formatAmount(amount)} ${debit > credit ? 'Dr' : 'Cr'}`
}

/* ------------------------------------------------------------------ */
/* Tally: the groups and the reports                                  */
/* ------------------------------------------------------------------ */

const NO_GROUP = 'Other Ledgers'

/** The ledger store's rows -> [{ name, ledgers: [names] }], both sorted. A row with no name is left out. */
export const groupLedgers = (rows) => {
  const groups = new Map()
  rows.forEach(({ ledeger_name: name, ledeger_group_name: group }) => {
    if (!name) return
    const key = group || NO_GROUP
    groups.set(key, [...(groups.get(key) ?? []), name])
  })
  return [...groups.entries()]
    .map(([name, ledgers]) => ({ name, ledgers: [...new Set(ledgers)].sort(byName) }))
    .sort((a, b) => byName(a.name, b.name))
}

const readReportRow = (row, index) => ({
  key: String(index),
  date: row.Date ?? '',
  invoiceNo: row['Invoice No.'] ?? '',
  particulars: row.Particulars ?? '',
  type: row.type ?? '',
  amount: toNumber(row.amount),
  // The opening row's amount may be '' - nothing to show, not a 0.
  hasAmount: row.amount !== '' && row.amount !== null && row.amount !== undefined,
  balance: row.balance,
})

const sumOf = (rows, type) => rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.amount, 0)

/**
 * { "<group>": { "<ledger>": { "1": row } } } -> [{ name, debit, credit, ledgers:
 * [{ name, rows, debit, credit }] }], leaving out a ledger with no rows and a
 * group with no ledgers. The rows may come as an object or a list.
 */
export const readLedgerReport = (reply) => {
  if (!isRecord(reply)) return []

  return Object.entries(reply)
    .filter(([, ledgers]) => isRecord(ledgers))
    .map(([name, ledgers]) => {
      const read = Object.entries(ledgers)
        .filter(([, rows]) => isRecord(rows) || Array.isArray(rows))
        .map(([ledger, rows]) => {
          const list = Object.values(rows).filter(isRecord).map(readReportRow)
          return { name: ledger, rows: list, debit: sumOf(list, 'debit'), credit: sumOf(list, 'credit') }
        })
        .filter((ledger) => ledger.rows.length > 0)
      return {
        name,
        ledgers: read,
        debit: read.reduce((sum, ledger) => sum + ledger.debit, 0),
        credit: read.reduce((sum, ledger) => sum + ledger.credit, 0),
      }
    })
    .filter((group) => group.ledgers.length > 0)
}

/** `ledgers` is one name for the General Ledger, a list for Party-Wise; neither may be empty. */
export const checkReportFilters = ({ group, ledgers, from, to }) => {
  const found = {}
  if (!group) found.group = 'Select the group'
  if (ledgers.length === 0) found.ledgers = 'Select the ledger'
  if (!from) found.from = 'Select the from date'
  if (!to) found.to = 'Select the to date'
  if (from && to && from > to) found.to = 'The to date cannot be before the from date'
  return found
}

/* ------------------------------------------------------------------ */
/* Tally: the period to sync                                          */
/* ------------------------------------------------------------------ */

export const MONTH_OPTIONS = MONTHS.map((label, index) => ({ value: String(index + 1), label }))

export const syncYearOptions = (now = new Date()) =>
  [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((year) => ({ value: String(year), label: String(year) }))

export const checkSyncRange = ({ startMonth, startYear, endMonth, endYear }) => {
  const found = {}
  if (!startMonth) found.startMonth = 'Select the from month'
  if (!startYear) found.startYear = 'Select the from year'
  if (!endMonth) found.endMonth = 'Select the to month'
  if (!endYear) found.endYear = 'Select the to year'
  if (Object.keys(found).length === 0 && Number(startYear) * 12 + Number(startMonth) > Number(endYear) * 12 + Number(endMonth)) {
    found.endMonth = 'The to month cannot be before the from month'
  }
  return found
}

/* ------------------------------------------------------------------ */
/* Other ERPs: the financial year                                     */
/* ------------------------------------------------------------------ */

const firstYearOf = (now) => (now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear())
const yearLabel = (year) => `${year}-${year + 1}`

export const currentFinancialYear = (now = new Date()) => yearLabel(firstYearOf(now))

/** Last year, this year and next. */
export const financialYearOptions = (now = new Date()) => {
  const year = firstYearOf(now)
  return [year - 1, year, year + 1].map((first) => ({ value: yearLabel(first), label: yearLabel(first) }))
}

/* ------------------------------------------------------------------ */
/* Other ERPs: the list                                               */
/* ------------------------------------------------------------------ */

/**
 * { "<ledger>": [row] } -> [{ name, rows }]. The rows are kept exactly as they
 * came: an edit sends its row back whole.
 */
export const readErpLedgers = (reply) => {
  const ledgers = isRecord(reply)
    ? Object.entries(reply)
        .filter(([, rows]) => Array.isArray(rows))
        .map(([name, rows]) => ({ name, rows: rows.filter(isRecord) }))
    : []
  return { ledgers, message: readMessage(reply) }
}

/** Only the rows the filters leave. A row with no readable date has no place in a date-ordered list. */
export const filterErpRows = (rows, { search, from, to }) => {
  const term = search.trim().toLowerCase()
  return rows.filter((row) => {
    const date = toInputDate(row.date)
    if (!date) return false
    if (from && date < from) return false
    if (to && date > to) return false
    return !term || `${row.particular ?? ''} ${row.narration ?? ''}`.toLowerCase().includes(term)
  })
}

const FIXED_VOUCHER_TYPES = ['Sales', 'Purchase', 'Credit Note', 'Debit Note']
const BALANCE_ROWS = ['OPENING BALANCE', 'CLOSING BALANCE']

/**
 * A row that cannot be edited or deleted here. Invoices and notes belong to
 * their own screens, and the opening and closing rows are worked out by the
 * backend, not stored.
 */
export const isFixedRow = (row) => FIXED_VOUCHER_TYPES.includes(row.vouchertype) || BALANCE_ROWS.includes(row.particular)

/** What a row opens out into - null when it has nothing more to show. */
export const rowDetails = (row) => {
  const debits = row.jv_details?.dr ?? []
  const credits = row.jv_details?.cr ?? []
  const products = row.invoice_details?.product_details ?? []
  const charges = row.invoice_details?.charges ?? []
  return debits.length || credits.length || products.length || charges.length ? { debits, credits, products, charges } : null
}

const asAmount = (value) => toNumber(value).toFixed(2)

/** A cell a spreadsheet will not read as a formula, with what would break the row quoted. */
const csvCell = (value) => {
  const text = String(value ?? '')
  const safe = /^[=+\-@]/.test(text) && !Number.isFinite(Number(text)) ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const CSV_HEAD = ['Date', 'Voucher No', 'Voucher Type', 'Narration', 'Particular', 'Debit', 'Credit', 'Running Balance']

/** The ledgers as the old Excel sheet laid them out: the company, then each ledger under its name. */
export const erpLedgersCsv = (ledgers, companyName, companyAddress) => {
  const lines = [[companyName], [companyAddress ?? ''], []]
  ledgers.forEach(({ name, rows }) => {
    lines.push([name], CSV_HEAD)
    rows.forEach((row) => {
      lines.push([
        row.date,
        row.voucher_no,
        row.vouchertype,
        row.narration,
        row.particular,
        asAmount(row.debit),
        asAmount(row.credit),
        asAmount(row.balance),
      ])
    })
    lines.push([])
  })
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n')
}

/** The backend refuses a blank narration, so it is asked for here. */
export const checkBankEntry = ({ date, amount, narration, particular, vouchertype }) => {
  const found = {}
  if (!date) found.date = 'Select the date'
  else if (compareToToday(date) === 1) found.date = 'The date cannot be in the future'
  if (!(Number(amount) > 0)) found.amount = 'The amount must be greater than 0'
  if (!particular) found.particular = 'Select the bank'
  if (!vouchertype) found.vouchertype = 'Select the voucher type'
  if (!narration.trim()) found.narration = 'Enter the narration'
  return found
}

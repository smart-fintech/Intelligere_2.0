/**
 * GST COMPARE - reading a comparison, with no React and no requests.
 *
 *   { leftdata:  { M, S, U },     the books (purchase ledger)
 *     rightdata: { M, S, U } }    the GST portal
 *
 *   M  exact matches       S  similar matches       U  unmatched
 *
 * Each section is { "<row key>": row }. A row has "GST No.", "Invoice No.",
 * "Invoice Date", the amounts, v_type and Status ({ field: "True" | "False" }).
 * Key prefixes: R = reverse charge, u = unmatched, and on the portal side
 * B = blocked, NC = not to be considered. U's `unmatch` is not a row: on the
 * left it holds the comparison's id.
 */

export const MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'].map(
  (label, index) => ({ value: String(index + 1), label }),
)

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * "April 2026" and "September 2026" - the period a comparison was run for. An
 * end month before the start month runs into the next year, as the Tally fetch reads it.
 */
export const periodMonths = ({ startMonth, endMonth, year }) => {
  const start = Number(startMonth)
  const end = Number(endMonth)
  if (!MONTH_NAMES[start - 1] || !MONTH_NAMES[end - 1] || !year) return null
  const endYear = end < start ? Number(year) + 1 : Number(year)
  return { from: `${MONTH_NAMES[start - 1]} ${year}`, to: `${MONTH_NAMES[end - 1]} ${endYear}` }
}

export const GST_RATE_OPTIONS = [5, 12, 18, 28].map((rate) => ({ value: String(rate), label: `${rate}%` }))

export const GST_TYPE_OPTIONS = [
  { value: 'CGST', label: 'CGST/SGST' },
  { value: 'IGST', label: 'IGST' },
]

/** The voucher groups a purchase register can be fetched from. */
const PURCHASE_VOUCHER_GROUPS = ['purchase', 'journal', 'credit', 'debit']

export const purchaseVoucherTypes = (types) =>
  types
    .filter((type) => PURCHASE_VOUCHER_GROUPS.some((group) => type.group.toLowerCase().includes(group)))
    .map((type) => type.name)

/** "2026-27" and "2025-26", as View Past Data offers them. */
export const financialYearOptions = (today = new Date()) => {
  const year = today.getFullYear()
  return [year, year - 1].map((start) => {
    const label = `${start}-${String(start + 1).slice(-2)}`
    return { value: label, label, startYear: start, endYear: start + 1 }
  })
}

const yearOption = (year) => ({ value: String(year), label: String(year) })

/** The years an upload may be for. */
export const uploadYearOptions = (today = new Date()) => {
  const year = today.getFullYear()
  return [year, year - 1].map(yearOption)
}

/** The years a Tally fetch may be for: next year, this year, and the five before. */
export const fetchYearOptions = (today = new Date()) => {
  const year = today.getFullYear()
  return [year + 1, year, year - 1, year - 2, year - 3, year - 4, year - 5].map(yearOption)
}

/** A row of the comparison, wherever it is: { key, section, item }, in screen order. */
export const rowsOf = (side) =>
  ['M', 'S', 'U'].flatMap((section) =>
    Object.entries(side?.[section] ?? {})
      .filter(([key]) => key !== 'unmatch')
      .map(([key, item]) => ({ key, section, item })),
  )

/** Rows of one or several sections only. */
export const rowsIn = (rows, ...sections) => rows.filter((row) => sections.includes(row.section))

/** Whether a reply is a comparison at all. */
export const isComparison = (reply) => Boolean(reply?.leftdata && reply?.rightdata)

/** The id every later request names the comparison by. */
export const compareIdOf = (comparison) => comparison?.leftdata?.U?.unmatch ?? null

/**
 * How a field of a row is coloured:
 *   rcm  a valid reverse-charge row
 *   bad  this field did not match
 *   ok   everything else
 */
export const toneOf = (item, key, field) => {
  const status = item?.Status ?? {}
  if (status['GST No.'] !== 'False' && key.startsWith('R')) return 'rcm'
  return status[field] === 'False' ? 'bad' : 'ok'
}

const hasNoTax = (item) => Number(item.CGST) === 0 && Number(item.IGST) === 0 && Number(item.SGST) === 0

/** A ledger row can be ticked when its GST No. did not match and it is not reverse charge already. */
export const canTickLedgerRow = ({ key, item }) => item?.Status?.['GST No.'] === 'False' && !key.startsWith('R')

/** The rate and GST type are asked for only where the row carries no tax of its own. */
export const needsTaxChoice = (row) => canTickLedgerRow(row) && hasNoTax(row.item)

/** A portal row can be ticked unless it is reverse charge, blocked or not to be considered. */
export const canTickPortalRow = (key) => !key.startsWith('R') && !key.startsWith('B') && !key.startsWith('NC')

/** How many columns a table draws: No., GST No., Type, date, number and four amounts, plus its own. */
export const columnCount = ({ lead = 0, trail = 0, showName, showInvoiceValue }) =>
  lead + trail + 9 + (showName ? 1 : 0) + (showInvoiceValue ? 1 : 0)

/** An amount to two places; blank for anything that is not a number. */
export const formatAmount = (value) => {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number.toFixed(2) : ''
}

/** dd/mm/yyyy -> yyyy-mm-dd, what a date box holds. Blank when it cannot be read. */
export const toDateInput = (text) => {
  const [day, month, year] = String(text ?? '').split('/')
  return year && month && day ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : ''
}

/** yyyy-mm-dd -> dd/mm/yyyy, what the backend stores. */
export const fromDateInput = (value) => {
  const [year, month, day] = String(value ?? '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : ''
}

/* ------------------------------------------------------------------ */
/* Writing back to Tally                                               */
/* ------------------------------------------------------------------ */

/** A row and a fetched voucher are the same one by voucher number and (lower case) type. */
const voucherKey = (number, type) => `${String(number ?? '').trim()}|${String(type ?? '').trim().toLowerCase()}`

/**
 * What Tally holds for each fetched voucher, by voucherKey. A comparison's
 * rows do not carry the GUID that the voucher update needs, so it is kept from
 * the fetch. Two vouchers sharing a key are dropped: a row that cannot be tied
 * to exactly one voucher must never overwrite either of them.
 */
export const buildVoucherIndex = (tallyData) => {
  const index = new Map()
  const repeated = new Set()
  ;(Array.isArray(tallyData) ? tallyData : []).forEach((group) => {
    Object.values(group ?? {}).forEach((voucher) => {
      const key = voucherKey(voucher.vouchernumber, voucher.voucher_type)
      if (index.has(key)) repeated.add(key)
      index.set(key, {
        guid: voucher.guid,
        voucherType: voucher.voucher_type,
        invoiceNumber: String(voucher.invoice_number ?? '').trim(),
        date: voucher.date,
        narration: String(voucher.narration ?? '').trim(),
      })
    })
  })
  repeated.forEach((key) => index.delete(key))
  return index
}

/**
 * The narration a matched voucher is stamped with - named after the first month
 * of the period - or '' with no month chosen.
 */
export const matchedNarration = (startMonth) => {
  const name = MONTH_NAMES[Number(startMonth) - 1]
  return name ? `Entry matched in ${name}` : ''
}

/**
 * The rows GST_Compare_Voucher_Update should write:
 *
 *   a matched or similar row (M, S)   gets the narration, once
 *   a row whose invoice no. or date   gets the corrected values
 *     was corrected
 *
 * Anything else - an untouched unmatched row, a voucher already written, a row
 * with no fetched voucher behind it (carried over from an earlier period) -
 * is left out, so pressing Update Entries again changes nothing in Tally.
 */
export const buildVoucherUpdates = (comparison, index, narration) =>
  rowsOf(comparison?.leftdata).flatMap(({ section, item }) => {
    const voucher = index.get(voucherKey(item['Voucher Number'], item.v_type))
    if (!voucher?.guid) return []

    const number = String(item['Invoice No.'] ?? '').trim()
    const date = String(item['Invoice Date'] ?? '').trim()
    const corrected = Boolean(number && date) && (number !== voucher.invoiceNumber || date !== voucher.date)
    const stamp = section !== 'U' && narration && !voucher.narration.includes(narration) ? narration : ''
    if (!corrected && !stamp) return []

    return [
      {
        guid: voucher.guid,
        voucher_type: voucher.voucherType,
        invoice_number: corrected ? number : voucher.invoiceNumber,
        date: corrected ? date : voucher.date,
        old_date: voucher.date,
        old_narration: voucher.narration,
        new_narration: stamp,
      },
    ]
  })

/** Brings the index up to what Tally now holds, for the rows it says it updated. */
export const applyVoucherResults = (index, sentRows, results) => {
  const updated = new Set((Array.isArray(results) ? results : []).filter((one) => one?.status === 'success').map((one) => one.guid))
  const sent = new Map(sentRows.filter((row) => updated.has(row.guid)).map((row) => [row.guid, row]))
  index.forEach((voucher) => {
    const row = sent.get(voucher.guid)
    if (!row) return
    voucher.invoiceNumber = row.invoice_number
    voucher.date = row.date
    voucher.narration = `${row.old_narration} ${row.new_narration}`.trim()
  })
}

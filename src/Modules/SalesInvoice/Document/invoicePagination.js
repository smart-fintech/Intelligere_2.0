/**
 * SPLITTING THE INVOICE INTO A4 SHEETS - from measured heights, never from
 * guesses.
 *
 * The template renders every block once, off screen, at the true sheet width
 * (MeasureHost); useInvoiceLayout reads the real pixel heights and hands them
 * here. Nothing is estimated, so what the preview shows is exactly what is
 * captured into the PDF, sheet for sheet.
 *
 *   every sheet     title, header (parties + document details), goods table head
 *   page 1          with an IRN, the e-Invoice band (metrics.irn) in place of the
 *                   title - the title is inside it
 *   non-final       goods rows to the foot of the sheet, then "Continue Page No. N"
 *   closing sheet   the remaining rows, Total, amount in words, HSN/SAC summary,
 *                   tax in words, bank, note, declaration
 *
 * The goods rows are one stream: products, other charges, discount, the GST
 * lines per rate, TCS, round off. A sheet never cuts a row in two.
 *
 * Every sheet has exactly one stretching element - the goods box, or on a
 * summary-only sheet the HSN/SAC table - so each sheet is exactly A4 and every
 * box closes with its bottom rule.
 */

/** A4 at 96 dpi, in CSS pixels - the size of one .inv-sheet. */
export const A4 = Object.freeze({ width: 794, height: 1123 })

/** The sheet's padding (invoice.css .inv-sheet), top and bottom. */
const PAGE_PADDING = 20

/** A few pixels kept free on every sheet, against sub-pixel rounding. */
const SAFETY_RESERVE = 8

const USABLE = A4.height - PAGE_PADDING * 2 - SAFETY_RESERVE

/** A goods row that is a product (its key is "prod-<id>") - every other row is a charge or a tax/total line. */
const isProductRow = (row) => row.key.startsWith('prod-')

/**
 * Title, header and footer - on every sheet; on page 1 (`index` 0) of an
 * invoice with an IRN, the e-Invoice band in place of the title. A one-sheet
 * invoice prints no "Page 1 of 1".
 */
const furniture = (metrics, pageCount, index = 1) =>
  (index === 0 && metrics.irn > 0 ? metrics.irn : metrics.title) + metrics.header + (pageCount === 1 ? metrics.footSingle : metrics.foot)

/** The closing stack: Total row through the declaration. */
const closingHeight = (metrics) => metrics.totalRow + metrics.words + metrics.hsn + metrics.pay + metrics.decl

const sum = (list, from = 0, to = list.length) => {
  let total = 0
  for (let index = from; index < to; index += 1) total += list[index]
  return total
}

/**
 * Room for goods rows on one sheet - negative when even an empty goods box
 * does not fit. `closing` is what the closing sheet must also hold.
 */
const capacity = (index, pageCount, metrics, closing) =>
  USABLE - furniture(metrics, pageCount, index) - metrics.thead - (index === pageCount - 1 ? closing : metrics.continued)

/**
 * Packs the rows onto exactly `pageCount` sheets, each filled as far as it
 * goes - or null when they do not fit. A middle sheet is never left empty.
 */
function pack(rows, pageCount, metrics, closing) {
  const pages = []
  let next = 0
  for (let page = 0; page < pageCount; page += 1) {
    const room = capacity(page, pageCount, metrics, closing)
    const owedToLaterSheets = Math.max(0, pageCount - 2 - page)
    const keys = []
    let used = 0
    while (next < rows.length) {
      if (page < pageCount - 1 && rows.length - next <= owedToLaterSheets) break
      if (used + rows[next].h > room) break
      keys.push(rows[next].key)
      used += rows[next].h
      next += 1
    }
    if (keys.length === 0 && rows.length > 0 && page < pageCount - 1) return null
    pages.push(keys)
  }
  return next === rows.length ? pages : null
}

/**
 * A closing sheet that came out with no goods rows - the rows filled the
 * sheets before it, and only the summary was left over - would print an empty
 * goods box above the totals, with the GST lines a page away from the Total
 * they add up to. So the charge and tax lines at the end of the previous sheet
 * move down onto it, as many as fit, and always leaving that sheet a row.
 */
function keepTotalsWithTaxLines(pages, rows, metrics, closing) {
  const last = pages.length - 1
  if (last < 1 || pages[last].length > 0) return pages

  const byKey = new Map(rows.map((row) => [row.key, row]))
  const previous = [...pages[last - 1]]
  const moved = []
  let room = capacity(last, pages.length, metrics, closing)

  while (previous.length > 1) {
    const row = byKey.get(previous[previous.length - 1])
    if (isProductRow(row) || row.h > room) break
    moved.unshift(previous.pop())
    room -= row.h
  }

  if (moved.length === 0) return pages
  return pages.map((keys, index) => (index === last - 1 ? previous : index === last ? moved : keys))
}

/** The smallest number of sheets that holds every row with the closing stack - null if none can. */
function fewestPages(rows, metrics, closing) {
  for (let pageCount = 1; pageCount <= rows.length + 1; pageCount += 1) {
    if (capacity(pageCount - 1, pageCount, metrics, closing) < 0) {
      if (pageCount > 1) return null
      continue
    }
    const pages = pack(rows, pageCount, metrics, closing)
    if (pages) return keepTotalsWithTaxLines(pages, rows, metrics, closing)
  }
  return null
}

/** Sheets of row keys -> sheets with how far each goods box stretches. */
function withFillers(pages, rows, metrics, closing) {
  const heights = new Map(rows.map((row) => [row.key, row.h]))
  return pages.map((keys, index) => ({
    keys,
    goods: true,
    isLast: index === pages.length - 1,
    filler: Math.max(0, capacity(index, pages.length, metrics, closing) - keys.reduce((total, key) => total + (heights.get(key) || 0), 0)),
  }))
}

/**
 * The goods rows first, closed by Total and the amount in words; the HSN/SAC
 * rows then flow into the room under them and on to as many summary-only
 * sheets as they need. The last one also takes tax in words, bank, note and
 * the declaration, with at least one HSN/SAC row for company.
 */
function continueSummary(rows, metrics) {
  const hsnRows = metrics.hsnRows
  const count = hsnRows.length
  const frame = Math.max(0, metrics.hsn - metrics.hsnHead - sum(hsnRows) - metrics.hsnTot)
  const head = metrics.hsnHead + frame
  const tail = metrics.hsnTot + metrics.pay + metrics.decl
  const closeGoods = metrics.totalRow + metrics.words

  const goodsPages = fewestPages(rows, metrics, closeGoods)
  if (!goodsPages) return null

  const pages = withFillers(goodsPages, rows, metrics, closeGoods).map((page) => ({ ...page, hsn: null, pay: false }))
  let page = pages[pages.length - 1]
  let space = page.filler
  page.filler = 0
  let from = 0

  for (;;) {
    const rest = head + sum(hsnRows, from) + tail
    if (rest <= space) {
      page.hsn = { from, to: count, total: true, filler: page.goods ? 0 : space - rest }
      page.pay = true
      if (page.goods) page.filler = space - rest
      return pages
    }

    let to = from
    let used = head
    while (to < count - 1 && used + hsnRows[to] <= space) {
      used += hsnRows[to]
      to += 1
    }
    if (to > from) {
      page.hsn = { from, to, total: false, filler: page.goods ? 0 : space - used }
      if (page.goods) page.filler = space - used
    } else if (page.goods) {
      page.filler = space
    } else {
      return null
    }
    from = to

    page = { keys: [], goods: false, isLast: false, filler: 0, hsn: null, pay: false }
    pages.push(page)
    space = USABLE - furniture(metrics, 2)
  }
}

/**
 * @param rows     [{ key, h }] - the goods rows, measured
 * @param metrics  the measured block heights (useInvoiceLayout)
 * @returns [{ keys, goods, isLast, filler, hsn: { from, to, total, filler } | null, pay }]
 */
export function paginate(rows, metrics) {
  const hsnCount = metrics.hsnRows.length
  const closing = closingHeight(metrics)
  const wholeSummary = (pages) =>
    withFillers(pages, rows, metrics, closing).map((page) => ({
      ...page,
      hsn: page.isLast && hsnCount ? { from: 0, to: hsnCount, total: true, filler: 0 } : null,
      pay: page.isLast,
    }))

  // The usual case: the whole closing stack fits under the last goods rows.
  const packed = fewestPages(rows, metrics, closing)
  if (packed) return wholeSummary(packed)

  // The HSN/SAC summary is longer than one sheet can hold - continue it.
  const continued = hsnCount ? continueSummary(rows, metrics) : null
  if (continued) return continued

  // Not reachable for real input; a plain greedy fill keeps the output readable.
  const pages = []
  let keys = []
  let used = 0
  rows.forEach((row) => {
    const room = capacity(pages.length, pages.length + 2, metrics, closing)
    if (keys.length && used + row.h > room) {
      pages.push(keys)
      keys = []
      used = 0
    }
    keys.push(row.key)
    used += row.h
  })
  pages.push(keys)
  return wholeSummary(pages)
}

/** What one sheet prints - its goods box, its part of the HSN/SAC summary, and whether it closes the document. */
export const sheetParts = (page) => ({
  goods: page.goods !== false,
  hsn: page.hsn ?? null,
  pay: Boolean(page.pay),
})

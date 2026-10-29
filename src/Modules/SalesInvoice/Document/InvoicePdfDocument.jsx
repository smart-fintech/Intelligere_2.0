import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import {
  amountInWords,
  dispatchLines,
  formatAmount,
  has,
  hasConsignee,
  hasDispatch,
  headerMetaRows,
  partyLines,
  plainLines,
  sellerLines,
  taxAmountInWords,
  transportRows,
} from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { sheetParts } from '@/Modules/SalesInvoice/Document/invoicePagination'

/**
 * THE INVOICE AS A VECTOR PDF - real text and real lines, drawn with
 * @react-pdf/renderer from the same model, the same words and the same page
 * split as the on-screen sheets (InvoiceTemplate + invoicePagination).
 *
 * Text is set in the PDF's built-in Helvetica faces (nothing to download or
 * embed), so every letter, figure and rule stays sharp at any zoom, the file
 * is tens of kilobytes rather than megabytes, and the text can be selected
 * and searched. Images (logo, signature, payment QR) are embedded once each.
 *
 * Sizes are in points (1pt = 1/72in) on an A4 page of 595 x 842pt; the
 * on-screen sheet is 794 x 1123 CSS px, so 1px on screen is 0.75pt here and
 * every size below is the sheet's px size x 0.75.
 *
 *   <InvoicePdfDocument model pages rowsByKey rowPx metrics />  - rendered to
 *   bytes by createInvoicePdf (invoicePdf.js)
 */

const B = '#000'

const s = StyleSheet.create({
  page: { padding: 15, fontSize: 7.2, fontFamily: 'Helvetica', color: '#000', display: 'flex', flexDirection: 'column' },
  title: { textAlign: 'center', fontSize: 12.5, paddingBottom: 3 },
  header: { borderWidth: 1, borderColor: B, flexDirection: 'row' },
  hLeft: { width: '52%', borderRightWidth: 1, borderColor: B },
  hRight: { width: '48%' },
  party: { padding: 3, borderBottomWidth: 1, borderColor: B },
  partyLast: { padding: 3 },
  tag: { fontSize: 6.4 },
  name: { fontSize: 8.25, fontFamily: 'Helvetica-Bold', marginVertical: 1 },
  sellerName: { fontSize: 9 },
  line: { fontSize: 7 },
  partyLine: { fontSize: 8.25 },
  bold: { fontFamily: 'Helvetica-Bold' },
  metaRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: B, flexShrink: 0 },
  metaCell: { flex: 1, padding: 2, borderRightWidth: 1, borderColor: B, minHeight: 19, flexShrink: 0 },
  // No `flex` here: inside the column-direction right header, flexBasis 0
  // would collapse the block onto the row above it.
  dispatchCell: { padding: 2, borderColor: B, minHeight: 19, flexShrink: 0 },
  metaLabel: { fontSize: 8.25, color: '#333' },
  metaValue: { fontSize: 8.25, fontFamily: 'Helvetica-Bold' },
  metaLine: { fontSize: 8.25 },

  // A border is painted inside its own box, so where two boxes meet both
  // rules would print side by side as one doubled line - the lower box drops
  // the shared edge (the goods head sits under the header's bottom rule).
  tHead: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: B },
  tRow: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderColor: B },
  cell: { paddingVertical: 2, paddingHorizontal: 3 },
  cNo: { width: '5%', textAlign: 'center', borderRightWidth: 1, borderColor: B },
  cDesc: { width: '39%', borderRightWidth: 1, borderColor: B },
  cHsn: { width: '13%', textAlign: 'center', borderRightWidth: 1, borderColor: B },
  cQty: { width: '10%', textAlign: 'center', borderRightWidth: 1, borderColor: B },
  cRate: { width: '11%', textAlign: 'right', borderRightWidth: 1, borderColor: B },
  cPer: { width: '7%', textAlign: 'center', borderRightWidth: 1, borderColor: B },
  cAmt: { width: '15%', textAlign: 'right' },
  filler: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderColor: B },
  itemName: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  col12: { fontSize: 9 },
  charge: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  noLedger: { color: '#dc2626' },
  itemDesc: { fontSize: 7.5, color: '#333' },
  totalRow: { flexDirection: 'row', borderWidth: 1, borderColor: B, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  continuedRow: { borderWidth: 1, borderColor: B },
  box: { borderWidth: 1, borderTopWidth: 0, borderColor: B, padding: 3 },
  bankCell: { flex: 1, padding: 3, borderRightWidth: 1, borderColor: B },
  payRow: { padding: 3, borderBottomWidth: 1, borderColor: B, minHeight: 16 },
  payQr: { width: 78, borderLeftWidth: 1, borderColor: B, padding: 3, alignItems: 'center', justifyContent: 'center' },
  hsnCell: { borderRightWidth: 1, borderColor: B, paddingVertical: 1, paddingHorizontal: 3, fontSize: 8.25 },
  genfoot: { textAlign: 'center', fontSize: 6.4, paddingTop: 4 },
  pageno: { textAlign: 'right', fontSize: 6.2, paddingTop: 2 },
  cancelled: {
    position: 'absolute',
    top: 330,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 96,
    fontFamily: 'Helvetica-Bold',
    color: '#dc2626',
    opacity: 0.28,
    transform: 'rotate(-35deg)',
  },
})

const Cell = ({ style, children, bold }) => <Text style={[s.cell, style, bold ? s.bold : null]}>{children}</Text>

/** A party line's segments, bold where the value is. */
const SegLine = ({ line, style }) => (
  <Text style={[s.line, style]}>
    {line.map((part, index) => (part.b ? <Text key={index} style={s.bold}>{part.t}</Text> : <Text key={index}>{part.t}</Text>))}
  </Text>
)

/* ------------------------------------------------------------------ */
/* Long values without spaces                                         */
/* ------------------------------------------------------------------ */

// react-pdf breaks lines only at spaces - inside a word it can only hyphenate,
// adding a "-" that is not part of the value - so a value with no spaces
// ("MW/SL/2026-27/INV/...") would run out of its box. Such values are broken
// to the box width beforehand: after a "/", "-", "," or space where possible,
// measured with the browser's metrics for the same typeface.
const META_PT = 8.25
const RIGHT_W = (565.28 - 2) * 0.48
/** One of n boxes in a header row (two-up, or three-up), less its padding and rule. */
const cellWidth = (n) => RIGHT_W / Math.max(2, n) - 2 * 2 - 1

let measureContext = null
function textWidthPt(text, bold, pt = META_PT) {
  measureContext = measureContext || document.createElement('canvas').getContext('2d')
  measureContext.font = `${bold ? 'bold ' : ''}100px Helvetica, Arial, sans-serif`
  return (measureContext.measureText(text).width / 100) * pt
}

function fitLines(text, widthPt, pt = META_PT, bold = true) {
  const value = String(text ?? '')
  if (!value || typeof document === 'undefined') return value
  const max = widthPt * 0.97
  const lines = []
  let rest = value
  while (rest && textWidthPt(rest, bold, pt) > max) {
    let n = rest.length - 1
    while (n > 0 && textWidthPt(rest.slice(0, n), bold, pt) > max) n -= 1
    const cut = Math.max(...['/', '-', ',', ' '].map((separator) => rest.lastIndexOf(separator, n - 1)))
    const at = cut > 0 ? cut + 1 : Math.max(1, n)
    lines.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  lines.push(rest)
  return lines.join('\n')
}

// A figure too wide for its goods column (a rate over a crore, say) is broken
// inside the column the same way, after a comma where possible.
const GOODS_INNER = 565.28 - 2
const columnWidth = (percent) => (GOODS_INNER * percent) / 100 - 3 * 2 - 1
const COLUMN_WIDTH = { hsn: columnWidth(13), qty: columnWidth(10), rate: columnWidth(11), amt: columnWidth(15) }
const fitColumn = (text, column, bold) => fitLines(text, COLUMN_WIDTH[column], 9, bold)

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

const MetaCellView = ({ cell, width, lastColumn }) => (
  // The header's own right rule closes the row - a divider there would double it.
  <View style={[s.metaCell, lastColumn ? { borderRightWidth: 0 } : null]}>
    <Text style={s.metaLabel}>{cell.label}</Text>
    <Text style={s.metaValue}>{fitLines(cell.value, width)}</Text>
  </View>
)

/** One header row; the last stretches so its dividers reach the bottom of the header. */
const MetaRowView = ({ row, last }) => (
  <View style={[s.metaRow, last ? { flexGrow: 1, borderBottomWidth: 0 } : null]}>
    {row.map((cell, index) => (
      <MetaCellView key={cell.label} cell={cell} width={cellWidth(row.length)} lastColumn={row.length > 1 && index === row.length - 1} />
    ))}
    {row.length === 1 ? <View style={[s.metaCell, { borderRightWidth: 0 }]} /> : null}
  </View>
)

function PartyView({ tag, party, last, plain }) {
  const lines = partyLines(party)
  return (
    <View style={last ? s.partyLast : s.party}>
      {tag ? <Text style={s.tag}>{tag}</Text> : null}
      <Text style={s.name}>{party.name}</Text>
      {(plain ? plainLines(lines) : lines).map((line, index) => (
        <SegLine key={index} line={line} style={s.partyLine} />
      ))}
    </View>
  )
}

function HeaderView({ model, minHeight }) {
  const { seller, buyer, shipping, dispatch, invoice } = model
  const rows = [...headerMetaRows(invoice), ...transportRows(invoice)]
  const showDispatch = hasDispatch(dispatch)
  const showConsignee = hasConsignee(shipping)

  return (
    <View style={[s.header, minHeight ? { minHeight } : null]}>
      <View style={s.hLeft}>
        <View style={s.party}>
          <View style={{ flexDirection: 'row' }}>
            {seller.logo ? <Image style={{ width: 42, height: 42, marginRight: 6 }} src={seller.logo} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={[s.name, s.sellerName]}>{seller.name}</Text>
              {plainLines(sellerLines(seller)).map((line, index) => (
                <SegLine key={index} line={line} style={s.partyLine} />
              ))}
            </View>
          </View>
        </View>
        <PartyView tag="Buyer (Bill to)" party={buyer} last={!showConsignee} plain />
        {showConsignee ? <PartyView tag="Consignee (Ship to)" party={shipping} last /> : null}
      </View>

      <View style={s.hRight}>
        {rows.map((row, index) => (
          <MetaRowView key={index} row={row} last={!showDispatch && index === rows.length - 1} />
        ))}
        {showDispatch ? (
          <View style={s.dispatchCell}>
            <Text style={s.metaLabel}>Terms of delivery / Dispatch From</Text>
            {has(dispatch.company) ? <Text style={[s.line, s.metaLine, s.bold]}>{dispatch.company}</Text> : null}
            {dispatchLines(dispatch).map((line, index) => (
              <SegLine key={index} line={line} style={s.metaLine} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Goods table                                                        */
/* ------------------------------------------------------------------ */

function GoodsRowView({ row, minHeight }) {
  if (!row) return null
  // At least the height measured on screen, so the table keeps the sheet's
  // geometry; a row that wraps differently here grows rather than overlaps.
  const fixed = minHeight ? { minHeight } : null

  if (row.type === 'product') {
    const line = row.data
    return (
      <View style={[s.tRow, fixed]} wrap={false}>
        <Cell style={s.cNo}>{row.sr}</Cell>
        <View style={[s.cell, s.cDesc]}>
          <Text style={s.itemName}>{line.name}</Text>
          {has(line.description) ? <Text style={s.itemDesc}>{line.description}</Text> : null}
        </View>
        <Cell style={[s.cHsn, s.col12]}>{fitColumn(line.hsn, 'hsn', false)}</Cell>
        <Cell style={[s.cQty, s.col12]} bold>
          {fitColumn(line.quantity, 'qty', true)}
        </Cell>
        <Cell style={[s.cRate, s.col12]}>{fitColumn(formatAmount(line.rate), 'rate', false)}</Cell>
        <Cell style={[s.cPer, s.col12]}>{line.per}</Cell>
        <Cell style={[s.cAmt, s.col12]} bold>
          {fitColumn(formatAmount(line.taxable), 'amt', true)}
        </Cell>
      </View>
    )
  }

  // A charge, the discount, a GST line, TCS or round off: its name and amount.
  return (
    <View style={[s.tRow, fixed]} wrap={false}>
      <Cell style={s.cNo} />
      <Cell style={[s.cDesc, { textAlign: 'right', paddingRight: 6 }, s.charge]}>
        {row.label}
        {/* The same red "No Ledger" as the sheet, for a GST row with no ledger. */}
        {row.missingLedger ? (
          <>
            {' - '}
            <Text style={s.noLedger}>No Ledger</Text>
          </>
        ) : null}
      </Cell>
      <Cell style={s.cHsn} />
      <Cell style={s.cQty} />
      <Cell style={s.cRate} />
      <Cell style={s.cPer} />
      <Cell style={[s.cAmt, s.col12, s.charge]} bold>
        {fitColumn(formatAmount(row.amount), 'amt', true)}
      </Cell>
    </View>
  )
}

/** The empty stretch that carries the column rules down to the foot of the goods box. */
const FillerView = () => (
  <View style={[s.filler, { flexGrow: 1, minHeight: 4 }]}>
    <View style={s.cNo} />
    <View style={s.cDesc} />
    <View style={s.cHsn} />
    <View style={s.cQty} />
    <View style={s.cRate} />
    <View style={s.cPer} />
    <View style={s.cAmt} />
  </View>
)

/* ------------------------------------------------------------------ */
/* HSN/SAC summary                                                    */
/* ------------------------------------------------------------------ */

const HeadCell = ({ width, children, lastColumn, rows }) => (
  <Text
    style={[
      s.hsnCell,
      { width, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
      rows === 2 ? { paddingTop: 8 } : null,
      lastColumn ? { borderRightWidth: 0 } : null,
    ]}
  >
    {children}
  </Text>
)

/** A tax (CGST / SGST / IGST) over its Rate(%) + Amount pair. */
const TaxGroup = ({ label, width }) => (
  <View style={{ width: `${parseFloat(width) * 2}%` }}>
    <Text style={[s.hsnCell, { textAlign: 'center', fontFamily: 'Helvetica-Bold', borderBottomWidth: 1, borderRightWidth: 1, borderColor: B }]}>
      {label}
    </Text>
    <View style={{ flexDirection: 'row' }}>
      <Text style={[s.hsnCell, { width: '50%', textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>Rate(%)</Text>
      <Text style={[s.hsnCell, { width: '50%', textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>Amount</Text>
    </View>
  </View>
)

const DataCell = ({ width, children, align = 'right', lastColumn, bold }) => (
  <Text style={[s.hsnCell, { width, textAlign: align }, bold ? s.bold : null, lastColumn ? { borderRightWidth: 0 } : null]}>
    {children}
  </Text>
)

/**
 * `part` = { from, to, total } prints rows [from, to) - how a long summary
 * continues on the next sheet; only the closing part carries the Total row.
 * On a summary-only sheet (`grow`) an empty stretch row takes the slack.
 */
function HsnView({ model, part, grow }) {
  const { rows, totals, anySplit, anyIgst } = model.hsn
  if (!rows.length) return null

  const taxColumns = (anySplit ? 4 : 0) + (anyIgst ? 2 : 0)
  const width = { hsn: '18%', tax: '20%', total: '17%' }
  const each = `${(100 - 18 - 20 - 17) / Math.max(1, taxColumns)}%`
  const { from = 0, to = rows.length, total = true } = part ?? {}
  const slice = rows.slice(from, to)
  const columnWidths = [width.hsn, width.tax, ...Array(taxColumns).fill(each), width.total]
  const pair = (rate, amount) => (
    <>
      <DataCell width={each} align="center">
        {rate ?? ''}
      </DataCell>
      <DataCell width={each}>{rate == null ? '' : formatAmount(amount)}</DataCell>
    </>
  )

  return (
    // No top rule: the table sits under the amount in words (or, on a
    // summary-only sheet, the header), whose bottom rule is the shared edge.
    <View style={[{ borderWidth: 1, borderTopWidth: 0, borderColor: B }, grow ? { flexGrow: 1 } : null]}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: B }}>
        <HeadCell width={width.hsn} rows={2}>
          HSN/SAC
        </HeadCell>
        <HeadCell width={width.tax} rows={2}>
          Taxable Value
        </HeadCell>
        {anySplit ? <TaxGroup label="CGST" width={each} /> : null}
        {anySplit ? <TaxGroup label="SGST" width={each} /> : null}
        {anyIgst ? <TaxGroup label="IGST" width={each} /> : null}
        <HeadCell width={width.total} rows={2} lastColumn>
          Total TAX Amount
        </HeadCell>
      </View>
      {slice.map((row, index) => (
        <View
          key={from + index}
          style={{ flexDirection: 'row', borderBottomWidth: index === slice.length - 1 && !total && !grow ? 0 : 1, borderColor: B }}
        >
          <DataCell width={width.hsn} align="center">
            {row.hsn}
          </DataCell>
          <DataCell width={width.tax}>{formatAmount(row.taxable)}</DataCell>
          {anySplit ? pair(row.cgstRate, row.cgst) : null}
          {anySplit ? pair(row.sgstRate, row.sgst) : null}
          {anyIgst ? pair(row.igstRate, row.igst) : null}
          <DataCell width={width.total} lastColumn>
            {formatAmount(row.total)}
          </DataCell>
        </View>
      ))}
      {grow ? (
        <View style={{ flexDirection: 'row', flexGrow: 1, borderBottomWidth: total ? 1 : 0, borderColor: B }}>
          {columnWidths.map((columnWidthValue, index) => (
            <View
              key={index}
              style={[{ width: columnWidthValue, borderRightWidth: 1, borderColor: B }, index === columnWidths.length - 1 ? { borderRightWidth: 0 } : null]}
            />
          ))}
        </View>
      ) : null}
      {total ? (
        <View style={{ flexDirection: 'row' }}>
          <DataCell width={width.hsn} align="center" bold>
            Total
          </DataCell>
          <DataCell width={width.tax} bold>
            {formatAmount(totals.taxable)}
          </DataCell>
          {anySplit ? (
            <>
              <DataCell width={each} />
              <DataCell width={each} bold>
                {formatAmount(totals.cgst)}
              </DataCell>
              <DataCell width={each} />
              <DataCell width={each} bold>
                {formatAmount(totals.sgst)}
              </DataCell>
            </>
          ) : null}
          {anyIgst ? (
            <>
              <DataCell width={each} />
              <DataCell width={each} bold>
                {formatAmount(totals.igst)}
              </DataCell>
            </>
          ) : null}
          <DataCell width={width.total} lastColumn bold>
            {formatAmount(totals.total)}
          </DataCell>
        </View>
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Closing stack                                                      */
/* ------------------------------------------------------------------ */

function WordsView({ model }) {
  return (
    <View style={s.box}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[s.bold, { fontSize: 7.5 }]}>Amount Chargeable (in Words)</Text>
        <Text style={{ fontSize: 6.4 }}>E.&amp;O.E</Text>
      </View>
      <Text style={[s.bold, { fontSize: 7.5 }]}>{amountInWords(model.totals.grandTotal)}</Text>
    </View>
  )
}

/** Tax in words, bank and note with the Payment QR beside them, then the declaration. */
function PayDeclarationView({ model }) {
  const { bank, invoice, other, totals } = model
  const value = [s.bold, { fontSize: 8.25 }]
  const showNote = has(other.note)
  // The last row of the left stack stretches to the foot of the block with no
  // rule of its own - the box's edge closes it, beside a taller Payment QR.
  const last = { borderBottomWidth: 0, flexGrow: 1 }

  return (
    <View>
      <View style={[s.box, { flexDirection: 'row', padding: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.payRow, !bank && !showNote ? last : null]}>
            Tax Amount (in words) : <Text style={s.bold}>{taxAmountInWords(totals.totalTax)}</Text>
          </Text>
          {bank ? (
            <View style={[s.payRow, { flexDirection: 'row', padding: 0 }, !showNote ? last : null]}>
              <Text style={s.bankCell}>
                Bank Name : <Text style={value}>{bank.bankName}</Text>
              </Text>
              <Text style={s.bankCell}>
                IFSC Code : <Text style={value}>{bank.ifsc}</Text>
              </Text>
              <Text style={[s.bankCell, { borderRightWidth: 0 }]}>
                Account No. : <Text style={value}>{bank.accountNo}</Text>
              </Text>
            </View>
          ) : null}
          {showNote ? <Text style={[s.payRow, last]}>Note : {other.note}</Text> : null}
        </View>
        {invoice.paymentQr ? (
          <View style={s.payQr}>
            <Text style={{ fontSize: 6.4, paddingBottom: 2 }}>Payment QR</Text>
            <Image style={{ width: 56, height: 56 }} src={invoice.paymentQr} />
          </View>
        ) : null}
      </View>
      <View style={[s.box, { flexDirection: 'row', padding: 0 }]}>
        <View style={[s.bold, { flex: 1, padding: 4, borderRightWidth: 1, borderColor: B, fontSize: 7.5 }]}>
          <Text>Declaration :</Text>
          <Text style={{ paddingTop: 5 }}>
            We declare that this {(model.invoice.word || 'Invoice').toLowerCase()} shows the actual price of the goods
            described and that all particulars are true and correct.
          </Text>
        </View>
        <View style={{ width: 180, padding: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 6.4 }}>For</Text>
            <Text style={{ fontSize: 6.4 }}>{model.seller.name}</Text>
          </View>
          {model.seller.signature ? (
            <Image style={{ height: 22, marginTop: 2, alignSelf: 'flex-end' }} src={model.seller.signature} />
          ) : (
            <View style={{ height: 22 }} />
          )}
          <Text style={{ fontSize: 6.4, textAlign: 'right' }}>Authorised Signatory</Text>
        </View>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* The document                                                       */
/* ------------------------------------------------------------------ */

/** A measured px height as a minimum in points, as the vector layout is pinned to the sheet's. */
const pt = (px) => (px ? (px * 72) / 288 : null)

const IrnLine = ({ label, value }) => (
  <View style={[s.bold, { flexDirection: 'row', marginBottom: 0.5, fontSize: 7.5 }]}>
    <Text style={{ width: 43.5 }}>{label}</Text>
    <Text style={{ width: 7.5 }}>:</Text>
    <Text style={{ flex: 1 }}>{value}</Text>
  </View>
)

/**
 * The e-Invoice band - page 1 only, and only with an IRN (InvoiceTemplate's
 * IrnBlock): the strip, IRN / Ack No. / Ack Date at the bottom-left, the QR
 * (4cm = 114pt) on the right, and page 1's title in the middle of the band.
 */
function IrnView({ model, title, minHeight }) {
  const e = model.einvoice
  if (!e) return null
  return (
    <View style={[{ paddingBottom: 3 }, minHeight ? { minHeight } : null]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 }}>
        <Text style={{ fontSize: 6.75, fontStyle: 'italic' }}>{model.printedOn}</Text>
        <Text style={[s.bold, { fontSize: 7.9 }]}>e-Invoice</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', position: 'relative' }}>
        <View style={{ flex: 1, paddingRight: 7.5, alignSelf: 'flex-end' }}>
          <IrnLine label="IRN" value={e.irn} />
          <IrnLine label="Ack No." value={e.ackNo} />
          <IrnLine label="Ack Date" value={e.ackDate} />
        </View>
        {e.qr ? <Image style={{ width: 114, height: 114 }} src={e.qr} /> : <View style={{ width: 114, height: 114 }} />}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>
          <Text style={[s.title, { paddingBottom: 0 }]}>{title}</Text>
        </View>
      </View>
    </View>
  )
}

export default function InvoicePdfDocument({ model, pages, rowsByKey, rowPx = {}, metrics = null }) {
  const sheets = pages.map((page) => ({ ...page, ...sheetParts(page) }))
  const title = model.invoice.type || 'Tax Invoice'
  const quantity = model.lines.filter((line) => line.kind === 'product').reduce((sum, line) => sum + line.quantity, 0)

  return (
    <Document title={model.invoice.invoiceNo || 'Invoice'}>
      {sheets.map((page, index) => (
        <Page key={index} size="A4" style={s.page}>
          {/* With an IRN, page 1's title is inside the e-Invoice band. */}
          {index === 0 && model.einvoice ? null : <Text style={s.title}>{index > 0 ? `${title} (Page ${index + 1})` : title}</Text>}
          {index === 0 ? <IrnView model={model} title={title} minHeight={pt(metrics?.irn)} /> : null}
          <HeaderView model={model} minHeight={pt(metrics?.header)} />
          {page.goods ? (
            <>
              <View style={s.tHead}>
                <Cell style={s.cNo}>No.</Cell>
                <Cell style={[s.cDesc, { textAlign: 'center' }]}>Description of Goods</Cell>
                <Cell style={[s.cHsn, s.col12]}>HSN/SAC</Cell>
                <Cell style={[s.cQty, s.col12]}>Quantity</Cell>
                <Cell style={[s.cRate, s.col12, { textAlign: 'center' }]}>Rate</Cell>
                <Cell style={[s.cPer, s.col12]}>Per</Cell>
                <Cell style={[s.cAmt, s.col12, { textAlign: 'center' }]}>Amount</Cell>
              </View>
              {page.keys.map((key) => (
                <GoodsRowView key={key} row={rowsByKey[key]} minHeight={pt(rowPx[key])} />
              ))}
              <FillerView />
              {page.isLast ? (
                <View style={s.totalRow}>
                  <Cell style={s.cNo} />
                  <Cell style={[s.cDesc, { textAlign: 'right', paddingRight: 6 }]} bold>
                    Total
                  </Cell>
                  <Cell style={s.cHsn} />
                  <Cell style={s.cQty} bold>
                    {quantity}
                  </Cell>
                  <Cell style={s.cRate} />
                  <Cell style={s.cPer} />
                  <Cell style={s.cAmt} bold>
                    {formatAmount(model.totals.grandTotal)}
                  </Cell>
                </View>
              ) : (
                <View style={s.continuedRow}>
                  <Text style={{ textAlign: 'right', fontSize: 6.4, padding: 2 }}>Continue Page No. {index + 2}</Text>
                </View>
              )}
            </>
          ) : null}
          {page.isLast ? <WordsView model={model} /> : null}
          {page.hsn ? <HsnView model={model} part={page.hsn} grow={!page.goods} /> : null}
          {page.pay ? <PayDeclarationView model={model} /> : null}
          <Text style={s.genfoot}>This is a Computer Generated {model.invoice.word || 'Invoice'}</Text>
          {sheets.length > 1 ? (
            <Text style={s.pageno}>
              Page {index + 1} of {sheets.length}
            </Text>
          ) : null}
          {model.cancelled ? <Text style={s.cancelled}>CANCELLED</Text> : null}
        </Page>
      ))}
    </Document>
  )
}


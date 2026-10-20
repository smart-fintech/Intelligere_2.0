import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { CHALLAN_COPIES, CHALLAN_TERMS } from '@/Constants/salesInvoice'
import {
  challanMetaRows,
  dispatchLines,
  has,
  hasConsignee,
  hasDispatch,
  partyLines,
  plainLines,
  sellerLines,
} from '@/Modules/SalesInvoice/Document/invoiceFormat'

/**
 * THE CHALLAN AS A VECTOR PDF - the same model, words and page split as the
 * on-screen challan sheets (ChallanTemplate + invoicePagination), drawn with
 * @react-pdf/renderer in the PDF's built-in Helvetica, at the sheet's sizes
 * x 0.75 (px -> pt), like InvoicePdfDocument.
 *
 * Every COPY chosen at saving prints the whole challan again under its own
 * heading - "(ORIGINAL FOR CONSIGNEE)", "(DUPLICATE FOR TRANSPORTER)",
 * "(TRIPLICATE FOR SUPPLIER)" - one after another in ONE file, as the earlier
 * challan PDFs did. Nothing else differs between the copies.
 *
 *   <ChallanPdfDocument model pages rowsByKey rowPx metrics copies />
 *     copies   values of CHALLAN_COPIES, in that order (all three when not given)
 */

const B = '#000'

const s = StyleSheet.create({
  page: { padding: 15, fontSize: 7.2, fontFamily: 'Helvetica', color: '#000', display: 'flex', flexDirection: 'column' },
  // Three parts - an empty one, the heading, the copy - so the heading is
  // centred and the copy sits at the right, each with a real width (an
  // absolutely placed text has none here, and would wrap letter by letter).
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 4, minHeight: 16 },
  titleSide: { flex: 1 },
  heading: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  copy: { flex: 1, fontSize: 9.75, textAlign: 'right', paddingTop: 1 },
  header: { borderWidth: 1, borderColor: B, flexDirection: 'row' },
  hLeft: { width: '52%', borderRightWidth: 1, borderColor: B },
  hRight: { width: '48%' },
  party: { padding: 3, borderBottomWidth: 1, borderColor: B },
  partyLast: { padding: 3, flexGrow: 1 },
  tag: { fontSize: 6.4 },
  name: { fontSize: 8.25, fontFamily: 'Helvetica-Bold', marginVertical: 1 },
  sellerName: { fontSize: 9 },
  partyLine: { fontSize: 8.25 },
  bold: { fontFamily: 'Helvetica-Bold' },
  metaRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: B, flexShrink: 0 },
  metaCell: { flex: 1, padding: 2, borderRightWidth: 1, borderColor: B, minHeight: 19 },
  metaLabel: { fontSize: 8.25, color: '#333' },
  metaValue: { fontSize: 8.25, fontFamily: 'Helvetica-Bold' },

  tHead: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: B },
  tRow: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderColor: B },
  cell: { paddingVertical: 2, paddingHorizontal: 3, fontSize: 8.25 },
  rule: { borderRightWidth: 1, borderColor: B },
  itemDesc: { fontSize: 7.5, color: '#333' },
  continuedRow: { borderWidth: 1, borderColor: B },

  foot: { flexDirection: 'row', borderWidth: 1, borderColor: B },
  terms: { flex: 1, padding: 3, borderRightWidth: 1, borderColor: B, fontSize: 7.5 },
  sign: { width: '25%', padding: 4, justifyContent: 'flex-end', alignItems: 'center' },
  signLabel: { width: '100%', borderTopWidth: 1, borderColor: '#999', textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7.5, paddingTop: 2 },
  pageno: { textAlign: 'right', fontSize: 6.2, paddingTop: 2 },
})

/** The goods columns' widths, as the sheet's (.inv-ch-goods). */
const columnsOf = (model) =>
  model.challan.anySku
    ? { no: '6%', desc: '39%', sku: '16%', hsn: '14%', qty: '13%', per: '12%' }
    : { no: '6%', desc: '55%', sku: null, hsn: '14%', qty: '13%', per: '12%' }

/** A measured px height as a minimum, as InvoicePdfDocument pins its rows. */
const pt = (px) => (px ? (px * 72) / 288 : null)

const SegLine = ({ line, style }) => (
  <Text style={style}>
    {line.map((part, index) => (part.b ? <Text key={index} style={s.bold}>{part.t}</Text> : <Text key={index}>{part.t}</Text>))}
  </Text>
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

const MetaValue = ({ label, value }) => (
  <View>
    <Text style={s.metaLabel}>{label}</Text>
    <Text style={s.metaValue}>{value || ' '}</Text>
  </View>
)

function HeaderView({ model, minHeight }) {
  const { seller, buyer, shipping, dispatch } = model
  const showConsignee = hasConsignee(shipping)
  // As the sheet: Dispatch From only when entered; without it the last row stretches to the header's foot.
  const showDispatch = hasDispatch(dispatch)
  const showDispatchLines = [dispatch.address, dispatch.gstin, dispatch.state, dispatch.pincode].some(has)
  const rows = challanMetaRows(model)

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
          <View key={index} style={[s.metaRow, !showDispatch && index === rows.length - 1 ? { flexGrow: 1, borderBottomWidth: 0 } : null]}>
            {row.map((cell, at) => (
              <View key={cell.label} style={[s.metaCell, row.length > 1 && at === row.length - 1 ? { borderRightWidth: 0 } : null]}>
                {cell.pair ? (
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ flex: 1 }}>
                      <MetaValue label={cell.label} value={cell.value} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <MetaValue label={cell.pair.label} value={cell.pair.value} />
                    </View>
                  </View>
                ) : (
                  <MetaValue label={cell.label} value={cell.value} />
                )}
              </View>
            ))}
            {/* an odd last box keeps its half width */}
            {row.length === 1 ? <View style={[s.metaCell, { borderRightWidth: 0 }]} /> : null}
          </View>
        ))}
        {showDispatch ? (
          <View style={{ padding: 2, flexGrow: 1 }}>
            <Text style={s.metaLabel}>Terms of delivery/Dispatch From</Text>
            {has(dispatch.company) ? <Text style={[s.partyLine, s.bold]}>{dispatch.company}</Text> : null}
            {showDispatchLines ? dispatchLines(dispatch).map((line, index) => <SegLine key={index} line={line} style={s.partyLine} />) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function GoodsHead({ model }) {
  const w = columnsOf(model)
  const head = (width, text, last) => (
    <Text style={[s.cell, { width, textAlign: 'center' }, last ? null : s.rule]}>{text}</Text>
  )
  return (
    <View style={s.tHead}>
      {head(w.no, 'No.')}
      {head(w.desc, 'Description of Goods')}
      {w.sku ? head(w.sku, 'SKU Code') : null}
      {head(w.hsn, 'HSN/SAC')}
      {head(w.qty, 'Quantity')}
      {head(w.per, 'Per', true)}
    </View>
  )
}

function GoodsRow({ model, row, minHeight }) {
  if (!row) return null
  const w = columnsOf(model)
  const line = row.data
  const box = (width, text, last) => <Text style={[s.cell, { width, textAlign: 'center' }, last ? null : s.rule]}>{text}</Text>
  return (
    <View style={[s.tRow, minHeight ? { minHeight } : null]} wrap={false}>
      {box(w.no, row.sr)}
      <View style={[s.cell, s.rule, { width: w.desc }]}>
        <Text>{line.productName}</Text>
        {has(line.description) ? <Text style={s.itemDesc}>{line.description}</Text> : null}
      </View>
      {w.sku ? box(w.sku, line.skuCode) : null}
      {box(w.hsn, line.hsn)}
      {box(w.qty, line.quantity)}
      {box(w.per, line.per, true)}
    </View>
  )
}

/** The empty stretch that carries the column rules down to the foot of the goods box. */
function Filler({ model }) {
  const w = columnsOf(model)
  const widths = [w.no, w.desc, w.sku, w.hsn, w.qty, w.per].filter(Boolean)
  return (
    <View style={[s.tRow, { flexGrow: 1, minHeight: 4 }]}>
      {widths.map((width, index) => (
        <View key={index} style={[{ width }, index === widths.length - 1 ? null : s.rule]} />
      ))}
    </View>
  )
}

function FootView({ model }) {
  return (
    <View style={s.foot} wrap={false}>
      <View style={s.terms}>
        <Text style={s.bold}>Terms &amp; Conditions :</Text>
        {CHALLAN_TERMS.map((term) => (
          <Text key={term} style={{ paddingLeft: 8 }}>
            {'•  '}
            {term}
          </Text>
        ))}
        <Text style={{ paddingTop: 5 }}>Receiver&apos;s Signature _____________________</Text>
      </View>
      <View style={s.sign}>
        {model.seller.signature ? <Image style={{ height: 24, marginBottom: 2 }} src={model.seller.signature} /> : null}
        <Text style={s.signLabel}>Signature</Text>
      </View>
    </View>
  )
}

export default function ChallanPdfDocument({ model, pages, rowsByKey, rowPx = {}, metrics = null, copies }) {
  const chosen = CHALLAN_COPIES.filter((copy) => (copies?.length ? copies.includes(copy.value) : true))

  return (
    <Document title={model.invoice.invoiceNo || 'Challan'}>
      {chosen.flatMap((copy) =>
        pages.map((page, index) => (
          <Page key={`${copy.value}-${index}`} size="A4" style={s.page}>
            <View style={s.titleRow}>
              <View style={s.titleSide} />
              <Text style={s.heading}>{model.challan.title}</Text>
              <Text style={s.copy}>({copy.label})</Text>
            </View>
            <HeaderView model={model} minHeight={pt(metrics?.header)} />
            <GoodsHead model={model} />
            {page.keys.map((key) => (
              <GoodsRow key={key} model={model} row={rowsByKey[key]} minHeight={pt(rowPx[key])} />
            ))}
            <Filler model={model} />
            {page.isLast ? (
              <FootView model={model} />
            ) : (
              <View style={s.continuedRow}>
                <Text style={{ textAlign: 'right', fontSize: 6.4, padding: 2 }}>Continue Page No. {index + 2}</Text>
              </View>
            )}
            {pages.length > 1 ? (
              <Text style={s.pageno}>
                Page {index + 1} of {pages.length}
              </Text>
            ) : null}
          </Page>
        )),
      )}
    </Document>
  )
}

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { balanceText, netText } from '@/Modules/PayableReceivable/LedgerExport/ledgerExport'
import { formatAmount } from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { breakLongWords } from '@/Utils/pdf'

/**
 * A LEDGER REPORT AS A VECTOR PDF - A4, what the screen shows (LedgerReport):
 * the company, the period, then each ledger's rows and closing balance, and the
 * grand total. As the old reports, the General Ledger has Debit, Credit and
 * Balance columns; Party-Wise has one Amount with its Dr or Cr.
 *
 *   rendered to bytes by createPdf (Utils/pdf)
 *
 * Set in the PDF's built-in Helvetica, as the app's other PDFs.
 */

const BLUE = '#13669a'
const RULE = '#d0d0d0'

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 40, fontSize: 8.5, fontFamily: 'Helvetica', color: '#222' },
  company: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BLUE, textAlign: 'center' },
  address: { color: '#555', textAlign: 'center', marginTop: 2 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 6 },
  period: { textAlign: 'center', marginTop: 2 },
  ledger: { marginTop: 14 },
  ledgerName: { fontFamily: 'Helvetica-Bold', backgroundColor: '#eef4f8', padding: 5 },
  tHead: { flexDirection: 'row', borderBottomWidth: 0.8, borderColor: '#888', fontFamily: 'Helvetica-Bold' },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: RULE },
  total: { flexDirection: 'row', borderTopWidth: 0.8, borderColor: '#888', fontFamily: 'Helvetica-Bold' },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  right: { textAlign: 'right' },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, padding: 5, borderTopWidth: 1, borderColor: BLUE, fontFamily: 'Helvetica-Bold', fontSize: 10 },
  pageNo: { position: 'absolute', bottom: 18, right: 28, fontSize: 7.5, color: '#666' },
})

const GENERAL = [
  { label: 'Date', width: '11%', value: (row) => row.date },
  { label: 'Ref No.', width: '14%', value: (row) => breakLongWords(row.invoiceNo, 14) },
  { label: 'Particulars', width: '33%', value: (row) => breakLongWords(row.particulars, 34) },
  { label: 'Debit', width: '14%', right: true, value: (row) => (row.type === 'debit' && row.hasAmount ? formatAmount(row.amount) : '') },
  { label: 'Credit', width: '14%', right: true, value: (row) => (row.type === 'credit' && row.hasAmount ? formatAmount(row.amount) : '') },
  { label: 'Balance', width: '14%', right: true, value: (row) => balanceText(row.balance) },
]

/** As the old report: what the ledger's balance amounts to says what its amounts are. */
const amountHeading = ({ debit, credit }) => {
  if (debit === credit) return 'Amount'
  return debit > credit ? 'Pending Amount' : 'Advance Amount'
}

const signedAmount = (row) => {
  if (!row.hasAmount) return ''
  return `${formatAmount(row.amount)} ${row.type === 'credit' ? 'Cr' : 'Dr'}`
}

const PARTY_WISE = [
  { label: 'Date', width: '13%', value: (row) => row.date },
  { label: 'Ref No.', width: '18%', value: (row) => breakLongWords(row.invoiceNo, 18) },
  { label: 'Particulars', width: '49%', value: (row) => breakLongWords(row.particulars, 50) },
  { label: 'Amount', width: '20%', right: true, value: signedAmount, heading: amountHeading },
]

function Row({ row, columns }) {
  return (
    <View style={s.tRow} wrap={false}>
      {columns.map((column) => (
        <Text key={column.label} style={[s.cell, { width: column.width }, column.right ? s.right : null]}>
          {column.value(row)}
        </Text>
      ))}
    </View>
  )
}

function Ledger({ ledger, columns, general }) {
  return (
    <View style={s.ledger}>
      {/* With the first row, so a ledger's name and column heads never end a page alone. */}
      <View wrap={false}>
        <Text style={s.ledgerName}>{ledger.name}</Text>
        <View style={s.tHead}>
          {columns.map((column) => (
            <Text key={column.label} style={[s.cell, { width: column.width }, column.right ? s.right : null]}>
              {column.heading ? column.heading(ledger) : column.label}
            </Text>
          ))}
        </View>
        <Row row={ledger.rows[0]} columns={columns} />
      </View>

      {ledger.rows.slice(1).map((row) => (
        <Row key={row.key} row={row} columns={columns} />
      ))}

      {general ? (
        <View style={s.total} wrap={false}>
          <Text style={[s.cell, { width: '58%' }]}>Total</Text>
          <Text style={[s.cell, s.right, { width: '14%' }]}>{formatAmount(ledger.debit)}</Text>
          <Text style={[s.cell, s.right, { width: '14%' }]}>{formatAmount(ledger.credit)}</Text>
          <Text style={[s.cell, s.right, { width: '14%' }]}>{netText(ledger.debit, ledger.credit)}</Text>
        </View>
      ) : (
        <View style={s.total} wrap={false}>
          <Text style={[s.cell, { width: '80%' }]}>Closing Balance</Text>
          <Text style={[s.cell, s.right, { width: '20%' }]}>{netText(ledger.debit, ledger.credit)}</Text>
        </View>
      )}
    </View>
  )
}

export default function LedgerReportPdfDocument({ companyName, companyAddress, general, groups, from, to }) {
  const columns = general ? GENERAL : PARTY_WISE

  return (
    <Document title={`${companyName} - ${general ? 'General Ledger' : 'Party Wise Ledger'}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.company}>{companyName}</Text>
        {companyAddress ? <Text style={s.address}>{companyAddress}</Text> : null}
        <Text style={s.title}>{general ? 'General Ledger' : 'Party Wise Ledger - Bill-wise Details'}</Text>
        <Text style={s.period}>
          From {from} to {to}
        </Text>

        {groups.map((group) => (
          <View key={group.name}>
            <Text style={[s.title, { textAlign: 'left' }]}>{group.name}</Text>
            {group.ledgers.map((ledger) => (
              <Ledger key={ledger.name} ledger={ledger} columns={columns} general={general} />
            ))}
            <View style={s.grandTotal} wrap={false}>
              <Text>Grand Total</Text>
              <Text>{netText(group.debit, group.credit)}</Text>
            </View>
          </View>
        ))}

        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  )
}

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { overdueDays, overdueText } from '@/Modules/PayableReceivable/payableReceivable'
import { formatAmount } from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { formatDate } from '@/Utils/date'
import { breakLongWords } from '@/Utils/pdf'

/**
 * A PARTY'S INVOICES AS A VECTOR PDF - the ticked ones, or all of them (`heading`
 * says which) - A4, one section per party: its invoices,
 * each with its partial payments under it, the party's total, and at the end the
 * total of them all.
 *
 *   <OutstandingPdfDocument companyName source parties={pickSelected(...)} heading />
 *   - rendered to bytes by createOutstandingPdf (outstandingPdf.js)
 *
 * Set in the PDF's built-in Helvetica, which has no rupee sign: amounts are
 * plain figures under a heading that says "(Rs.)", as on the invoice.
 */

const BLUE = '#13669a'
const RULE = '#d0d0d0'

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#222' },
  company: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BLUE },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  muted: { color: '#666' },
  meta: { marginTop: 3 },
  party: { marginTop: 14 },
  partyHead: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#eef4f8', padding: 5, fontFamily: 'Helvetica-Bold' },
  partyName: { flex: 1, marginRight: 8 },
  tHead: { flexDirection: 'row', borderBottomWidth: 0.8, borderColor: '#888', fontFamily: 'Helvetica-Bold' },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: RULE },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  cInvoice: { width: '24%' },
  cDate: { width: '14%' },
  cDays: { width: '12%', textAlign: 'right' },
  cAmount: { width: '17%', textAlign: 'right' },
  cStatus: { width: '19%' },
  partial: { marginLeft: 16, marginVertical: 3, padding: 4, borderWidth: 0.5, borderColor: RULE, backgroundColor: '#f8f9fa', fontSize: 8 },
  partialHead: { flexDirection: 'row', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  partialRow: { flexDirection: 'row', paddingVertical: 1 },
  pDate: { width: 90 },
  pAmount: { width: 90, textAlign: 'right' },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, padding: 5, borderTopWidth: 1, borderColor: BLUE, fontFamily: 'Helvetica-Bold', fontSize: 10 },
  pageNo: { position: 'absolute', bottom: 18, right: 28, fontSize: 7.5, color: '#666' },
})

function Invoice({ invoice }) {
  return (
    <View wrap={false}>
      <View style={s.tRow}>
        <Text style={[s.cell, s.cInvoice]}>{breakLongWords(invoice.invoiceNo || '--', 22)}</Text>
        <Text style={[s.cell, s.cDate]}>{formatDate(invoice.billDate)}</Text>
        <Text style={[s.cell, s.cDate]}>{formatDate(invoice.dueDate)}</Text>
        <Text style={[s.cell, s.cDays]}>{invoice.creditDays ?? '--'}</Text>
        <Text style={[s.cell, s.cAmount]}>{formatAmount(invoice.amount)}</Text>
        <Text style={[s.cell, s.cStatus]}>{overdueText(overdueDays(invoice.dueDate))}</Text>
      </View>

      {invoice.partial.length > 0 ? (
        <View style={s.partial}>
          <View style={s.partialHead}>
            <Text style={s.pDate}>Payment Date</Text>
            <Text style={s.pAmount}>Amount (Rs.)</Text>
          </View>
          {invoice.partial.map((payment) => (
            <View key={payment.key} style={s.partialRow}>
              <Text style={s.pDate}>{formatDate(payment.paymentDate)}</Text>
              <Text style={s.pAmount}>{formatAmount(payment.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export default function OutstandingPdfDocument({ companyName, source, parties, heading = 'Selected Invoices' }) {
  const type = source === 'payable' ? 'Payable' : 'Receivable'
  const total = parties.reduce((sum, party) => sum + party.total, 0)

  return (
    <Document title={`${companyName} - ${type}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.company}>{companyName}</Text>
        <Text style={s.title}>
          {type} - {heading}
        </Text>
        <Text style={[s.meta, s.muted]}>Generated on {formatDate(new Date())}</Text>

        {parties.map((party) => (
          <View key={party.name} style={s.party}>
            {/* With its first invoice, so a party's name and column heads never end a page alone. */}
            <View wrap={false}>
              <View style={s.partyHead}>
                <Text style={s.partyName}>{party.name}</Text>
                <Text>Rs. {formatAmount(party.total)}</Text>
              </View>
              <View style={s.tHead}>
                <Text style={[s.cell, s.cInvoice]}>Invoice No.</Text>
                <Text style={[s.cell, s.cDate]}>Bill Date</Text>
                <Text style={[s.cell, s.cDate]}>Due Date</Text>
                <Text style={[s.cell, s.cDays]}>Credit Days</Text>
                <Text style={[s.cell, s.cAmount]}>Outstanding (Rs.)</Text>
                <Text style={[s.cell, s.cStatus]}>Status</Text>
              </View>
              <Invoice invoice={party.invoices[0]} />
            </View>
            {party.invoices.slice(1).map((invoice) => (
              <Invoice key={invoice.key} invoice={invoice} />
            ))}
          </View>
        ))}

        <View style={s.grandTotal} wrap={false}>
          <Text>Total Outstanding</Text>
          <Text>Rs. {formatAmount(total)}</Text>
        </View>

        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  )
}

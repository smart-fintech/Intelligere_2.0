/**
 * SINGLE LEDGER - what one get_without_inventory_data/ invoice means, and
 * what Tally is sent for it. Plain functions: no React, no requests.
 *
 *   readSingleEntry(raw, { mapping, ledgerNames })   one invoice, ready to show
 *   toSingleLedgerRow(entry, party, salesLedger)     one row of the sales_without_inventory message
 *   checkSingleEntry(entry, party, salesLedger)      why it cannot go to Tally yet, or null
 *   singleVoucherLines(entry, party, salesLedger)    the Dr / Cr lines it becomes
 *
 * An invoice has no ledger lines of its own: it is posted party Dr (total),
 * sales ledger Cr (taxable amount - Voucher_amount_cr), and its GST - the
 * backend's simple voucher (tally_connector/sales_inventory_multi_ledger/,
 * no others_Ledger). As the old screen:
 *   party        the invoice's own ledgername, else the view's party ledger
 *   sales ledger the invoice's purchaseLedger, else the one picked for it, else the default
 * GST ledger names go through the without_inventory keyword mapping (IS the keyword).
 */

import { renamerOf } from '@/Modules/SalesEntries/shared/keywordMapping'
import { readLedgerList, readLines, renameLedgerList, text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'
import { rowKey } from '@/Modules/SalesEntries/shared/entryBatch'

const TAX_LISTS = Object.freeze([
  ['CGST', 'cgst_ledger'],
  ['SGST', 'sgst_ledger'],
  ['IGST', 'igst_ledger'],
  ['UGST', 'ugst_ledger'],
])

export const readSingleEntry = (raw, { mapping, ledgerNames }) => {
  const rename = renamerOf(mapping)
  const lists = Object.fromEntries(TAX_LISTS.map(([, field]) => [field, readLedgerList(renameLedgerList(raw?.[field], rename))]))
  const taxes = TAX_LISTS.flatMap(([tax, field]) => readLines(lists[field]).map((line) => ({ ...line, tax })))
  const ownParty = text(raw?.ledgername)

  return {
    key: rowKey(raw),
    invoiceNo: text(raw?.invoice_no),
    invoiceDate: text(raw?.invoice_date),
    ownParty,
    ownSalesLedger: text(raw?.purchaseLedger),
    gstin: text(raw?.gstno),
    partyGstin: text(raw?.gstin),
    state: text(raw?.state),
    address: text(raw?.ledeger_address),
    total: toNumber(raw?.total),
    taxable: toNumber(raw?.taxable_amount),
    // Only the invoice's own party can be missing - the view's is picked from the company's ledgers.
    notInTally: Boolean(ownParty) && ledgerNames.size > 0 && !ledgerNames.has(ownParty.toLowerCase()),
    taxes,
    gstTotal: taxes.reduce((sum, line) => sum + line.amount, 0),
    lists,
    raw: raw ?? {},
  }
}

export const checkSingleEntry = (entry, party, salesLedger) => {
  if (!entry.invoiceNo) return 'It has no invoice number.'
  if (!entry.invoiceDate) return 'It has no invoice date.'
  if (!text(party)) return 'It needs a party ledger.'
  if (!text(salesLedger)) return 'It needs a sales ledger.'
  return null
}

/** The agreed sales_without_inventory row - the backend reads these names. */
export const toSingleLedgerRow = (entry, party, salesLedger) => ({
  Voucher_date: entry.invoiceDate,
  ledgername: text(party),
  Voucher_amount_dr: text(entry.raw.total),
  Voucher_amount_cr: text(entry.raw.taxable_amount),
  Narration: '',
  party_gstin: entry.partyGstin,
  cgst_ledger: entry.lists.cgst_ledger,
  sgst_ledger: entry.lists.sgst_ledger,
  igst_ledger: entry.lists.igst_ledger,
  ugst_ledger: entry.lists.ugst_ledger,
  Voucher_type: text(salesLedger),
  Vouchetype: 'Sales',
  Vouchernumber: entry.invoiceNo,
  buyer_gstin: entry.gstin,
  ledeger_address: entry.address,
  buyer_state: entry.state,
})

export const singleVoucherLines = (entry, party, salesLedger) => [
  { side: 'Dr', name: text(party) || '(choose a party ledger)', amount: entry.total, kind: 'Party' },
  { side: 'Cr', name: text(salesLedger) || '(choose a sales ledger)', amount: entry.taxable, kind: 'Sales ledger' },
  ...entry.taxes.map((line) => ({ side: 'Cr', name: line.name, amount: line.amount, kind: line.tax })),
]

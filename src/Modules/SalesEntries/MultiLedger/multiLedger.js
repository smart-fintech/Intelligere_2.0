/**
 * MULTI LEDGER - what one get_multi_party_data/ entry means, and what Tally is
 * sent for it. Plain functions: no React, no requests.
 *
 *   readMultiEntry(raw, { mapping, ledgerNames })   one entry, ready to show
 *   fillB2cEntry(entry, { party, summaryDate })     a B2C entry with the view's picks in its gaps
 *   toMultiLedgerRow(entry, salesLedger)            one row of the sales_inventory_multi_ledger message
 *   checkMultiEntry(entry, salesLedger)             why it cannot go to Tally yet, or null
 *   multiVoucherLines(entry, salesLedger)           the Dr / Cr lines it becomes
 *
 * ------------------------------------------------------------------
 * KEYWORD MAPPING (source multi_party) - the old screen's rules
 * ------------------------------------------------------------------
 *   party ledger       the first keyword the name CONTAINS -> its ledger. It is
 *                      then "Not in Tally" only when the company's ledgers are
 *                      known and do not hold it.
 *   ledger lines, GST  a keyword that IS the name -> its ledger
 *
 * ------------------------------------------------------------------
 * B2B AND B2C (entry.buyer) - read, not chosen
 * ------------------------------------------------------------------
 * A buyer GSTIN makes an entry B2B, none B2C - as GSTR-1 files them. B2C
 * entries fetched from GSTR-1 name no party (the portal has none), and the
 * B2C (small) ones are summaries - one per state and GST rate - with no
 * invoice number or date either (entry.isSummary). fillB2cEntry fills those
 * gaps with the view's B2C party ledger and summary date; an entry's own
 * party or date always wins. The summaries are marked sent by their one
 * empty invoice number, so they only go to Tally together.
 *
 * ------------------------------------------------------------------
 * THE SALES LEDGER (the row's Voucher_type)
 * ------------------------------------------------------------------
 * An entry WITH others_Ledger lines carries its own sales ledgers in them, and
 * the backend ignores Voucher_type. An entry with NONE is posted party Dr,
 * Voucher_type Cr for Voucher_amount_cr, plus its GST - so it needs a sales
 * ledger, and its taxable amount as that credit. (The old screen sent 0 there,
 * which Tally cannot balance.) The lists go to Tally as they came, empty
 * slabs and all; the backend skips those, and alone reads the sales /
 * discount / round off lines.
 */

import { SALES_BUYER_KIND } from '@/Constants/salesEntries'
import { mapPartyName, renamerOf } from '@/Modules/SalesEntries/shared/keywordMapping'
import { readLedgerList, readLines, renameLedgerList, text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'
import { rowKey } from '@/Modules/SalesEntries/shared/entryBatch'

const NOT_IN_TALLY = 'not in tally'

const TAX_LISTS = Object.freeze([
  ['CGST', 'cgst_ledger'],
  ['SGST', 'sgst_ledger'],
  ['IGST', 'igst_ledger'],
  ['UGST', 'ugst_ledger'],
])

export const readMultiEntry = (raw, { mapping, ledgerNames }) => {
  const rename = renamerOf(mapping)
  const fileParty = text(raw?.party_ledger)
  const mappedParty = mapPartyName(fileParty, mapping)
  const lists = Object.fromEntries(
    [...TAX_LISTS.map(([, field]) => field), 'others_Ledger'].map((field) => [field, readLedgerList(renameLedgerList(raw?.[field], rename))]),
  )
  const taxes = TAX_LISTS.flatMap(([tax, field]) => readLines(lists[field]).map((line) => ({ ...line, tax })))
  const invoiceNo = text(raw?.invoice_no)
  const buyer = text(raw?.gstin) ? SALES_BUYER_KIND.B2B : SALES_BUYER_KIND.B2C

  return {
    key: rowKey(raw),
    invoiceNo,
    buyer,
    isSummary: buyer === SALES_BUYER_KIND.B2C && !invoiceNo,
    invoiceDate: text(raw?.invoice_date),
    partyLedger: mappedParty || fileParty,
    mappedFrom: mappedParty ? fileParty : null,
    gstin: text(raw?.gstin),
    state: text(raw?.state),
    address: text(raw?.ledeger_address),
    total: toNumber(raw?.total),
    taxable: toNumber(raw?.taxable_amount),
    notInTally: mappedParty
      ? ledgerNames.size > 0 && !ledgerNames.has(mappedParty.toLowerCase())
      : text(raw?.tallyledger).toLowerCase() === NOT_IN_TALLY,
    lines: readLines(lists.others_Ledger),
    taxes,
    gstTotal: taxes.reduce((sum, line) => sum + line.amount, 0),
    // Read as the backend reads it: any others_Ledger item at all means the entry has its own lines.
    needsSalesLedger: lists.others_Ledger.length === 0,
    lists,
    raw: raw ?? {},
  }
}

/** Only the gaps are filled: the B2C party where the entry names none, the date on a summary without one. */
export const fillB2cEntry = (entry, { party, summaryDate }) => {
  if (entry.buyer !== SALES_BUYER_KIND.B2C) return entry
  const takesParty = !entry.partyLedger && Boolean(party)
  const takesDate = entry.isSummary && !entry.invoiceDate && Boolean(summaryDate)
  if (!takesParty && !takesDate) return entry
  return {
    ...entry,
    // Picked from the company's own ledgers, so it is in Tally.
    ...(takesParty ? { partyLedger: party, notInTally: false, partyFromB2c: true } : null),
    ...(takesDate ? { invoiceDate: summaryDate, dateFromSummary: true } : null),
  }
}

export const checkMultiEntry = (entry, salesLedger) => {
  if (!entry.invoiceNo && !entry.isSummary) return 'It has no invoice number.'
  if (!entry.invoiceDate) return entry.isSummary ? 'Choose the B2C summary date above.' : 'It has no invoice date.'
  if (!entry.partyLedger) return entry.buyer === SALES_BUYER_KIND.B2C ? 'Choose the B2C Party Ledger above.' : 'It has no party ledger.'
  if (entry.needsSalesLedger && !text(salesLedger)) return 'It has no ledger lines, so it needs a sales ledger.'
  return null
}

/**
 * One row of the message, under the names the agent and the backend's XML
 * builder read (tally_connector/sales_inventory_multi_ledger/). Its company
 * is the message's company_name, so the row carries none - and no
 * productdetails, this being the w/o Inventory kind.
 */
export const toMultiLedgerRow = (entry, salesLedger) => ({
  Voucher_date: entry.invoiceDate,
  ledgername: entry.partyLedger,
  Voucher_amount_dr: text(entry.raw.total),
  Voucher_amount_cr: entry.needsSalesLedger ? entry.taxable : 0,
  Narration: '',
  party_gstin: entry.gstin,
  cgst_ledger: entry.lists.cgst_ledger,
  sgst_ledger: entry.lists.sgst_ledger,
  igst_ledger: entry.lists.igst_ledger,
  ugst_ledger: entry.lists.ugst_ledger,
  others_Ledger: entry.lists.others_Ledger,
  Packageingdata: null,
  Packageingamount: '0.00',
  Insurancedata: null,
  Insuranceamount: '0.00',
  Frieghtdata: null,
  Frieghtamount: '0.00',
  Othersdata: null,
  Othersamount: '0.00',
  packaging_ledger: '',
  freight_ledger: '',
  insurance_ledger: '',
  others_ledger: '',
  discount_ledger: '',
  Voucher_type: text(salesLedger),
  Vouchetype: 'Sales',
  Vouchernumber: entry.invoiceNo,
  Roundoffdata: null,
  Roundoffamount: '0.00',
  // As the old screen and the agreed payload: the party's GSTIN goes in party_gstin.
  buyer_gstin: '',
  ledeger_address: entry.address,
  buyer_state: entry.state,
})

/** The voucher an entry becomes - the backend decides the final XML; this lays out what it is given. */
export const multiVoucherLines = (entry, salesLedger) => [
  { side: 'Dr', name: entry.partyLedger || '(no party ledger)', amount: entry.total, kind: 'Party' },
  ...(entry.needsSalesLedger
    ? [{ side: 'Cr', name: text(salesLedger) || '(choose a sales ledger)', amount: entry.taxable, kind: 'Sales ledger' }]
    : entry.lines.map((line) => ({ side: 'Cr', name: line.name, amount: line.amount, kind: 'Ledger line' }))),
  ...entry.taxes.map((line) => ({ side: 'Cr', name: line.name, amount: line.amount, kind: line.tax })),
]

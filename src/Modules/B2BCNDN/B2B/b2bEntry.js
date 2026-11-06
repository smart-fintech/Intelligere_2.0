/**
 * B2B - what one b2b_cndn_data/ row means, and what Tally and the backend are
 * sent for it. Plain functions: no React, no requests.
 *
 *   readB2BBatch(reply, context)          the batch's rows, ready to show
 *   checkB2BEntry(entry, purchaseLedger)  why it cannot go to Tally yet, or null
 *   toB2BTallyRow(entry, purchaseLedger)  one row of the b2b_data message
 *   toB2BSentRow(entry, purchaseLedger, companyId)   one row of the PUT that marks it sent
 *   b2bVoucherLines(entry, purchaseLedger)           the Dr / Cr lines it becomes
 *
 * One row is one GST rate of one invoice: the rows of an invoice (same GSTIN,
 * number and date) make ONE purchase voucher in Tally (tally_connector/b2b_data/),
 * so they are picked and sent together (`invoiceKey`).
 *
 * The ledgers, as the mapping gives them (shared/ledgerMapping):
 *   party     the row's ledgername, renamed by a party key - else as it came
 *   purchase  purchase_<interstate|local>_<rate>, then the older keys; a pick
 *             on screen goes over it
 *   GST       the old igst_/cgst_/sgst_ keys, else the name the backend found -
 *             each checked (shared/gstValidation): an entry with a wrong one
 *             cannot be sent
 */

import { B2B_CNDN_SOURCE } from '@/Constants/b2bCndn'
import { gstLinesOf } from '@/Modules/B2BCNDN/shared/gstValidation'
import { GST_TAX, mappedPurchaseLedger, mappedTaxLedger, partyRenamerOf, purchaseTypeOf } from '@/Modules/B2BCNDN/shared/ledgerMapping'
import { text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'

const whole = (value) => Math.max(0, Math.trunc(toNumber(value)))

/** { "<gstin>": ["Ledger A", "Ledger B"] } -> [{ gstin, names }] of GSTINs with several ledgers. */
export const readSimilarLedgers = (value) =>
  Object.entries(value && typeof value === 'object' ? value : {})
    .map(([gstin, names]) => ({
      gstin: text(gstin),
      names: (Array.isArray(names) ? names : []).map(text).filter(Boolean),
    }))
    .filter((item) => item.gstin && item.names.length > 1)

/**
 * `context`:
 *   mapping       the flat b2b mapping (flattenMapping)
 *   ledgerNames   Set of the company's ledger names, lower case - empty while loading
 */
export const readB2BEntry = (raw, matched, key, { mapping, ledgerNames }) => {
  const rename = partyRenamerOf(mapping)
  const ownParty = text(raw?.ledgername)
  const renamed = text(rename(ownParty))
  const party = renamed || ownParty
  const amounts = {
    igst: toNumber(raw?.igstLedgerAmount),
    cgst: toNumber(raw?.cgstLedgerAmount),
    sgst: toNumber(raw?.sgstLedgerAmount),
  }
  const rate = raw?.gst_rate
  const state = text(raw?.state)
  const placeOfSupply = text(raw?.place_of_supply)
  const purchaseType = purchaseTypeOf({ ...amounts, state, placeOfSupply })
  const taxNames = {
    igst: mappedTaxLedger(mapping, GST_TAX.IGST, {
      amount: amounts.igst,
      rate,
      own: raw?.igstLedgerName,
    }),
    cgst: mappedTaxLedger(mapping, GST_TAX.CGST, {
      amount: amounts.cgst,
      rate,
      own: raw?.cgstLedgerName,
    }),
    sgst: mappedTaxLedger(mapping, GST_TAX.SGST, {
      amount: amounts.sgst,
      rate,
      own: raw?.sgstLedgerName,
    }),
  }
  const gstRate = rate === null || rate === undefined ? '' : text(rate)
  const taxes = gstLinesOf({ amounts, taxNames, gstRate }, ledgerNames)
  const gstin = text(raw?.gst_number)
  const invoiceNo = text(raw?.Vouchernumber)
  const invoiceDate = text(raw?.Voucher_date)

  return {
    key,
    invoiceKey: [gstin, invoiceNo, invoiceDate].join('|'),
    matched,
    gstin,
    ownParty,
    party,
    mappedFrom: renamed && renamed !== ownParty ? ownParty : '',
    // Known only once the company's ledgers are in; until then, as the backend matched it.
    notInTally: ledgerNames.size > 0 ? !party || !ledgerNames.has(party.toLowerCase()) : !matched && !renamed,
    invoiceNo,
    invoiceDate,
    invoiceValue: toNumber(raw?.Voucher_amount_cr),
    taxable: toNumber(raw?.taxable_value),
    gstRate,
    amounts,
    taxNames,
    // Every GST line with its ledger checked (shared/gstValidation).
    taxes,
    gstIssues: taxes.filter((line) => line.issue),
    state,
    placeOfSupply,
    purchaseType,
    mappedPurchase: mappedPurchaseLedger(mapping, purchaseType, rate),
    raw: raw ?? {},
  }
}

/**
 * The batch's rows -> { entries, total, remaining, similar }. Matched rows first,
 * as the backend lists them. A row has no id, so its key is what the PUT finds
 * it by (GSTIN, invoice number, taxable value) plus its rate - and a count for
 * the rare row that repeats all of them.
 */
export const readB2BBatch = (reply, context) => {
  const seen = new Map()
  const keyOf = (raw) => {
    const base = [raw?.gst_number, raw?.Vouchernumber, raw?.taxable_value, raw?.gst_rate].map(text).join('|')
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}#${count}`
  }
  const list = (value, matched) =>
    (Array.isArray(value) ? value : [])
      .filter((raw) => raw && typeof raw === 'object' && 'Vouchernumber' in raw)
      .map((raw) => readB2BEntry(raw, matched, keyOf(raw), context))

  return {
    entries: [...list(reply?.matchedList, true), ...list(reply?.unMatchedList, false)],
    total: whole(reply?.total_len),
    remaining: whole(reply?.Remaining),
    similar: readSimilarLedgers(reply?.['similar_ledger_GSTNO.']),
  }
}

export const purchaseTypeText = (type) => (type === 'interstate' ? 'Interstate' : type === 'local' ? 'Local' : 'Type unknown')

export const checkB2BEntry = (entry, purchaseLedger) => {
  if (!entry.invoiceNo) return 'It has no invoice number.'
  if (!entry.invoiceDate) return 'It has no invoice date.'
  if (!entry.party) return 'It needs a party ledger.'
  if (!text(purchaseLedger)) return `No purchase ledger is mapped for ${purchaseTypeText(entry.purchaseType).toLowerCase()} ${entry.gstRate || 0}%.`
  if (entry.gstIssues.length > 0) return `GST ledger: ${entry.gstIssues.map((line) => line.issue).join(' · ')}.`
  return null
}

/** The agreed b2b_data row (EXE_intelligere.py b2b_data -> tally_connector/b2b_data/). */
export const toB2BTallyRow = (entry, purchaseLedger) => ({
  gst_number: entry.gstin,
  ledger_name: entry.party,
  Vouchernumber: entry.invoiceNo,
  invoice_type: text(entry.raw.invoice_type),
  Voucher_date: entry.invoiceDate,
  Voucher_amount_cr: entry.raw.Voucher_amount_cr,
  Voucher_amount_dr: entry.raw.Voucher_amount_dr,
  taxable_value: entry.raw.taxable_value,
  igstLedgerAmount: entry.amounts.igst,
  cgstLedgerAmount: entry.amounts.cgst,
  sgstLedgerAmount: entry.amounts.sgst,
  igstLedgerName: entry.taxNames.igst,
  cgstLedgerName: entry.taxNames.cgst,
  sgstLedgerName: entry.taxNames.sgst,
  cess: entry.raw.cess ?? 0,
  Voucher_type: text(entry.raw.Voucher_type) || 'Purchase',
  state: entry.state,
  place_of_supply: entry.placeOfSupply,
  gst_rate: entry.raw.gst_rate,
  purchaseLedgerName: text(purchaseLedger),
})

/** The PUT row - these names, this capitalization: the backend finds the row by them. */
export const toB2BSentRow = (entry, purchaseLedger, companyId) => ({
  company_id: companyId,
  gst_number: entry.gstin,
  Vouchernumber: entry.invoiceNo,
  taxable_value: entry.raw.taxable_value,
  source: B2B_CNDN_SOURCE.B2B,
  purchaseLedgerName: text(purchaseLedger),
})

export const b2bVoucherLines = (entry, purchaseLedger) => [
  {
    side: 'Dr',
    name: text(purchaseLedger) || '(no purchase ledger)',
    amount: entry.taxable,
    kind: 'Purchase',
  },
  ...entry.taxes.map((line) => ({
    side: 'Dr',
    name: line.name || `(no ${line.tax} ledger)`,
    amount: line.amount,
    kind: line.tax,
  })),
  // This row's share of the invoice, as Tally adds the rows of one invoice up.
  {
    side: 'Cr',
    name: entry.party || '(no party ledger)',
    amount: entry.taxable + entry.taxes.reduce((sum, line) => sum + line.amount, 0),
    kind: 'Party',
  },
]

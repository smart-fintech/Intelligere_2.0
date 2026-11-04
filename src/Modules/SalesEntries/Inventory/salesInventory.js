/**
 * WITH INVENTORY - what one get_inventory_data/ invoice means, and what Tally
 * is sent for it. Plain functions: no React, no requests.
 *
 *   readInventoryInvoice(raw, { mapping })     the invoice and its products, ready to show
 *   checkInventoryInvoice(invoice, picks)      why it cannot go to Tally yet, or null
 *   toInventoryTallyRow(invoice, picks)        one row of the sales_with_inventory message
 *   inventoryVoucherLines(invoice, picks)      the Dr / Cr lines it becomes
 *
 *   picks = { salesLedger, stockNameOf(product), chargeLedgerOf(charge) }
 *
 * ------------------------------------------------------------------
 * HOW THE BACKEND BUILDS THE VOUCHER (tally_connector/sales_with_inventory/)
 * ------------------------------------------------------------------
 *   party          Dr Voucher_amount_dr (the invoice total)
 *   each product   a stock item line under its `Products` name, posted to the
 *                  Voucher_type (sales) ledger for its Amount
 *   charges        packaging / freight / insurance / others: Cr their amount
 *                  under their ledger, only when the amount is not 0
 *   GST            the KEYS of every product's CGST/SGST/IGST/UGST JSON are the
 *                  ledgers, their amounts added up per ledger
 *   discount       Dr under discount_ledger - and LEFT OUT when there is no
 *                  ledger, which would not balance. So a charge or discount
 *                  with an amount needs its ledger before the invoice can go.
 * The invoice's own cgst/sgst/igst/ugst_ledger text and Voucher_amount_cr are
 * not read there; they are sent as the old screen sent them.
 *
 * Keyword mapping (source with_inventory, the old rule): a product's GST
 * ledger that IS a keyword is renamed to the mapped ledger.
 */

import { renamerOf } from '@/Modules/SalesEntries/shared/keywordMapping'
import { readTaxLines, renameTaxJson, sumByName, text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'
import { rowKey } from '@/Modules/SalesEntries/shared/entryBatch'

const NOT_IN_TALLY = 'not in tally'
const TAXES = Object.freeze(['CGST', 'SGST', 'IGST', 'UGST'])

/** The invoice's charges, as the API names their amount and ledger. Discount is posted Dr, the rest Cr. */
export const CHARGES = Object.freeze([
  { key: 'packaging', label: 'Packaging', amountField: 'packaging_amount', ledgerField: 'packaging_ledger' },
  { key: 'freight', label: 'Freight', amountField: 'freight_amount', ledgerField: 'freight_ledger' },
  { key: 'insurance', label: 'Insurance', amountField: 'insurance_amount', ledgerField: 'insurance_ledger' },
  { key: 'others', label: 'Others', amountField: 'others_amount', ledgerField: 'others_ledger' },
  { key: 'discount', label: 'Discount', amountField: 'discount_amount', ledgerField: 'discount_ledger' },
])

const round2 = (value) => Math.round(value * 100) / 100

const readProduct = (product, index, invoiceKey, rename) => {
  const raw = product && typeof product === 'object' ? product : {}
  const tax = Object.fromEntries(TAXES.map((name) => [name, renameTaxJson(raw[name], rename)]))
  return {
    key: text(raw.id) || `${invoiceKey}-${index}`,
    name: text(raw.Products),
    hsn: text(raw.HSN_SAC),
    gstRate: text(raw.GST_rate),
    quantity: toNumber(raw.quantity),
    rate: toNumber(raw.Rate),
    discount: toNumber(raw.Discount),
    amount: toNumber(raw.Amount),
    tax,
    taxes: TAXES.flatMap((name) => readTaxLines(tax[name]).map((line) => ({ ...line, tax: name }))),
    raw,
  }
}

export const readInventoryInvoice = (raw, { mapping }) => {
  const rename = renamerOf(mapping)
  const key = rowKey(raw)
  const products = (Array.isArray(raw?.products) ? raw.products : []).map((product, index) => readProduct(product, index, key, rename))
  return {
    key,
    invoiceNo: text(raw?.invoice_no),
    invoiceDate: text(raw?.invoice_date),
    partyLedger: text(raw?.ledgername),
    gstin: text(raw?.gstno),
    state: text(raw?.state),
    address: text(raw?.ledeger_address),
    total: toNumber(raw?.total),
    ownSalesLedger: text(raw?.purchaseLedger),
    notInTally: text(raw?.tallyledger).toLowerCase() === NOT_IN_TALLY,
    products,
    taxable: round2(products.reduce((sum, product) => sum + product.amount, 0)),
    gstLines: sumByName(products.flatMap((product) => product.taxes)),
    charges: CHARGES.map((charge) => ({ ...charge, amount: toNumber(raw?.[charge.amountField]), own: text(raw?.[charge.ledgerField]) })),
    raw: raw ?? {},
  }
}

/** The charges an invoice actually has - an amount that is not 0. */
export const chargesOf = (invoice) => invoice.charges.filter((charge) => charge.amount !== 0)

export const checkInventoryInvoice = (invoice, { salesLedger, stockNameOf, chargeLedgerOf }) => {
  if (!invoice.invoiceNo) return 'It has no invoice number.'
  if (!invoice.invoiceDate) return 'It has no invoice date.'
  if (!invoice.partyLedger) return 'It has no party ledger.'
  if (invoice.products.length === 0) return 'It has no products.'
  if (!text(salesLedger)) return 'It needs a sales ledger.'
  const unmatched = invoice.products.find((product) => !stockNameOf(product))
  if (unmatched) return `Product "${unmatched.name || unmatched.hsn}" is not a stock item yet.`
  const charge = chargesOf(invoice).find((item) => !text(chargeLedgerOf(item)))
  if (charge) return `It has a ${charge.label.toLowerCase()} amount - choose the ${charge.label.toLowerCase()} ledger.`
  return null
}

/**
 * One row of the message, under the names the agent and the backend read.
 * Its company is the message's company_name, so the row carries none.
 */
export const toInventoryTallyRow = (invoice, { salesLedger, stockNameOf, chargeLedgerOf }) => {
  const { raw } = invoice
  const charge = Object.fromEntries(invoice.charges.map((item) => [item.key, item]))
  const chargeFields = Object.fromEntries(
    invoice.charges.flatMap((item) => [
      [item.amountField, raw[item.amountField] ?? 0],
      [item.ledgerField, text(chargeLedgerOf(charge[item.key]))],
    ]),
  )
  return {
    Voucher_date: invoice.invoiceDate,
    ledgername: invoice.partyLedger,
    Voucher_amount_dr: text(raw.total),
    // As the old screen: the products' rates added up (the backend does not read it).
    Voucher_amount_cr: round2(invoice.products.reduce((sum, product) => sum + product.rate, 0)),
    Narration: '',
    party_gstin: text(raw.gstin),
    cgst_ledger: raw.cgst_ledger ?? '',
    sgst_ledger: raw.sgst_ledger ?? '',
    igst_ledger: raw.igst_ledger ?? '',
    ugst_ledger: raw.ugst_ledger ?? '',
    others_Ledger: '',
    Packageingdata: null,
    Packageingamount: '0.00',
    Insurancedata: null,
    Insuranceamount: '0.00',
    Frieghtdata: null,
    Frieghtamount: '0.00',
    Othersdata: null,
    Othersamount: '0.00',
    ...chargeFields,
    Voucher_type: text(salesLedger),
    Vouchetype: 'Sales',
    Vouchernumber: invoice.invoiceNo,
    Roundoffdata: null,
    Roundoffamount: '0.00',
    buyer_gstin: invoice.gstin,
    ledeger_address: invoice.address,
    buyer_state: invoice.state,
    productdetails: invoice.products.map((product) => ({
      Invoice_data: product.raw.Invoice_data ?? '',
      Products: stockNameOf(product) || product.name,
      quantity: product.raw.quantity ?? '',
      Discount: product.raw.Discount ?? '',
      HSN_details: null,
      Amount: product.raw.Amount ?? '',
      CGST: product.tax.CGST || '',
      SGST: product.tax.SGST || '',
      IGST: product.tax.IGST || '',
      UGST: product.tax.UGST || '',
      Hsn_code: product.hsn,
      Rate: product.raw.Rate ?? '',
      Per: null,
    })),
  }
}

export const inventoryVoucherLines = (invoice, { salesLedger, stockNameOf, chargeLedgerOf }) => {
  const sales = text(salesLedger) || '(choose a sales ledger)'
  return [
    { side: 'Dr', name: invoice.partyLedger || '(no party ledger)', amount: invoice.total, kind: 'Party' },
    ...invoice.products.map((product) => ({
      side: 'Cr',
      name: `${sales} · ${stockNameOf(product) || `${product.name} (no stock item)`}`,
      amount: product.amount,
      kind: 'Product',
    })),
    ...chargesOf(invoice).map((item) => ({
      side: item.key === 'discount' ? 'Dr' : 'Cr',
      name: text(chargeLedgerOf(item)) || `(choose the ${item.label.toLowerCase()} ledger)`,
      amount: item.amount,
      kind: item.label,
    })),
    ...invoice.gstLines.map((line) => ({ side: 'Cr', name: line.name, amount: line.amount, kind: 'GST' })),
  ]
}

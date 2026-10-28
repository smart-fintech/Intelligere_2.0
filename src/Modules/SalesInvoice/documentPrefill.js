/**
 * A SAVED DOCUMENT, BACK IN THE FORM - for Edit in History, and for Prefill From.
 *
 *   formFromSavedDocument(record, { createForm, company, parties, ledgers, products, banks, countries })
 *   formPrefilledFrom(record, form, { ...the same })   Prefill From: see below
 *   lineFromSavedProduct(row, { ledgers, products })   one product_data row as a line
 *
 * `record` is one row of invoice/business-document-history/ as the server
 * sent it. Its fields are read under the names the document was saved with
 * (buildBusinessDocumentPayload) - the payload, read back:
 *
 *   document_type              the form's document type
 *   buyer_id / buyer_details   the LEDGER side (a sale's buyer, a purchase's
 *                              supplier - `parties.ledger`)
 *   the company side           the company itself, as it is now (a sale's
 *                              seller, a purchase's buyer) - it IS the company,
 *                              and Next saves that side back to the company
 *                              record, so an old copy must never stand in for it
 *   ship_to / dispatch_from    Shipping To / Dispatched From - "Same as ..."
 *                              when sameAsBuyer / sameAsSeller say so, or when
 *                              the card holds its party's own address
 *   invoice_master_details     the Document Details (and rcm -> Reverse Charge)
 *   bank_id                    Select Bank, and that bank's Payment QR
 *   product_data               the lines: a product found in the product list
 *                              by name (and SKU code), a service by its
 *                              ledger's name - with the saved HSN/SAC,
 *                              quantity, rate, unit, discount, GST and
 *                              description
 *   other_details              Other Charges (source "Other Charges"),
 *                              discount, tcs, "round off" - each by its
 *                              ledger's name - and the note
 *
 * JSON sent as text is read too. A field the record does not have, or that
 * names a product or ledger no longer in the lists, is left empty - never
 * guessed, never taken from the current defaults - and the form's own checks
 * then say what is missing. gst_charges is not read: it is worked out again
 * from the lines, by the same rule that saved it.
 */

import { GST_RATES } from '@/Constants/gst'
import { DEFAULT_SUPPLY, DEFAULT_SUPPLY_TYPE, DOCUMENT_TYPE_INVOICE } from '@/Constants/salesInvoice'
import {
  LINE_KIND,
  buyerFromLedger,
  lineFromExistingProduct,
  lineFromServiceLedger,
  newChargeRow,
  newInvoiceLine,
  rateText,
  textOf,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { OTHER_CHARGES_SOURCE, SERVICE_PRODUCT_TYPE, paymentQrOfBank } from '@/Services/salesInvoiceService'
import { toInputDate } from '@/Utils/date'

/* ------------------------------------------------------------------ */
/* Reading what the server sent                                       */
/* ------------------------------------------------------------------ */

/** An object the API may send as JSON text - read either way; {} for anything else. */
const objectOf = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** A list the API may send as JSON text - [] for anything else. */
const listOf = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** A yes/no sent as true, "true", 1 ... - null when it was not sent at all. */
const flagOrNull = (value) => {
  if (value === undefined || value === null || textOf(value) === '') return null
  return value === true || value === 1 || ['true', '1', 'yes'].includes(textOf(value).toLowerCase())
}

const sameText = (a, b) => textOf(a).toLowerCase() === textOf(b).toLowerCase()

/** "19/10/2026" (the payload's dates) or an ISO date, as a date input holds it - '' for none. */
export const inputDateOf = (value) => {
  const raw = textOf(value)
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return raw ? toInputDate(raw) || '' : ''
}

/** A number the payload sent, as the form's text ("" for none). */
const numberText = (value) => (value === null || value === undefined ? '' : textOf(value))

/** The GST slab a line or charge was taxed at, from its saved rates - IGST's, or CGST + SGST - as the slab list writes it. */
const slabOfSaved = (row) => {
  const igst = Number(row?.igst)
  const split = Number(row?.cgst) + Number(row?.sgst)
  const rate = row?.igst !== null && row?.igst !== undefined && Number.isFinite(igst) ? igst : Number.isFinite(split) ? split : null
  if (rate === null) return ''
  return GST_RATES.find((slab) => Number(slab) === Number(rateText(rate))) ?? ''
}

/** The one { ledger name: amount } entry of a discount / tcs / round off section. */
const ledgerEntryOf = (section) => {
  const [name, amount] = Object.entries(objectOf(section))[0] ?? []
  return name ? { name, amount } : null
}

/* ------------------------------------------------------------------ */
/* Addresses                                                          */
/* ------------------------------------------------------------------ */

const ADDRESS_FIELDS = ['name', 'gstin', 'state', 'address', 'pincode']

/** A ship_to / dispatch_from as a card holds it. */
const cardOf = (saved) => {
  const value = objectOf(saved)
  return {
    name: textOf(value.name),
    gstin: textOf(value.gstin).toUpperCase(),
    state: textOf(value.state ?? value.statename),
    address: textOf(value.address),
    pincode: numberText(value.pincode),
  }
}

/** Whether a saved card is its party's own address (or empty) - "Same as ..." when the record does not say. */
const isPartysOwn = (card, party) =>
  ADDRESS_FIELDS.every((field) => !card[field]) || ADDRESS_FIELDS.every((field) => sameText(card[field], party?.[field]))

/* ------------------------------------------------------------------ */
/* The form                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param record     one history row, as sent
 * @param createForm the module's new-form maker (createInvoiceForm / createPurchaseForm)
 * @param company    the active company's record
 * @param parties    { company: 'seller' | 'buyer', ledger: 'buyer' | 'seller' }
 * @param ledgers    { byId, named } - useInvoiceReferenceData's
 * @param products   the product list (readProducts)
 * @param banks      the bank records
 * @param countries  { countryNames, stateNamesOf } - for the ledger party's country / state
 */
export const formFromSavedDocument = (record, { createForm, company, parties, ledgers, products, banks, countries }) => {
  const base = createForm(company)
  const master = objectOf(record.invoice_master_details)
  const ledgerIdByName = (name) => ledgers.named.find((ledger) => sameText(ledger.name, name))?.id ?? ''

  /* ---- the parties ---- */
  const ledgerId = textOf(record.buyer_id)
  const savedLedger = objectOf(record.buyer_details)
  const ledger = ledgers.byId.get(ledgerId) ?? (Object.keys(savedLedger).length ? savedLedger : null)
  const ledgerParty = ledger ? buyerFromLedger(ledger, ledgerId, countries) : { ...base[parties.ledger], ledgerId }
  const seller = parties.ledger === 'seller' ? ledgerParty : base.seller
  const buyer = parties.ledger === 'buyer' ? ledgerParty : base.buyer

  const shipping = cardOf(record.ship_to)
  const dispatch = cardOf(record.dispatch_from)
  const shippingSameAsBuyer = flagOrNull(record.sameAsBuyer) ?? isPartysOwn(shipping, buyer)
  const dispatchSameAsSeller = flagOrNull(record.sameAsSeller) ?? isPartysOwn(dispatch, seller)

  /* ---- Document Details ---- */
  const parts = [master.document_no_f, master.document_no_s, master.document_no_t].map(numberText)
  const autoIncrement = parts.some(Boolean)
  const bankId = textOf(record.bank_id)
  const bank = bankId ? (banks.find((entry) => String(entry.id) === bankId) ?? null) : null
  const document = {
    ...base.document,
    autoIncrement,
    invoiceNo: textOf(master.document_no ?? record.document_no),
    invoiceNoParts: autoIncrement ? parts : ['', '', ''],
    invoiceDate: inputDateOf(master.document_date ?? record.document_date),
    termsOfPayment: textOf(master.terms_of_payment),
    referenceNo: textOf(master.reference_no),
    referenceDate: inputDateOf(master.reference_date),
    challanInvoiceNo: textOf(master.invoice_no),
    challanInvoiceDate: inputDateOf(master.invoice_date),
    challanType: textOf(master.challan_type),
    poNo: textOf(master.po_no),
    poDate: inputDateOf(master.po_date),
    deliveryNote: textOf(master.delivery_note),
    deliveryNoteDate: inputDateOf(master.delivery_note_date),
    transportReason: textOf(master.reason_for_transportation),
    transporter: textOf(master.delivery_transporter),
    transporterId: textOf(master.transporter_id),
    freightTerms: textOf(master.freight_terms_of_payment),
    lrNo: textOf(master.lr_rr_no),
    lrDate: inputDateOf(master.lr_rr_date),
    vehicleNo: textOf(master.delivery_vehicle_no),
    distance: numberText(master.distance),
    deliveryMode: textOf(master.delivery_mode),
    supply: textOf(master.supply) || DEFAULT_SUPPLY,
    supplyType: textOf(master.supply_type) || DEFAULT_SUPPLY_TYPE,
    bankId,
    paymentQr: paymentQrOfBank(bank),
  }

  /* ---- the lines ---- */
  const lines = listOf(record.product_data).map((row) => lineFromSavedProduct(row, { ledgers, products }))

  /* ---- Other Details ---- */
  const other = objectOf(record.other_details)
  const charges = []
  let discount = base.discount
  let tcs = base.tcs
  let roundOff = base.roundOff
  let note = ''
  Object.entries(other).forEach(([key, value]) => {
    if (key === 'note') note = textOf(value)
    else if (key === 'discount') {
      const entry = ledgerEntryOf(value)
      if (entry) discount = { ledgerId: ledgerIdByName(entry.name), amount: numberText(entry.amount) }
    } else if (key === 'tcs') {
      const entry = ledgerEntryOf(value)
      if (entry) tcs = { ledgerId: ledgerIdByName(entry.name), amount: numberText(entry.amount) }
    } else if (key === 'round off') {
      const entry = ledgerEntryOf(value)
      if (entry) roundOff = { ledgerId: ledgerIdByName(entry.name) }
    } else if (value && typeof value === 'object' && (value.source === OTHER_CHARGES_SOURCE || 'amount' in value)) {
      charges.push({ ...newChargeRow(), ledgerId: ledgerIdByName(key), amount: numberText(value.amount), gstRate: slabOfSaved(value) })
    }
  })

  // A document saved before the type was named "Sales Invoice".
  const documentType = sameText(record.document_type, 'Invoice') ? DOCUMENT_TYPE_INVOICE : textOf(record.document_type) || base.documentType

  return {
    ...base,
    documentType,
    seller,
    buyer,
    settings: { ...base.settings, reverseCharge: flagOrNull(master.rcm) ?? false },
    dispatchSameAsSeller,
    dispatch: dispatchSameAsSeller ? base.dispatch : dispatch,
    shippingSameAsBuyer,
    shipping: shippingSameAsBuyer ? base.shipping : shipping,
    document,
    withDiscount: lines.some((line) => Number(line.discount) > 0),
    lines,
    charges,
    discount,
    roundOff,
    tcs,
    note,
  }
}

/**
 * ONE SAVED PRODUCT ROW AS A LINE - a product_data row (or an order's product,
 * which comes in the same shape): a product found in the product list by name
 * (and SKU code), a service by its ledger's name - with the row's HSN/SAC,
 * quantity, rate, unit, discount, GST slab and description. A product no
 * longer in the list leaves the line without one (its own check says so).
 *
 * A row saved from an order (ref_doc_no - see the order products) keeps that
 * link as the line's `order`: { documentNo, documentId, referenceNo }, with
 * no remaining quantity (none is known once saved).
 */
export const lineFromSavedProduct = (row, { ledgers, products }) => {
  const service = sameText(row.product_type, SERVICE_PRODUCT_TYPE)
  const name = textOf(row['Product Name'])
  let line
  if (service) {
    const id = ledgers.named.find((ledger) => sameText(ledger.name, name))?.id ?? ''
    line = lineFromServiceLedger(newInvoiceLine(LINE_KIND.SERVICE), ledgers.byId.get(id) ?? null, id)
  } else {
    line = lineFromExistingProduct(newInvoiceLine(LINE_KIND.PRODUCT), row, products) ?? newInvoiceLine(LINE_KIND.PRODUCT)
  }
  const saved = (value, fallback) => (textOf(value) ? textOf(value) : fallback)
  const next = {
    ...line,
    hsn: saved(row.hsn_sac_code, line.hsn),
    gstRate: slabOfSaved(row) || line.gstRate,
    quantity: numberText(row.Quantity),
    rate: saved(row['Selling Rate'], line.rate),
    per: service ? '' : saved(row['Per Unit'], line.per),
    discount: Number(row.discount) > 0 ? numberText(row.discount) : '',
    description: textOf(row.Description),
  }
  if (!textOf(row.ref_doc_no)) return next
  return {
    ...next,
    order: {
      documentNo: textOf(row.ref_doc_no),
      documentId: row.document_id ?? null,
      referenceNo: textOf(row.reference_no),
      remainQty: null,
      key: `saved:${textOf(row.ref_doc_no)}|${name}|${textOf(row.sku_code)}`,
      itemKey: service ? line.ledgerId : line.productKey,
    },
  }
}

/**
 * PREFILL FROM - the form filled in from another saved document (`record`,
 * as invoice/prefill-document-details/ sends it), read exactly as Edit reads
 * one (formFromSavedDocument), but still the NEW document `form` is:
 *
 *   kept from `form`     the document type, its number (and the auto-number
 *                        parts) and date, the company side (the company as
 *                        it is now) and the company's settings
 *   from the record      the ledger party, Shipping To / Dispatched From, the
 *                        other Document Details, the bank, the lines, Other
 *                        Charges, discount, TCS, round off, the note - and
 *                        Reverse Charge
 *
 * Whatever the form held before is replaced, never added to - no line or
 * charge is doubled. A source line's own order link (`order`) is not taken:
 * it was that document's, not the new one's.
 */
export const formPrefilledFrom = (record, form, options) => {
  const source = formFromSavedDocument(record, options)
  const { parties } = options
  return {
    ...source,
    lines: source.lines.map((line) => ({ ...line, order: null })),
    documentType: form.documentType,
    [parties.company]: form[parties.company],
    settings: { ...form.settings, reverseCharge: source.settings.reverseCharge },
    document: {
      ...source.document,
      autoIncrement: form.document.autoIncrement,
      invoiceNo: form.document.invoiceNo,
      invoiceNoParts: form.document.invoiceNoParts,
      invoiceDate: form.document.invoiceDate,
    },
  }
}

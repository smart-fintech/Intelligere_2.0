/**
 * THE SALES INVOICE - who may make one, and saving it.
 *
 * Every Sales Invoice URL in the project is written here and nowhere else.
 * Nothing in this file shows a message: the shared axios setup
 * (Services/authService) has already turned a failure into a plain Error
 * carrying the backend's own text, so the screen writes one `catch` and shows
 * `error.message`.
 *
 * ------------------------------------------------------------------
 * WHO MAY MAKE ONE - tally/user-companies-list/, already in the store
 * ------------------------------------------------------------------
 *   active_modules    must list "Sales Invoice" (the module's key in
 *                     Constants/dashboardModules) for the module to open
 *   premium_modules   each document type but Invoice must be listed in it
 *                     (Constants/salesInvoice, DOCUMENT_TYPES)
 *
 * For a sub user the record is the one their account was given in that
 * company, so the same two checks hold them to what they were handed.
 *
 * ------------------------------------------------------------------
 * WHILE THE FORM IS FILLED IN
 * ------------------------------------------------------------------
 *   PUT    tally/user-companies-list/       Seller step -> the company     (updateCompany)
 *   PUT    tally/create-ledger/             Buyer step -> the buyer ledger (updateLedger, with ledger_obj_id)
 *   POST   invoice/last-document-number/    numbering defaults, per document type
 *   POST   invoice/document-mapping/        { company_id } -> the GST ledger mappings (Sales Invoice only)
 *   POST   invoice/document-mapping/        { company_id, ledger_mapping: {...} } -> add one
 *   DELETE invoice/document-mapping/        remove one
 *   POST   invoice/unique-products/         the buyer's earlier products
 *
 * ------------------------------------------------------------------
 * HISTORY
 * ------------------------------------------------------------------
 *   POST   invoice/business-document-history/   saved documents, by type and financial year
 *   POST   invoice/document-delete/             remove one
 *   POST   tally/voucher-list/                  the Tally voucher types a fetch can ask for
 *   WS     tally_invoice_fetch                  fetch documents from Tally (the app's WebSocket)
 *
 * ------------------------------------------------------------------
 * SAVING - TWO CALLS, in this order
 * ------------------------------------------------------------------
 *   1. POST invoice/business-documents/   multipart   the document
 *        -> { "document_id": 1, "msg": "Document saved" }
 *   2. POST invoice/save-document-pdf/    multipart   { id: document_id, file: <the PDF> }
 *
 * The PDF in between is made from the live preview's sheets by the module's
 * PDF engine (Modules/SalesInvoice/Document/invoicePdf) - the screen runs that
 * step, and the bytes it returns are exactly what is uploaded.
 *
 * Both bodies are FormData. As everywhere else in the app (ledger and product
 * CSV imports), `Content-Type: multipart/form-data` is named for the call:
 * the shared instance's JSON default would otherwise make axios turn the
 * FormData into JSON, and axios hands the browser the real boundary itself.
 */

import { ENV } from '@/Config/env'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_CHALLAN } from '@/Constants/salesInvoice'
import { getEmail } from '@/Library/secureStorage'
import { hasActiveModule, listsModule } from '@/Services/accessService'
import { api } from '@/Services/authService'
import { updateCompany } from '@/Services/companyService'
import { getLedgerId, updateLedger } from '@/Services/ledgerService'
import { changesProducts } from '@/Services/productCache'
import { toInputDate } from '@/Utils/date'
import { gstChargesByLedger } from '@/Utils/gstLedgers'

const BUSINESS_DOCUMENT_URL = 'invoice/business-documents/'
const DOCUMENT_PDF_URL = 'invoice/save-document-pdf/'

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

/* ------------------------------------------------------------------ */
/* Access                                                             */
/* ------------------------------------------------------------------ */

/** The module's entry in `active_modules` - its key in Constants/dashboardModules. */
export const SALES_INVOICE_MODULE = 'Sales Invoice'

/** Whether the company's `active_modules` lists the Sales Invoice module (Services/accessService). */
export const hasSalesInvoiceModule = (company) => hasActiveModule(company, SALES_INVOICE_MODULE)

/**
 * Every document type, with whether this company may make it:
 *
 *   [{ ...the DOCUMENT_TYPES entry, enabled }]
 *
 * Invoice is the module itself and is enabled with it; every other type
 * only when `premium_modules` lists it.
 */
export const getDocumentTypeAccess = (company) =>
  DOCUMENT_TYPES.map((type) => ({
    ...type,
    enabled: hasSalesInvoiceModule(company) && (!type.premium || listsModule(company?.premium_modules, type.premiumNames)),
  }))

/* ------------------------------------------------------------------ */
/* Value shapes the payload uses                                      */
/* ------------------------------------------------------------------ */

/** '' for nothing, otherwise trimmed text. */
const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** A date input's YYYY-MM-DD as DD/MM/YYYY, the payload's date format - '' for none. */
export const toDocumentDate = (value) => {
  const iso = toInputDate(value)
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** Paise as rupees, a number to two places. */
const rupees = (paise) => Math.round(paise || 0) / 100

/**
 * A code the payload carries as a number (pincode 605001, statecode 34,
 * document_no_s 34, distance 30) - as a number when it is one, null when
 * empty. A value with a leading zero (HSN "0101") stays text, since as a
 * number it would lose the zero.
 */
const numberOrNull = (value) => {
  const raw = text(value)
  if (!raw) return null
  if (/^0\d/.test(raw)) return raw
  const number = Number(raw)
  return Number.isFinite(number) ? number : raw
}

/** A tax rate as product_data writes it ("3.00"), or null when that tax does not apply. */
const rateString = (applies, rate) => (applies ? Number(rate || 0).toFixed(2) : null)

/* ------------------------------------------------------------------ */
/* The document payload                                               */
/* ------------------------------------------------------------------ */

/** product_data's `product_type` for a service line (a ledger) - a product line keeps "Product". */
export const SERVICE_PRODUCT_TYPE = 'Service'

/** Marks a row of other_details as one added in the Other Charges section. */
export const OTHER_CHARGES_SOURCE = 'Other Charges'

/** The tax a line or charge carries, as product_data / other_details write it. */
const taxFields = (figures, interState, rate) => ({
  cgst: interState ? null : rate(figures.cgst),
  sgst: interState ? null : rate(figures.sgst),
  igst: interState ? rate(figures.igst) : null,
  cgst_amount: interState ? null : rupees(figures.cgstPaise),
  sgst_amount: interState ? null : rupees(figures.sgstPaise),
  igst_amount: interState ? rupees(figures.igstPaise) : null,
})

/**
 * POST invoice/business-documents/ - every field as the backend names it:
 *
 *   seller_id, buyer_id, bank_id, created_by, document_type,
 *   total_amount, total_taxable_amount             plain values
 *   prefill_from, ship_to, dispatch_from, invoice_master_details,
 *   product_data, other_details, gst_charges       JSON text
 *
 * Returned as a plain object (the JSON already stringified) so it can be read
 * and checked; toFormData makes the body of it.
 *
 *   total_amount           the invoice total: taxable value + other charges +
 *                          GST - discount + TCS + round off (invoiceFigures)
 *   total_taxable_amount   the product lines' taxable value, before tax
 *   prefill_from           {} - a document made here is not prefilled from
 *                          another one
 */
export const buildBusinessDocumentPayload = (request) => {
  const { document, figures, interState } = request

  const shipTo = {
    name: text(request.shipping.name),
    gstin: text(request.shipping.gstin).toUpperCase(),
    statename: text(request.shipping.state),
    pincode: numberOrNull(request.shipping.pincode),
    statecode: numberOrNull(request.shipping.stateCode),
    address: text(request.shipping.address),
  }

  const dispatchFrom = {
    name: text(request.dispatch.name),
    gstin: text(request.dispatch.gstin).toUpperCase(),
    state: text(request.dispatch.state),
    statecode: numberOrNull(request.dispatch.stateCode),
    pincode: numberOrNull(request.dispatch.pincode),
    address: text(request.dispatch.address),
  }

  const [first, second, third] = document.autoIncrement ? document.invoiceNoParts.map(text) : ['', '', '']

  // A CHALLAN carries goods, not money: its lines without rates, amounts or
  // taxes, no other_details and no gst_charges, totals of 0. Everything else
  // is the document as any other type sends it.
  const challan = request.documentType === DOCUMENT_TYPE_CHALLAN

  const masterDetails = {
    document_no: request.invoiceNo,
    document_date: toDocumentDate(document.invoiceDate),
    document_no_f: first,
    document_no_s: numberOrNull(second) ?? '',
    document_no_t: third,
    supply: text(document.supply),
    supply_type: text(document.supplyType),
    terms_of_payment: text(document.termsOfPayment),
    reference_no: text(document.referenceNo),
    reference_date: toDocumentDate(document.referenceDate),
    po_no: text(document.poNo),
    po_date: toDocumentDate(document.poDate),
    delivery_note: text(document.deliveryNote),
    delivery_note_date: toDocumentDate(document.deliveryNoteDate),
    reason_for_transportation: text(document.transportReason),
    delivery_transporter: text(document.transporter),
    transporter_id: text(document.transporterId),
    freight_terms_of_payment: text(document.freightTerms),
    lr_rr_no: text(document.lrNo),
    lr_rr_date: toDocumentDate(document.lrDate),
    delivery_vehicle_no: text(document.vehicleNo).toUpperCase(),
    distance: numberOrNull(document.distance),
    delivery_mode: text(document.deliveryMode),
    rcm: challan ? false : request.reverseCharge,
    // A challan's own details - only on a challan, under the names the
    // earlier challan screens gave them (challan_type) or, new, beside
    // document_no / reference_no (invoice_no, invoice_date).
    ...(challan
      ? {
          invoice_no: text(document.challanInvoiceNo),
          invoice_date: toDocumentDate(document.challanInvoiceDate),
          challan_type: text(document.challanType),
        }
      : null),
  }

  // A product line as it always was. A service line (a ledger) has the same
  // fields under the same names, `product_type: "service"`, its ledger's name
  // as the "Product Name", its SAC as hsn_sac_code - and none of the
  // product-only ones: no sku_code, sku_details or "Per Unit".
  const productData = request.lines.map((line) => {
    if (challan) {
      return {
        'Product Name': line.productName,
        Description: text(line.description),
        product_type: 'Product',
        Quantity: text(line.quantity),
        hsn_sac_code: numberOrNull(line.hsn),
        sku_code: line.skuCode,
        sku_details: line.skuDetails,
        'Per Unit': text(line.per),
      }
    }
    const common = {
      'Product Name': line.productName,
      Description: text(line.description),
      product_type: line.service ? SERVICE_PRODUCT_TYPE : 'Product',
      Quantity: text(line.quantity),
      discount: line.figures.discountPercent,
      hsn_sac_code: numberOrNull(line.hsn),
      // The amount tax is charged on - Quantity x Rate, less the line's discount.
      product_amount: rupees(line.figures.taxablePaise).toFixed(2),
    }
    const taxes = taxFields(line.figures, interState, (rate) => rateString(true, rate))
    if (line.service) return { ...common, ...taxes, 'Selling Rate': text(line.rate) }
    return {
      ...common,
      sku_code: line.skuCode,
      sku_details: line.skuDetails,
      ...taxes,
      'Selling Rate': text(line.rate),
      'Per Unit': text(line.per),
    }
  })

  // Only what applies to this document, each under the names the contract
  // gives it: every Other Charges row under its own ledger's name, marked
  // `source: "Other Charges"`; the discount, TCS and round off each as
  // { <its ledger's name>: amount } - the discount only when the Discount
  // Ledger discounts something, round off only when there is one (signed, as
  // worked out), TCS only when charged; the note only when written. Nothing
  // applying is sent as {} - never as empty or zero placeholder entries.
  const otherDetails = {}
  const forChallan = (value, empty) => (challan ? empty : value)
  request.charges.forEach((charge) => {
    if (!charge.ledgerName) return
    otherDetails[charge.ledgerName] = {
      amount: rupees(charge.figures.amountPaise),
      ...taxFields(charge.figures, interState, (rate) => rate),
      source: OTHER_CHARGES_SOURCE,
    }
  })
  if (figures.discountPaise > 0 && request.discount.ledgerName) {
    otherDetails.discount = { [request.discount.ledgerName]: rupees(figures.discountPaise) }
  }
  if (figures.tcsPaise && request.tcs.ledgerName) {
    otherDetails.tcs = { [request.tcs.ledgerName]: rupees(figures.tcsPaise) }
  }
  if (figures.roundOffPaise !== 0 && request.roundOff.ledgerName) {
    otherDetails['round off'] = { [request.roundOff.ledgerName]: rupees(figures.roundOffPaise) }
  }
  if (text(request.note)) otherDetails.note = text(request.note)
  // A challan has no Other Details at all - nothing stale from them is sent.
  if (challan) Object.keys(otherDetails).forEach((key) => delete otherDetails[key])

  // gst_charges is keyed by the LEDGER each tax is posted to - the real
  // ledger chosen for it (Utils/gstLedgers: GST mapping, else the ledger for
  // that rate, else the tax's basic ledger), never a name made up from the
  // tax and rate. gstChargesByLedger is the one grouping - the printed
  // invoice shows exactly these names and amounts. A charge with no ledger is
  // never sent: the save is refused here, before invoice/business-documents/
  // is called (the screen refuses it earlier).
  const charges = gstChargesByLedger(challan ? [] : request.gstCharges)
  const unposted = charges.filter((charge) => !charge.ledger).flatMap((charge) => charge.entries)
  if (unposted.length > 0) {
    const taxes = [...new Set(unposted.map((entry) => entry.tax))]
    throw new Error(
      `${taxes.join(', ')} ledger is missing (needed for ${unposted.map((entry) => `${entry.tax} ${entry.rateText}%`).join(', ')}). ` +
        `Please create the required ${taxes.join(' / ')} ledger before creating this document.`,
    )
  }
  const gstCharges = Object.fromEntries(charges.map((charge) => [charge.ledger, rupees(charge.paise)]))

  return {
    seller_id: request.sellerId ?? '',
    buyer_id: request.buyerId ?? '',
    bank_id: request.bankId ?? '',
    created_by: getEmail() || '',
    document_type: request.documentType,
    total_amount: forChallan(rupees(figures.totalPaise), 0),
    total_taxable_amount: forChallan(rupees(figures.taxablePaise), 0),
    prefill_from: JSON.stringify({}),
    ship_to: JSON.stringify(shipTo),
    dispatch_from: JSON.stringify(dispatchFrom),
    invoice_master_details: JSON.stringify(masterDetails),
    product_data: JSON.stringify(productData),
    other_details: JSON.stringify(otherDetails),
    gst_charges: JSON.stringify(gstCharges),
  }
}

/** A plain object as FormData - every value as text, files as they are. */
const toFormData = (fields) => {
  const body = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value instanceof Blob) body.append(key, value, value.name || key)
    else body.append(key, value === null || value === undefined ? '' : String(value))
  })
  return body
}

/* ------------------------------------------------------------------ */
/* Calls                                                              */
/* ------------------------------------------------------------------ */

/** 1. Saves the document -> { document_id, msg }. */
// A saved or deleted document can move stock - the cached product list is marked stale.
// A payload that cannot be built (a GST charge with no ledger) is a rejected
// request - never a thrown one - so the save shows its message like any other
// failure, and nothing is sent.
export const createBusinessDocument = (request) => {
  let body
  try {
    body = toFormData(buildBusinessDocumentPayload(request))
  } catch (failure) {
    return Promise.reject(failure)
  }
  return changesProducts(api.post(BUSINESS_DOCUMENT_URL, body, MULTIPART))
}

/** The saved document's id from the reply - null when it sent none. */
export const documentIdOf = (response) => response?.document_id ?? response?.data?.document_id ?? null

/** The PDF upload body - exported so it can be checked without sending. */
export const buildDocumentPdfFormData = (documentId, pdfBytes, fileName) => {
  const body = new FormData()
  body.append('id', String(documentId))
  body.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
  return body
}

/** 2. Uploads the document's PDF, naming the document by the id step 1 returned. */
export const saveDocumentPdf = (documentId, pdfBytes, fileName) =>
  api.post(DOCUMENT_PDF_URL, buildDocumentPdfFormData(documentId, pdfBytes, fileName), MULTIPART)

/**
 * A document's PDF file name - its type and number, made safe for a file
 * name: "Invoice-INV-34-25-26.pdf". The download and the upload use the same.
 */
export const documentPdfFileName = (documentLabel, invoiceNo) => {
  const safe = (value) => text(value).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ')
  return `${[safe(documentLabel) || 'Document', safe(invoiceNo)].filter(Boolean).join('-')}.pdf`
}

/* ------------------------------------------------------------------ */
/* The bank's payment QR                                              */
/* ------------------------------------------------------------------ */

/**
 * The payment QR a bank account carries (bank_statement/bankDetails/'s
 * `payment_qr`), as the Payment QR field holds it - or null when it has none:
 *
 *   { url, name, fromBank: true }
 *
 * The backend sends the file as a link: a full URL is used as it is; a path
 * ("/media/bank_qr/x.png") is read against the API's own origin, where it
 * serves its files. Empty values ("", null, "null") are no QR. This is a
 * reference to the file the bank already has - it is shown, never uploaded
 * as if it were a new file.
 */
export const paymentQrOfBank = (bank) => {
  const raw = text(bank?.payment_qr)
  if (!raw || ['null', 'none', 'undefined'].includes(raw.toLowerCase())) return null
  try {
    const url = /^(https?:|data:|blob:)/i.test(raw)
      ? raw
      : new URL(raw.startsWith('/') ? raw : `/${raw}`, new URL(ENV.API_BASE_URL, window.location.href).origin).href
    const fileName = /^data:/i.test(url) ? '' : decodeURIComponent(url.split('?')[0].split('/').pop() || '')
    return { url, name: fileName || 'Payment QR', fromBank: true }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Seller -> the company record, Buyer -> the ledger                  */
/* ------------------------------------------------------------------ */

/**
 * The Seller Details the company record keeps, as `form field -> company
 * field` (the names tally/user-companies-list/ and the Company Details form
 * use). The company's NAME is not among them: as on Company Details, a
 * company keeps its name - it is how Tally knows it.
 */
const SELLER_COMPANY_FIELDS = {
  phone: 'comp_phone',
  email: 'comp_email',
  address: 'comp_address',
  website: 'comp_website',
  state: 'comp_state',
  pincode: 'pincode',
  gstin: 'comp_gstin',
  pan: 'pan_no',
  udyam: 'udyam',
  category: 'category',
}

/** The Seller Details settings the company record keeps (the earlier invoice screen saved them there too). */
const SELLER_COMPANY_SETTINGS = {
  eWayBill: 'e_way_bill',
  eInvoice: 'e_invoice',
  voucherQr: 'is_voucher_qr',
  roundOff: 'round_off',
}

/**
 * PUT tally/user-companies-list/ - the company, with the Seller Details:
 *
 *   { company_id, comp_phone, comp_email, comp_address, comp_website,
 *     comp_state, pincode, comp_gstin, pan_no, udyam, category,
 *     e_way_bill, e_invoice, is_voucher_qr, round_off }
 *
 * Every mapped field goes up, changed or not - an unchanged one carries the
 * value the company already has, so nothing is blanked. Returns null when
 * nothing differs from `baseline` (the values the company was last known to
 * hold), so an unchanged Seller step sends nothing.
 *
 *   baseline   { seller, settings } - as sellerFromCompany / settingsFromCompany read the record
 */
export const buildCompanyUpdatePayload = (companyId, form, baseline) => {
  const changed =
    Object.keys(SELLER_COMPANY_FIELDS).some((field) => text(form.seller[field]) !== text(baseline.seller[field])) ||
    Object.keys(SELLER_COMPANY_SETTINGS).some((field) => Boolean(form.settings[field]) !== Boolean(baseline.settings[field]))
  if (!changed) return null

  const payload = { company_id: companyId }
  Object.entries(SELLER_COMPANY_FIELDS).forEach(([field, key]) => {
    const value = text(form.seller[field])
    payload[key] = ['gstin', 'pan', 'udyam'].includes(field) ? value.toUpperCase() : value
  })
  Object.entries(SELLER_COMPANY_SETTINGS).forEach(([field, key]) => {
    payload[key] = Boolean(form.settings[field])
  })
  return payload
}

/** Saves the Seller Details to the company (updateCompany - Services/companyService). */
export const saveSellerCompany = (payload) => updateCompany(payload)

/**
 * Every field a ledger record carries, as tally/create-ledger/ lists it (the
 * same set the Ledger Form edits). The buyer's update sends all of them, so
 * the fields the invoice does not show (group, bank, credit period, GST
 * rate...) go back exactly as the ledger has them.
 */
const LEDGER_RECORD_FIELDS = [
  'ledeger_name',
  'ledger_gst_reg_type',
  'ledeger_group_name',
  'ledger_sac',
  'ledeger_address',
  'ledeger_email',
  'ledeger_phone',
  'ledeger_website',
  'ledeger_gstin',
  'ledeger_state',
  'ledger_country',
  'ledger_city',
  'ledger_pincode',
  'gst_rate',
  'ledger_bank',
  'ledger_accno',
  'ledger_ifsc',
  'credit_period_days',
]

/** The Buyer Details a ledger keeps, as `form field -> ledger field`. The name is not one: the buyer IS that ledger. */
const BUYER_LEDGER_FIELDS = {
  address: 'ledeger_address',
  phone: 'ledeger_phone',
  email: 'ledeger_email',
  website: 'ledeger_website',
  gstin: 'ledeger_gstin',
  country: 'ledger_country',
  state: 'ledeger_state',
  pincode: 'ledger_pincode',
}

/**
 * PUT tally/create-ledger/ with the ledger's `ledger_obj_id` - the buyer's
 * ledger, updated with the Buyer Details:
 *
 *   { ledger_obj_id, company_id, ...every ledger field }   (+ created_by, erp,
 *   platform - added from the session by updateLedger)
 *
 * Starts from the ledger as listed, so nothing it holds is lost; the city is
 * kept unless the state changed (a city of the old state would be wrong).
 * Returns null when the buyer differs from `baseline` (buyerFromLedger of the
 * same ledger) in nothing, so an unchanged Buyer step sends nothing.
 */
export const buildBuyerLedgerPayload = (companyId, ledger, buyer, baseline) => {
  const changed = Object.keys(BUYER_LEDGER_FIELDS).some((field) => text(buyer[field]) !== text(baseline[field]))
  if (!changed || !ledger) return null

  const payload = { ledger_obj_id: getLedgerId(ledger), company_id: companyId }
  LEDGER_RECORD_FIELDS.forEach((key) => {
    payload[key] = key === 'credit_period_days' ? Number(ledger[key]) || 0 : text(ledger[key])
  })
  Object.entries(BUYER_LEDGER_FIELDS).forEach(([field, key]) => {
    payload[key] = field === 'gstin' ? text(buyer[field]).toUpperCase() : text(buyer[field])
  })
  if (text(buyer.state) !== text(baseline.state)) payload.ledger_city = ''
  return payload
}

/**
 * Saves the buyer's ledger - PUT tally/create-ledger/, the same update the
 * Ledger Details form makes (updateLedger, Services/ledgerService): the
 * backend updates the ledger named by `ledger_obj_id` in place, never
 * creates one, and updateLedger adds the session's created_by, erp and
 * platform.
 */
export const saveBuyerLedger = (payload) => updateLedger(payload)

/* ------------------------------------------------------------------ */
/* Document numbering                                                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* One request at a time per question                                 */
/* ------------------------------------------------------------------ */

const inFlight = new Map()

/**
 * Runs `request` - unless the very same request (same URL, same body) is
 * already on its way, in which case its answer is shared. React's Strict
 * Mode runs every effect twice as a screen mounts (in development), and
 * without this both runs asked the server. Only a request still pending is
 * shared: once it settles it is forgotten, so the next ask - another
 * company or document type, or a refresh after a change - goes to the
 * server as it should.
 */
const sharedRequest = (url, body, request) => {
  const key = `${url}|${JSON.stringify(body)}`
  if (inFlight.has(key)) return inFlight.get(key)
  const pending = request().finally(() => inFlight.delete(key))
  inFlight.set(key, pending)
  return pending
}

const LAST_DOCUMENT_NUMBER_URL = 'invoice/last-document-number/'

/**
 * The document type as the numbering endpoint names it - an invoice is
 * "Sales Invoice" there; every other type by its own value.
 */
export const numberingDocumentType = (documentType) =>
  documentType === DOCUMENT_TYPES[0].value ? 'Sales Invoice' : documentType

/**
 * POST invoice/last-document-number/  { company_id, document_type }
 *   -> { document_no, document_no_f, document_no_s, document_no_t,
 *        auto_increment: "true", with_discount: "false", document_type }
 *   or { msg: "No document found", auto_increment: "true" }
 */
export const getLastDocumentNumber = (companyId, documentType) => {
  const body = { company_id: companyId, document_type: numberingDocumentType(documentType) }
  return sharedRequest(LAST_DOCUMENT_NUMBER_URL, body, () => api.post(LAST_DOCUMENT_NUMBER_URL, body))
}

/* ------------------------------------------------------------------ */
/* GST ledger mapping (Sales Invoice only)                            */
/* ------------------------------------------------------------------ */

const DOCUMENT_MAPPING_URL = 'invoice/document-mapping/'

/** The two kinds of mapping the endpoint keeps, by their key in its answer. */
export const MAPPING_KIND = Object.freeze({ LEDGER: 'ledger_mapping', PRODUCT: 'product_mapping' })

/**
 * POST invoice/document-mapping/  { company_id }  - the body with only the
 * company is the read; one carrying a mapping is a save (saveDocumentMapping).
 *   -> { ledger_mapping: { cgst: "CGST", sgst_6: "..." }, product_mapping: { ... } }
 * Normalised to the two objects, each {} when missing.
 */
export const getDocumentMappings = async (companyId) => {
  const body = { company_id: companyId }
  const reply = await sharedRequest(DOCUMENT_MAPPING_URL, body, () => api.post(DOCUMENT_MAPPING_URL, body))
  const objectOf = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
  return {
    [MAPPING_KIND.LEDGER]: objectOf(reply?.[MAPPING_KIND.LEDGER]),
    [MAPPING_KIND.PRODUCT]: objectOf(reply?.[MAPPING_KIND.PRODUCT]),
  }
}

/** The body naming one mapping: { company_id, ledger_mapping: { cgst: "Output CGST" } }. */
export const buildMappingPayload = (companyId, kind, key, ledgerName) => ({ company_id: companyId, [kind]: { [key]: ledgerName } })

/** POST invoice/document-mapping/ - adds (or replaces) one mapping. */
export const saveDocumentMapping = (companyId, kind, key, ledgerName) =>
  api.post(DOCUMENT_MAPPING_URL, buildMappingPayload(companyId, kind, key, ledgerName))

/** DELETE invoice/document-mapping/ - removes the one mapping named by its kind, key and ledger (a DELETE body goes under `data`). */
export const deleteDocumentMapping = (companyId, kind, key, ledgerName) =>
  api.delete(DOCUMENT_MAPPING_URL, { data: buildMappingPayload(companyId, kind, key, ledgerName) })

/* ------------------------------------------------------------------ */
/* The buyer's earlier products                                       */
/* ------------------------------------------------------------------ */

const UNIQUE_PRODUCTS_URL = 'invoice/unique-products/'

/**
 * POST invoice/unique-products/  { ledger_id, document_type, company_id }
 *   -> [{ "Product Name", hsn_sac_code, sku_code, sku_details, product_type }]
 * The products this buyer has had on earlier documents of this type. A
 * `{ products_list: [...] }` wrapper (the earlier endpoint's shape) is read
 * too; rows without a name are dropped.
 */
export const getUniqueProducts = async ({ companyId, ledgerId, documentType }) => {
  const reply = await api.post(UNIQUE_PRODUCTS_URL, { ledger_id: ledgerId, document_type: documentType, company_id: companyId })
  const list = Array.isArray(reply) ? reply : Array.isArray(reply?.products_list) ? reply.products_list : Array.isArray(reply?.data) ? reply.data : []
  return list.filter((row) => row && text(row['Product Name'] ?? row.product_name ?? row.Products))
}

/* ------------------------------------------------------------------ */
/* Document history                                                   */
/* ------------------------------------------------------------------ */

const DOCUMENT_HISTORY_URL = 'invoice/business-document-history/'
const DOCUMENT_DELETE_URL = 'invoice/document-delete/'

/**
 * POST invoice/business-document-history/  { company_id, date: "2025-2026", document_type }
 * -> the company's saved documents of that type and financial year. The
 * document type is named as the numbering endpoint names it (an invoice is
 * "Sales Invoice"). A bare array is read, or one under `data` / `results`.
 */
export const getDocumentHistory = async ({ companyId, financialYear, documentType }) => {
  const body = { company_id: companyId, date: financialYear, document_type: numberingDocumentType(documentType) }
  const reply = await sharedRequest(DOCUMENT_HISTORY_URL, body, () => api.post(DOCUMENT_HISTORY_URL, body))
  const list = Array.isArray(reply) ? reply : Array.isArray(reply?.data) ? reply.data : Array.isArray(reply?.results) ? reply.results : []
  return list.filter((row) => row && typeof row === 'object')
}

/**
 * POST invoice/document-delete/  { id, x_deleted: "true", y_deleted: "false" }
 * -> { msg }. The flags go as the text the backend takes them as. A refusal
 * (a document referenced elsewhere, say) arrives as an error carrying the
 * backend's own message (see authService).
 */
export const deleteBusinessDocument = (documentId) =>
  changesProducts(api.post(DOCUMENT_DELETE_URL, { id: documentId, x_deleted: 'true', y_deleted: 'false' }))

/* ------------------------------------------------------------------ */
/* Fetching documents from Tally - over the app's WebSocket           */
/* ------------------------------------------------------------------ */

const TALLY_VOUCHER_LIST_URL = 'tally/voucher-list/'

/**
 * POST tally/voucher-list/  { company_name } -> ["Sales", "Credit Note", ...]
 * The voucher types the company's Tally has - what the fetch can ask for.
 */
export const getTallyVoucherTypes = async (companyName) => {
  const reply = await api.post(TALLY_VOUCHER_LIST_URL, { company_name: companyName })
  const list = Array.isArray(reply) ? reply : Array.isArray(reply?.data) ? reply.data : []
  return [...new Set(list.map(text).filter(Boolean))]
}

/**
 * The module the invoice fetch uses in both directions - sent as
 * `module_name`, answered as `return_module_name` - the convention every
 * Tally message in the app follows (ledgerService, productService).
 */
export const TALLY_INVOICE_FETCH_MODULE = 'tally_invoice_fetch'

/**
 * The fetch, in the envelope every Tally message is sent in:
 *
 *   { "payload": { "module_name": "tally_invoice_fetch",
 *                  "company_name": "<active company>",
 *                  "data": { "start_year": "2025", "start_month": "3",
 *                            "end_year": "2026", "end_month": "3",
 *                            "voucher_type": ["Sales", "Credit Note"] } } }
 *
 * Years and months go as text, months without a leading zero.
 */
export const buildTallyInvoiceFetchMessage = (companyName, { startYear, startMonth, endYear, endMonth, voucherTypes }) => ({
  payload: {
    module_name: TALLY_INVOICE_FETCH_MODULE,
    company_name: companyName,
    data: {
      start_year: String(startYear),
      start_month: String(Number(startMonth)),
      end_year: String(endYear),
      end_month: String(Number(endMonth)),
      voucher_type: [...voucherTypes],
    },
  },
})

/* ------------------------------------------------------------------ */
/* The form, resolved for saving                                      */
/* ------------------------------------------------------------------ */

/**
 * Everything the payload needs, in one object, from the form and the lists
 * the screen already holds - so the builder above never looks anything up:
 *
 *   form, figures            the form and invoiceFigures(form)
 *   gstCharges               gstByRate(figures), each with its `rateText` and
 *                            the `ledger` it is posted to (resolveGstLedgers)
 *   company                  the active company's record
 *   dispatch, shipping       effectiveDispatch / effectiveShipping, each with
 *                            its `stateCode`
 *   invoiceNo                invoiceNumberOf(form.document)
 *   ledgersById, banks       the ledger and bank lists
 *   productsByKey            the products, for each line's name and SKU
 *   lineVariantOf(product, line)   the SKU a line chose
 */
export const buildInvoiceSaveRequest = ({
  form,
  figures,
  gstCharges,
  company,
  dispatch,
  shipping,
  invoiceNo,
  ledgersById,
  banks,
  productsByKey,
  lineVariantOf,
}) => {
  const ledgerOf = (id) => (id ? ledgersById.get(String(id)) : null)
  const ledgerName = (id) => text(ledgerOf(id)?.ledeger_name)
  const bank = banks.find((entry) => String(entry.id) === String(form.document.bankId)) ?? null

  return {
    documentType: form.documentType,
    invoiceNo,
    sellerId: company?.company_id ?? null,
    buyerId: getLedgerId(ledgerOf(form.buyer.ledgerId)) ?? (form.buyer.ledgerId || null),
    bankId: bank?.id ?? null,
    dispatch,
    shipping,
    document: form.document,
    reverseCharge: form.settings.reverseCharge,
    interState: figures.tax.interState,
    figures,
    gstCharges,
    note: form.note,
    discount: { ledgerName: ledgerName(form.discount.ledgerId) },
    roundOff: { ledgerName: ledgerName(form.roundOff.ledgerId) },
    tcs: { ledgerName: ledgerName(form.tcs.ledgerId) },
    charges: form.charges.map((charge) => ({
      id: charge.id,
      ledgerName: ledgerName(charge.ledgerId),
      figures: figures.charges[charge.id],
    })),
    lines: form.lines.map((line) => {
      // A service line is the ledger chosen for it: its name, and no SKU.
      if (line.kind === 'service') {
        return { ...line, service: true, productName: ledgerName(line.ledgerId), figures: figures.lines[line.id] }
      }
      const product = productsByKey.get(line.productKey)
      const variant = lineVariantOf(product, line)
      return {
        ...line,
        productName: text(product?.name),
        skuCode: text(variant?.skuCode),
        skuDetails: variant ? Object.fromEntries(variant.skuDetails) : {},
        figures: figures.lines[line.id],
      }
    }),
  }
}

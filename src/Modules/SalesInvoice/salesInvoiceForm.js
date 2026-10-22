/**
 * THE SALES INVOICE FORM - its values and every rule about them, with no
 * screen attached.
 *
 *   createInvoiceForm(company)      a new form, the seller filled in from the
 *                                   company the user is working in
 *   buyerFromLedger(ledger, ...)    the Buyer Details a chosen ledger fills in
 *   lineFromProduct / lineFromSku   a product line, filled in from the list
 *   effectiveDispatch / effectiveShipping
 *                                   what the two "Same as" cards really hold
 *   taxTreatment(form)              CGST + SGST, or IGST - and why
 *   invoiceFigures(form, products)  every amount, in paise
 *   validateInvoice(form, ...)      what is wrong, field by field
 *   errorStep(errors)               the first step that has a problem
 *
 * ------------------------------------------------------------------
 * ONE VALUE, ONE PLACE
 * ------------------------------------------------------------------
 * Anything that can be worked out is never stored, so it can never fall out
 * of step with what it is worked out from:
 *
 *   State Code           read from the state's name (INDIAN_STATES)
 *   Dispatched From      while "Same as Seller Details" is ticked, IS the
 *                        seller - not a copy of it (effectiveDispatch)
 *   Shipping To          the same, from the buyer (effectiveShipping)
 *   Amount, taxes        from quantity, rate, discount and the GST rate
 *                        (invoiceFigures)
 *   Invoice No.          with Auto Increment, the three parts joined by "/"
 *
 * Money is counted in whole paise (toPaise / percentOf from the payment
 * module, the app's existing money helpers), so 0.1 + 0.2 is 30 paise and
 * never a float tail. Rupees appear only when shown (formatINR) or sent.
 */

import { GST_RATES, gstBreakdown } from '@/Constants/gst'
import { INDIAN_STATES, findStateByGstNumber, findStateByName } from '@/Constants/indianStates'
import {
  ADDRESS_MAX_LENGTH,
  DEFAULT_SUPPLY,
  DEFAULT_SUPPLY_TYPE,
  DESCRIPTION_MAX_LENGTH,
  DOCUMENT_TYPE_CHALLAN,
  DOCUMENT_TYPE_INVOICE,
  INVOICE_NO_MAX_LENGTH,
  INVOICE_STEP,
  INVOICE_STEPS,
  SUPPLY_TYPES,
  SUPPLY_TYPE_EXPORT,
  findDocumentType,
} from '@/Constants/salesInvoice'
import { percentOf, toPaise } from '@/Modules/Payment/pricing'
import { savedValue } from '@/Modules/Dashboard/productList'
import { isValidGstNumber } from '@/Services/gstService'
import { getLedgerSac } from '@/Services/ledgerService'
import { DEFAULT_COUNTRY } from '@/Services/locationService'
import { toInputDate } from '@/Utils/date'
import { isValidEmail, isValidPan, isValidPhone, isValidPincode, isValidWebsite } from '@/Utils/validation'

/* ------------------------------------------------------------------ */
/* Small readers                                                      */
/* ------------------------------------------------------------------ */

/** A value as trimmed text - '' for null, undefined or anything blank. */
export const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** A yes/no the backend may send as true, "true", 1 ... - false for anything else. */
const flagOf = (value) => value === true || value === 1 || ['true', '1', 'yes'].includes(textOf(value).toLowerCase())

const sameText = (a, b) => textOf(a).toLowerCase() === textOf(b).toLowerCase()

/**
 * What a number box keeps of what is typed: digits and one decimal point -
 * so it can never hold a value the sums would have to reject. `signed` lets
 * a leading minus through, for Round Off.
 */
export const toDecimalInput = (value, { signed = false } = {}) => {
  const raw = String(value ?? '')
  const negative = signed && raw.trim().startsWith('-')
  const digits = raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
  return negative ? `-${digits}` : digits
}

/** Rows that are added and removed need a key that never changes. */
let sequence = 0
const newRowId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(sequence++).toString(36)}`

/* ------------------------------------------------------------------ */
/* States and their GST codes                                         */
/* ------------------------------------------------------------------ */

/** Every Indian state / UT as dropdown options - the name is the value. */
export const INDIAN_STATE_OPTIONS = INDIAN_STATES.map((state) => ({ value: state.name, label: state.name }))

/**
 * A state's name as INDIAN_STATES spells it ("GUJARAT" -> "Gujarat"), or the
 * name as it came when it is not an Indian state - a foreign buyer's state
 * is still that buyer's state.
 */
export const canonicalStateName = (name) => findStateByName(name)?.name ?? textOf(name)

/** The 2-digit GST code of an Indian state by name - '' when it is not one. */
export const stateCodeOf = (stateName) => findStateByName(stateName)?.code ?? ''

/**
 * Where a party is, as a GST state code. A valid GSTIN is the registration
 * itself, so its first two digits win; otherwise the state chosen.
 */
const partyStateCode = (party) => {
  const gstin = textOf(party?.gstin).toUpperCase()
  if (gstin && isValidGstNumber(gstin)) return findStateByGstNumber(gstin)?.code ?? ''
  return stateCodeOf(party?.state)
}

/**
 * `options` with `value` added when it is not one of them, so a dropdown can
 * still show a value that came from elsewhere (a ledger's state written
 * differently, say) instead of looking empty.
 */
export const withCurrentOption = (options, value) => {
  const current = textOf(value)
  if (!current || options.some((option) => option.value === current)) return options
  return [{ value: current, label: current }, ...options]
}

/** The option of `names` that matches `value` however it is capitalised - or `value` itself. */
const matchName = (names, value) => names.find((name) => sameText(name, value)) ?? textOf(value)

/* ------------------------------------------------------------------ */
/* A new form                                                         */
/* ------------------------------------------------------------------ */

const EMPTY_PARTY_ADDRESS = { name: '', gstin: '', state: '', address: '', pincode: '' }

/**
 * What a line of the invoice is:
 *   product   chosen from the product list (inventory/product/) - SKU, unit
 *   service   chosen from the company's ledgers (tally/create-ledger/) - its
 *             SAC; no SKU, no unit
 */
export const LINE_KIND = Object.freeze({ PRODUCT: 'product', SERVICE: 'service' })

/** True for a service line (a ledger), false for a product line. */
export const isServiceLine = (line) => line?.kind === LINE_KIND.SERVICE

/* ------------------------------------------------------------------ */
/* What each document type has                                        */
/* ------------------------------------------------------------------ */

/**
 * EVERY DOCUMENT TYPE'S FORM, in one table - what Step 1 offers of the
 * Settings, which Document Details Step 3 shows (in order, with the type's
 * own labels), whether services and discounts are taken, and which Other
 * Details sections there are. Sales Invoice has everything; the other types
 * are the same form with less of it. One table, so a type can never show a
 * field its preview, checks or payload then ignore - applicableForm reads it
 * too.
 *
 *   settings      the Settings boxes shown (SellerStep). A box not shown is
 *                 off for this document - except Round Off, which follows the
 *                 company's setting wherever Other Details has a Round Off.
 *   number, date  the labels of document_no / document_date
 *   fields        [key, label, extra] in order - `key` is the form's own
 *                 document field (and handler); `extra` e.g. { required }
 *   services      the Product / Service choice is offered
 *   discount      With Discount (the lines' Disc. %) is offered
 *   other         the Other Details sections: charges, discount, tcs,
 *                 roundOff, note - [] is no Other Details card at all
 *   gst           GST is charged, listed and posted to ledgers (mapping)
 *   roundOffAlways  Round Off is worked out whatever the company's Show Round
 *                 Off setting (its box is not shown) - Sales Order
 *   challan       a challan: goods only - products, no rates, GST, discount or
 *                 Other Details, its own sheet (challanTitle) and copies
 *   numberMessage the error when the number is missing (default "Invoice
 *                 number is required")
 *   label, title  a type outside DOCUMENT_TYPES (another module's, see
 *                 defineDocumentProfiles): its name, and its sheet's title
 *   challanLabels a challan's number / date boxes on its sheet, when not
 *                 "Challan No./Delivery No." / "Challan Date/Delivery Date."
 */
const ALL_SETTINGS = ['eWayBill', 'eInvoice', 'reverseCharge', 'voucherQr', 'roundOff']
const ALL_OTHER_DETAILS = ['charges', 'discount', 'tcs', 'roundOff', 'note']

const DOCUMENT_PROFILES = {
  [DOCUMENT_TYPE_INVOICE]: {
    settings: ALL_SETTINGS,
    number: 'Invoice No.',
    date: 'Invoice Date',
    fields: [
      ['termsOfPayment', 'Mode/Terms of Payment'],
      ['referenceNo', 'Reference No.'],
      ['referenceDate', 'Reference Date'],
      ['poNo', 'PO No.'],
      ['poDate', 'PO Date'],
      ['deliveryNote', 'Delivery Note'],
      ['deliveryNoteDate', 'Delivery Note Date'],
      ['transportReason', 'Reason for Transportation'],
      ['transporter', 'Delivery Transporter'],
      ['transporterId', 'Transporter ID'],
      ['freightTerms', 'Freight Terms of Payment'],
      ['lrNo', 'Bill of Lading/LR-RR No.'],
      ['lrDate', 'LR-RR Date'],
      ['vehicleNo', 'Vehicle Number'],
      ['distance', 'Distance (km)'],
      ['deliveryMode', 'Delivery Mode'],
      ['supply', 'Supply'],
      ['supplyType', 'Supply Type', { required: true }],
      ['bankId', 'Select Bank'],
      ['paymentQr', 'Payment QR'],
    ],
    services: true,
    discount: true,
    other: ALL_OTHER_DETAILS,
    gst: true,
  },
  [DOCUMENT_TYPE_CHALLAN]: {
    settings: [],
    number: 'Challan No.',
    date: 'Challan Date',
    fields: [
      ['challanInvoiceNo', 'Invoice No.'],
      ['challanInvoiceDate', 'Invoice Date'],
      ['referenceNo', 'Reference No. / PO No.', { required: true }],
      ['referenceDate', 'Reference Date / PO Date'],
      ['transportReason', 'Reason for Transportation'],
      ['transporter', 'Dispatch Through'],
      ['freightTerms', 'Freight Terms of Payment'],
      ['lrNo', 'Bill of Lading / LR-RR No.'],
      ['vehicleNo', 'Vehicle Number'],
      ['distance', 'Distance (km)'],
      ['deliveryMode', 'Delivery Mode'],
      ['challanType', 'Challan Type'],
    ],
    services: false,
    discount: false,
    other: [],
    gst: false,
    challan: true,
    challanTitle: 'DELIVERY CHALLAN',
  },
}

/** Sales Order and Purchase Order: the same short set - no transport, no bank. */
const orderProfile = (name, { poFields }) => ({
  settings: [],
  number: `${name} No.`,
  date: `${name} Date`,
  fields: [
    ['referenceNo', 'Reference No.'],
    ['referenceDate', 'Reference Date'],
    ...(poFields
      ? [
          ['poNo', 'PO No.'],
          ['poDate', 'PO Date'],
        ]
      : []),
    ['transporter', 'Dispatch Through'],
    ['termsOfPayment', 'Mode/Terms of Payment'],
    ['freightTerms', 'Freight Terms of Payment'],
  ],
  services: true,
  discount: false,
  other: ['roundOff', 'note'],
  gst: true,
})

/** Credit Note and Debit Note: the invoice they adjust, transport, bank - and the invoice's Other Details. */
const noteProfile = (name) => ({
  settings: ['voucherQr', 'eInvoice', 'eWayBill'],
  number: `${name} No.`,
  date: `${name} Date`,
  fields: [
    ['challanInvoiceNo', 'Invoice No.'],
    ['challanInvoiceDate', 'Invoice Date'],
    ['referenceNo', 'Reference No.'],
    ['referenceDate', 'Reference Date'],
    ['deliveryNote', 'Delivery Note'],
    ['deliveryNoteDate', 'Delivery Note Date'],
    ['transportReason', 'Reason for Transportation'],
    ['transporter', 'Dispatch Through'],
    ['freightTerms', 'Freight Terms of Payment'],
    ['lrNo', 'Bill of Lading/LR-RR No.'],
    ['vehicleNo', 'Vehicle Number'],
    ['distance', 'Distance (km)'],
    ['deliveryMode', 'Delivery Mode'],
    ['bankId', 'Select Bank'],
    ['paymentQr', 'Payment QR'],
  ],
  services: true,
  discount: true,
  other: ALL_OTHER_DETAILS,
  gst: true,
})

// A Sales Order shows no Show Round Off box, yet always rounds: its Round
// Off is in Other Details whatever the company's setting.
DOCUMENT_PROFILES['Sales Order'] = { ...orderProfile('Sales Order', { poFields: true }), roundOffAlways: true }
DOCUMENT_PROFILES['Purchase Order'] = orderProfile('Purchase Order', { poFields: false })
DOCUMENT_PROFILES['Credit Note'] = noteProfile('Credit Note')
DOCUMENT_PROFILES['Debit Note'] = noteProfile('Debit Note')
DOCUMENT_PROFILES.Proforma = {
  settings: ['reverseCharge'],
  number: 'Proforma No.',
  date: 'Proforma Date',
  fields: [
    ['referenceNo', 'Reference No.'],
    ['referenceDate', 'Reference Date'],
    ['poNo', 'PO No.'],
    ['poDate', 'PO Date'],
    ['termsOfPayment', 'Mode/Terms of Payment'],
    ['freightTerms', 'Freight Terms of Payment'],
    ['bankId', 'Select Bank'],
    ['paymentQr', 'Payment QR'],
  ],
  services: true,
  discount: true,
  other: ['discount', 'roundOff', 'note'],
  gst: true,
}
DOCUMENT_PROFILES.Quotation = {
  settings: [],
  number: 'Quotation No.',
  date: 'Quotation Date',
  fields: [
    ['referenceNo', 'Reference No.'],
    ['referenceDate', 'Reference Date'],
    ['transporter', 'Dispatch Through'],
    ['termsOfPayment', 'Mode/Terms of Payment'],
    ['freightTerms', 'Freight Terms of Payment'],
    ['bankId', 'Select Bank'],
    ['paymentQr', 'Payment QR'],
  ],
  services: true,
  discount: false,
  other: ['roundOff', 'note'],
  gst: true,
}

/**
 * Adds another module's document types (Purchase Invoice's) to the table -
 * each under its own name, never replacing a type already there, so a sales
 * type can never be changed from outside. Their rules then apply to them
 * everywhere the profile is read.
 */
export const defineDocumentProfiles = (profiles) => {
  Object.entries(profiles).forEach(([type, profile]) => {
    if (DOCUMENT_PROFILES[type] && DOCUMENT_PROFILES[type] !== profile) throw new Error(`Document type "${type}" is already defined`)
    DOCUMENT_PROFILES[type] = profile
  })
}

/** The type's profile (DOCUMENT_PROFILES) - Sales Invoice's for a type it does not know. */
export const documentProfile = (form) => DOCUMENT_PROFILES[form?.documentType] ?? DOCUMENT_PROFILES[DOCUMENT_TYPE_INVOICE]

/** Whether this type's Document Details show `field` (a form document key). */
export const showsDocumentField = (form, field) => documentProfile(form).fields.some(([key]) => key === field)

/** Whether this type's Other Details have `section` ('charges' | 'discount' | 'tcs' | 'roundOff' | 'note'). */
export const hasOtherDetail = (form, section) => documentProfile(form).other.includes(section)

/**
 * The Settings as they apply to THIS document: a box the type does not show
 * is off - its value (the company's, or a tick from another type) has no
 * say. Round Off is the company's setting and follows it wherever Other
 * Details has a Round Off - always on for a type that rounds regardless
 * (roundOffAlways), never for one with no Round Off (Challan).
 */
export const settingsOf = (form) => {
  const profile = documentProfile(form)
  const on = (key) => {
    if (key !== 'roundOff') return Boolean(form.settings[key]) && profile.settings.includes(key)
    if (!profile.other.includes('roundOff')) return false
    return Boolean(profile.roundOffAlways) || Boolean(form.settings.roundOff)
  }
  return Object.fromEntries(ALL_SETTINGS.map((key) => [key, on(key)]))
}

/**
 * The kind a NEW line is entered as: Product where the type takes no
 * services; Service while Reverse Charge Applicable is ticked (the Product /
 * Service choice is not offered then); else the choice - Product unless
 * Service was picked.
 */
export const entryModeOf = (form) =>
  !documentProfile(form).services ? LINE_KIND.PRODUCT : settingsOf(form).reverseCharge ? LINE_KIND.SERVICE : form.entryMode

/**
 * A Challan (or another module's challan - Inbound Challan) - goods sent, not
 * sold: products only, no GST, discount or other charges, its own document
 * fields, and the company's invoice settings (e-invoice, e-way bill, reverse
 * charge, ...) not in play. Read from the type's profile (`challan`).
 */
export const isChallan = (form) => Boolean(form && documentProfile(form).challan)

/** The invoice settings that apply to this document (settingsOf) - what the e-invoice / e-way bill rules read. */
export const portalSettingsOf = (form) => settingsOf(form)

/** One empty line - a product line unless `kind` says service. */
export const newInvoiceLine = (kind = LINE_KIND.PRODUCT) => ({
  id: newRowId('line'),
  kind,
  // a service line's ledger (its ledger_obj_id, as text)
  ledgerId: '',
  productKey: '',
  skuValue: '',
  hsn: '',
  gstRate: '',
  quantity: '',
  rate: '',
  per: '',
  discount: '',
  description: '',
})

/** One empty Other Charges row. */
export const newChargeRow = () => ({ id: newRowId('charge'), ledgerId: '', amount: '', gstRate: '' })

/**
 * The seller, as the company record from tally/user-companies-list/ holds
 * it - the same fields the Company Details form edits (comp_*, pan_no, udyam,
 * category). A field the record does not carry starts empty.
 */
export const sellerFromCompany = (company) => ({
  name: textOf(company?.comp_name),
  phone: textOf(company?.comp_phone),
  email: textOf(company?.comp_email),
  address: textOf(company?.comp_address).slice(0, ADDRESS_MAX_LENGTH),
  website: textOf(company?.comp_website),
  state: canonicalStateName(company?.comp_state),
  pincode: textOf(company?.pincode),
  gstin: textOf(company?.comp_gstin).toUpperCase(),
  pan: textOf(company?.pan_no).toUpperCase(),
  udyam: textOf(company?.udyam).toUpperCase(),
  category: textOf(company?.category),
  logo: null,
  signature: null,
})

/**
 * The company's invoice settings. e_invoice and e_way_bill are what the
 * invoice backend itself checks before saving (it asks for the dispatch and
 * shipping details they need), so the boxes start where the company is.
 */
export const settingsFromCompany = (company) => ({
  eWayBill: flagOf(company?.e_way_bill),
  eInvoice: flagOf(company?.e_invoice),
  reverseCharge: false,
  voucherQr: company?.is_voucher_qr === undefined ? true : flagOf(company.is_voucher_qr),
  roundOff: company?.round_off === undefined ? true : flagOf(company.round_off),
})

/** Today, as an <input type="date"> holds it - the local day, not UTC's. */
const todayForInput = () => toInputDate(new Date())

export const createInvoiceForm = (company) => ({
  documentType: DOCUMENT_TYPE_INVOICE,

  seller: sellerFromCompany(company),
  settings: settingsFromCompany(company),
  dispatchSameAsSeller: true,
  dispatch: { ...EMPTY_PARTY_ADDRESS },

  buyer: {
    ledgerId: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    country: DEFAULT_COUNTRY,
    state: '',
    pincode: '',
    gstin: '',
    regType: '',
  },
  shippingSameAsBuyer: true,
  shipping: { ...EMPTY_PARTY_ADDRESS },

  document: {
    autoIncrement: false,
    invoiceNo: '',
    invoiceNoParts: ['', '', ''],
    invoiceDate: todayForInput(),
    termsOfPayment: '',
    referenceNo: '',
    referenceDate: '',
    // Challan only: the invoice the goods go with, and the kind of challan.
    challanInvoiceNo: '',
    challanInvoiceDate: '',
    challanType: '',
    poNo: '',
    poDate: '',
    deliveryNote: '',
    deliveryNoteDate: '',
    transportReason: '',
    transporter: '',
    transporterId: '',
    freightTerms: '',
    lrNo: '',
    lrDate: '',
    vehicleNo: '',
    distance: '',
    deliveryMode: '',
    supply: DEFAULT_SUPPLY,
    supplyType: DEFAULT_SUPPLY_TYPE,
    bankId: '',
    paymentQr: null,
  },

  gstLedgerMapping: false,
  withDiscount: false,
  // Product / Service - what the entry form takes a new line as (entryModeOf).
  entryMode: LINE_KIND.PRODUCT,
  // The products already on the invoice - what the preview, the totals and the
  // saved document read - and the ONE entry form a product is typed into
  // before Add Product commits it. `editingLineId` is the line the entry form
  // was loaded from by Edit, or null for a new product.
  lines: [],
  entry: newInvoiceLine(),
  editingLineId: null,

  charges: [],
  // The Other Charges discount: one overall amount, off the products' taxable
  // value - independent of the With Discount box (which is the lines' own
  // Disc. %). Round off has no amount of its own - it is worked out.
  discount: { ledgerId: '', amount: '' },
  roundOff: { ledgerId: '' },
  tcs: { ledgerId: '', amount: '' },
  note: '',
})

/** The Document Details every type has - its number and date. */
const ALWAYS_DOCUMENT_FIELDS = new Set(['autoIncrement', 'invoiceNo', 'invoiceNoParts', 'invoiceDate'])

/**
 * THE FORM AS THIS DOCUMENT TYPE HAS IT (documentProfile): what the type
 * does not show is cleared - Settings it has no box for are off (settingsOf),
 * Document Details it has no field for are empty (Supply and Supply Type back
 * to an ordinary sale), the lines' discount is off without With Discount, and
 * Other Details sections it does not have are empty.
 *
 * The figures, the checks, the preview and the saved document all read this,
 * so nothing hidden - a value typed while another type was chosen, a stale
 * tick - can change a total or reach the payload. The form itself keeps every
 * value, so switching back to that type finds them again.
 */
export const applicableForm = (form) => {
  const profile = documentProfile(form)
  const shown = new Set(profile.fields.map(([key]) => key))
  const blank = createInvoiceForm(null)
  const keeps = (section) => profile.other.includes(section)

  const document = Object.fromEntries(
    Object.entries(form.document).map(([key, value]) => {
      if (ALWAYS_DOCUMENT_FIELDS.has(key) || shown.has(key)) return [key, value]
      if (key === 'supply') return [key, DEFAULT_SUPPLY]
      if (key === 'supplyType') return [key, DEFAULT_SUPPLY_TYPE]
      return [key, key in blank.document ? blank.document[key] : '']
    }),
  )

  return {
    ...form,
    settings: settingsOf(form),
    document,
    gstLedgerMapping: profile.gst && form.gstLedgerMapping,
    withDiscount: profile.discount && form.withDiscount,
    charges: keeps('charges') ? form.charges : [],
    discount: keeps('discount') ? form.discount : blank.discount,
    roundOff: keeps('roundOff') ? form.roundOff : blank.roundOff,
    tcs: keeps('tcs') ? form.tcs : blank.tcs,
    note: keeps('note') ? form.note : '',
  }
}

/* ------------------------------------------------------------------ */
/* Same as Seller / Same as Buyer                                     */
/* ------------------------------------------------------------------ */

const addressOf = (party) => ({
  name: textOf(party?.name),
  gstin: textOf(party?.gstin),
  state: textOf(party?.state),
  address: textOf(party?.address),
  pincode: textOf(party?.pincode),
})

/** What Dispatched From holds: the seller while the box is ticked, its own fields otherwise. */
export const effectiveDispatch = (form) => (form.dispatchSameAsSeller ? addressOf(form.seller) : form.dispatch)

/** What Shipping To holds: the buyer while the box is ticked, its own fields otherwise. */
export const effectiveShipping = (form) => (form.shippingSameAsBuyer ? addressOf(form.buyer) : form.shipping)

/**
 * A Dispatched From / Shipping To card with nothing in it - what the card
 * holds the moment its "Same as" box is unticked, so nothing copied or typed
 * before is carried over.
 */
export const emptyAddress = () => ({ ...EMPTY_PARTY_ADDRESS })

/* ------------------------------------------------------------------ */
/* Buyer from a ledger                                                */
/* ------------------------------------------------------------------ */

/**
 * The Buyer Details a ledger fills in, from the ledger row as
 * tally/create-ledger/ lists it (the API's own spelling - "ledeger").
 *
 * EVERY buyer field is replaced, a missing value with '' - so nothing of the
 * previous buyer is left behind. The user may edit any of it afterwards.
 *
 * `countryNames` / `stateNamesOf(country)` are the country list's, so the
 * country and state land on the spelling the dropdowns offer. A ledger with
 * no country but an Indian state is in India; with neither, the default.
 */
export const buyerFromLedger = (ledger, ledgerId, { countryNames = [], stateNamesOf = () => [] } = {}) => {
  const rawState = textOf(ledger?.ledeger_state)
  const rawCountry = textOf(ledger?.ledger_country) || (rawState && findStateByName(rawState) ? DEFAULT_COUNTRY : '') || DEFAULT_COUNTRY
  const country = matchName(countryNames, rawCountry)
  const stateNames = stateNamesOf(country)
  const state = stateNames.length > 0 ? matchName(stateNames, rawState) : canonicalStateName(rawState)

  return {
    ledgerId,
    name: textOf(ledger?.ledeger_name),
    phone: textOf(ledger?.ledeger_phone).replace(/\D/g, ''),
    email: textOf(ledger?.ledeger_email),
    address: textOf(ledger?.ledeger_address).slice(0, ADDRESS_MAX_LENGTH),
    website: textOf(ledger?.ledeger_website),
    country,
    state,
    pincode: textOf(ledger?.ledger_pincode).replace(/\D/g, ''),
    gstin: textOf(ledger?.ledeger_gstin).toUpperCase(),
    regType: textOf(ledger?.ledger_gst_reg_type),
  }
}

/** True when the buyer is outside India. */
export const isForeignBuyer = (buyer) => Boolean(textOf(buyer?.country)) && !sameText(buyer.country, DEFAULT_COUNTRY)

/* ------------------------------------------------------------------ */
/* Products and SKUs                                                  */
/* ------------------------------------------------------------------ */

/**
 * Whether a product is kept by SKU: some SKU of it has a code. A product
 * without SKU management is listed with ONE SKU that has no code (see
 * readProducts in Modules/Dashboard/productList) - that one is used silently.
 */
export const isSkuManaged = (product) => Boolean(product?.variants?.some((variant) => variant.skuCode))

/**
 * The value a SKU has in SkuSelector - its product_id as text, else its
 * place. `skuOptionValue` takes the SKU as the API sends it (what SkuSelector
 * is handed, as its `valueOf`); `skuValueOf` the same SKU as readProducts
 * gives it - one rule, so the option chosen is always the SKU found.
 */
export const skuOptionValue = (rawVariant, index) => String(rawVariant?.product_id ?? index)
export const skuValueOf = (variant, index) => skuOptionValue(variant?.source, index)

/** The SKU a line has chosen - or, for a product without SKUs, its only one. */
export const lineVariant = (product, line) => {
  if (!product) return null
  if (!isSkuManaged(product)) return product.variants[0] ?? null
  return product.variants.find((variant, index) => skuValueOf(variant, index) === line.skuValue) ?? null
}

/**
 * A product's value for one of its fields - the SKU's own first, then the
 * product's - under the exact key the product list sends it. These are the
 * keys productList already names (PRODUCT_FIELD, "Selling Rate"); the
 * description, which the list does not name, is read under the "Description"
 * column of the product CSV format and the `description` of a Tally import.
 */
const productValue = (product, variant, keys) => {
  const sources = [variant?.source, product?.source]
  for (const key of keys) {
    const value = savedValue(sources, key)
    if (textOf(value)) return textOf(value)
  }
  return ''
}

const productFields = (product, variant) => ({
  hsn: productValue(product, variant, ['HSN Code']) || textOf(product?.hsn),
  gstRate: productValue(product, variant, ['GST Rate']) || textOf(product?.gstRate),
  per: productValue(product, variant, ['Per Unit']) || textOf(product?.unit),
  rate: productValue(product, variant, ['Selling Rate']),
  description: productValue(product, variant, ['Description', 'description']).slice(0, DESCRIPTION_MAX_LENGTH),
})

/**
 * A line after its product changes. The SKU is cleared and every
 * product-specific value replaced (a missing one with ''), so nothing of the
 * previous product survives; what the user typed that is not about the
 * product - quantity, discount - stays. A product without SKUs is filled in
 * from its one SKU straight away; one with SKUs waits for the SKU.
 */
export const lineFromProduct = (line, product) => {
  const variant = isSkuManaged(product) ? null : (product?.variants[0] ?? null)
  return { ...line, kind: LINE_KIND.PRODUCT, ledgerId: '', productKey: product ? String(product.key) : '', skuValue: '', ...productFields(product, variant) }
}

/** A GST slab as the slab list writes it ("18", "0.25"), from a ledger's gst_rate - '' when it is none of them. */
const slabOf = (value) => {
  const raw = textOf(value)
  if (!raw || !Number.isFinite(Number(raw))) return ''
  return GST_RATES.find((rate) => Number(rate) === Number(raw)) ?? ''
}

/**
 * A service line after its ledger is chosen - filled from that ledger's own
 * record (tally/create-ledger/, the fields the Ledger Form saves):
 *
 *   ledger_sac   -> HSN/SAC
 *   gst_rate     -> GST slab, when it is one of the slabs
 *
 * A field the ledger does not carry is left empty for the user, never
 * guessed. Every product-only value (product, SKU, unit) is cleared; what
 * the user typed that is not about the ledger - quantity, rate, discount,
 * description - stays.
 */
export const lineFromServiceLedger = (line, ledger, ledgerId) => ({
  ...line,
  kind: LINE_KIND.SERVICE,
  ledgerId: ledger ? String(ledgerId) : '',
  productKey: '',
  skuValue: '',
  per: '',
  hsn: textOf(ledger?.ledger_sac).replace(/[^\dA-Za-z]/g, '').slice(0, 10),
  gstRate: slabOf(ledger?.gst_rate),
})

/** A line after its SKU is chosen: the SKU's own values, over the product's. */
export const lineFromSku = (line, product, skuValue) => {
  const updated = { ...line, skuValue }
  return { ...updated, ...productFields(product, lineVariant(product, updated)) }
}

/**
 * The entry form filled in from a row of the buyer's earlier products
 * (invoice/unique-products/ - { "Product Name", sku_code, hsn_sac_code, ... }).
 *
 * The row names the product; it is found in the company's product list by
 * that name (as the list writes it, case aside), so the line carries the same
 * product, unit, rate and GST as one picked from the dropdown. Its SKU is
 * chosen by code when the product is kept by SKU, and its HSN/SAC is the
 * row's. Quantity, discount and the rest are left for the user.
 *
 * -> the new entry, or null when that product is no longer in the list.
 */
export const lineFromExistingProduct = (line, existing, products) => {
  const name = textOf(existing?.['Product Name'] ?? existing?.product_name ?? existing?.Products)
  const product = products.find((candidate) => sameText(candidate.name, name))
  if (!product) return null

  let next = lineFromProduct(line, product)
  const skuCode = textOf(existing?.sku_code)
  if (skuCode && isSkuManaged(product)) {
    const index = product.variants.findIndex((variant) => sameText(variant.skuCode, skuCode))
    if (index >= 0) next = lineFromSku(next, product, skuValueOf(product.variants[index], index))
  }
  const hsn = textOf(existing?.hsn_sac_code ?? existing?.Hsn_code)
  // A GST rate on the row (under the names the product data uses) is the slab
  // it was invoiced at; without one the product's own slab stands.
  const gstRate = textOf(existing?.gst_rate ?? existing?.['GST Rate'])
  return { ...next, ...(hsn ? { hsn } : null), ...(gstRate ? { gstRate } : null) }
}

/**
 * Add Product / Update: the entry form becomes a line of the invoice - a new
 * one, or the line it was loaded from by Edit - and empties for the next.
 * An entry with no product commits nothing, so a second click (the form
 * already empty) can never add a blank or a duplicate line.
 */
export const commitEntryToLines = (form) => {
  if (isServiceLine(form.entry) ? !form.entry.ledgerId : !form.entry.productKey) return form
  const editing = form.editingLineId && form.lines.some((line) => line.id === form.editingLineId)
  const line = { ...form.entry, id: editing ? form.editingLineId : newInvoiceLine().id }
  return {
    ...form,
    lines: editing ? form.lines.map((current) => (current.id === line.id ? line : current)) : [...form.lines, line],
    // The next line is entered as the current mode (Product / Service).
    entry: newInvoiceLine(entryModeOf(form)),
    editingLineId: null,
  }
}

/** "true", true, 1 -> true; anything else -> false - the API sends its flags as text. */
const flagValue = (value) => value === true || value === 1 || textOf(value).toLowerCase() === 'true'

/**
 * invoice/last-document-number/'s answer, applied to the form:
 *
 *   { document_no_f: "INV", document_no_s: 34, document_no_t: "25-26",
 *     auto_increment: "true", with_discount: "false", ... }
 *
 * Auto Increment and With Discount follow the answer; with Auto Increment on,
 * the three number parts are filled from it. A field in `touched` (changed by
 * the user) is left exactly as they made it, and an answer with none of these
 * (an error, "Company not found") changes nothing.
 */
export const withDocumentDefaults = (form, reply, touched = new Set()) => {
  if (!reply || typeof reply !== 'object') return form
  const next = { ...form, document: { ...form.document } }
  const hasNumber = ['document_no_f', 'document_no_s', 'document_no_t'].some((key) => textOf(reply[key]))

  if (reply.auto_increment !== undefined && !touched.has('document.autoIncrement')) {
    next.document.autoIncrement = flagValue(reply.auto_increment)
  }
  if (next.document.autoIncrement && hasNumber && !touched.has('document.invoiceNoParts')) {
    next.document.invoiceNoParts = [textOf(reply.document_no_f), textOf(reply.document_no_s), textOf(reply.document_no_t)]
  }
  if (reply.with_discount !== undefined && !touched.has('withDiscount')) {
    next.withDiscount = flagValue(reply.with_discount)
  }
  return next
}

/* ------------------------------------------------------------------ */
/* CGST + SGST, or IGST                                               */
/* ------------------------------------------------------------------ */

/**
 * WHICH GST APPLIES - worked out from where the parties are, never from the
 * "Same as" boxes:
 *
 *   supplier       the seller's state (its GSTIN's code first, else the state
 *                  chosen); the Dispatched From state only when the seller
 *                  has none
 *   place of supply  the buyer's (bill-to) state, by the same GSTIN-first
 *                  rule. On a bill-to / ship-to sale the goods go to the
 *                  shipping address on the buyer's instruction, and the place
 *                  of supply is the buyer's location (IGST Act s.10(1)(b)), so
 *                  the Shipping To state is used only when the buyer has none.
 *
 *   export (buyer outside India, or Supply Type Export)   IGST
 *   buyer registered as SEZ                               IGST
 *   supplier and place of supply in the same state        CGST + SGST
 *   in different states                                   IGST
 *   either not known yet                                  IGST, until it is -
 *                                                         the earlier screens'
 *                                                         default
 *
 * -> { interState, known, reason }
 */
export const taxTreatment = (form) => {
  if (isForeignBuyer(form.buyer) || form.document.supplyType === SUPPLY_TYPE_EXPORT) {
    return { interState: true, known: true, reason: 'Export - IGST applies' }
  }
  if (sameText(form.buyer.regType, 'SEZ')) {
    return { interState: true, known: true, reason: 'Buyer is an SEZ unit - IGST applies' }
  }

  const supplier = partyStateCode(form.seller) || partyStateCode(effectiveDispatch(form))
  const place = partyStateCode(form.buyer) || partyStateCode(effectiveShipping(form))

  if (!supplier || !place) {
    return {
      interState: true,
      known: false,
      reason: 'Choose the seller and buyer states to settle CGST/SGST or IGST - IGST is shown until then',
    }
  }

  return supplier === place
    ? { interState: false, known: true, reason: 'Seller and buyer are in the same state - CGST + SGST' }
    : { interState: true, known: true, reason: 'Seller and buyer are in different states - IGST' }
}

/* ------------------------------------------------------------------ */
/* Amounts                                                            */
/* ------------------------------------------------------------------ */

/** A typed number, or 0 for nothing / not a number. */
const numberOf = (value) => {
  const number = Number(textOf(value))
  return Number.isFinite(number) ? number : 0
}

/**
 * The rates a GST slab splits into, as numbers, for this sale. The product's
 * `GST Rate` is the WHOLE rate ("18"), as the Product form saves it, and
 * gstBreakdown (Constants/gst) is the one place that halves it. Under reverse
 * charge the buyer pays the tax, so none is charged on the invoice - as the
 * earlier screens did.
 */
const ratesFor = (gstRate, { interState, reverseCharge }) => {
  const split = gstBreakdown(gstRate)
  if (!split || reverseCharge) return { cgst: 0, sgst: 0, igst: 0 }
  return interState
    ? { cgst: 0, sgst: 0, igst: Number(split.igst) }
    : { cgst: Number(split.cgst), sgst: Number(split.sgst), igst: 0 }
}

const taxesOn = (taxablePaise, rates) => ({
  ...rates,
  cgstPaise: percentOf(taxablePaise, rates.cgst),
  sgstPaise: percentOf(taxablePaise, rates.sgst),
  igstPaise: percentOf(taxablePaise, rates.igst),
})

/**
 * One product line's figures. Amount is Quantity x Rate; with discount on,
 * the line's Disc. % comes off that before tax (the earlier screens' rule).
 */
export const lineFigures = (line, { interState, reverseCharge, withDiscount }) => {
  const grossPaise = Math.round((toPaise(line.rate) ?? 0) * numberOf(line.quantity))
  const discountPercent = withDiscount ? Math.min(Math.max(numberOf(line.discount), 0), 100) : 0
  const discountPaise = percentOf(grossPaise, discountPercent)
  const taxablePaise = grossPaise - discountPaise

  return {
    grossPaise,
    discountPercent,
    discountPaise,
    taxablePaise,
    ...taxesOn(taxablePaise, ratesFor(line.gstRate, { interState, reverseCharge })),
  }
}

/** One Other Charges row's figures - its amount and the GST on it. */
export const chargeFigures = (charge, treatment) => {
  const amountPaise = toPaise(charge.amount) ?? 0
  return { amountPaise, ...taxesOn(amountPaise, ratesFor(charge.gstRate, treatment)) }
}

/**
 * ROUND OFF - to the whole rupee, the rule the earlier invoice screen used: a
 * fraction of 49 paise or less rounds down, 50 or more rounds up. In paise,
 * so there is no float tolerance to guess: a total already in whole rupees
 * has no round off at all.
 *
 *   roundOffFor(123449) -> -49     (1,234.49 -> 1,234)
 *   roundOffFor(123450) ->  50     (1,234.50 -> 1,235)
 *   roundOffFor(123400) ->   0
 */
export const roundOffFor = (paise) => {
  const sign = paise < 0 ? -1 : 1
  const fraction = Math.abs(paise) % 100
  if (fraction === 0) return 0
  return sign * (fraction <= 49 ? -fraction : 100 - fraction)
}

/**
 * The overall discount shared out over the lines, in proportion to each
 * line's taxable value - largest remainder, so the shares add up to the
 * discount to the paisa. { [lineId]: paise }
 */
const discountShares = (lines, discountPaise) => {
  const entries = Object.entries(lines).filter(([, row]) => row.taxablePaise > 0)
  const totalPaise = entries.reduce((total, [, row]) => total + row.taxablePaise, 0)
  if (!discountPaise || !totalPaise) return {}
  const exact = entries.map(([id, row]) => ({ id, value: (discountPaise * row.taxablePaise) / totalPaise }))
  const shares = Object.fromEntries(exact.map(({ id, value }) => [id, Math.floor(value)]))
  let left = discountPaise - Object.values(shares).reduce((total, share) => total + share, 0)
  ;[...exact]
    .sort((a, b) => (b.value % 1) - (a.value % 1))
    .forEach(({ id }) => {
      if (left <= 0) return
      shares[id] += 1
      left -= 1
    })
  return shares
}

/**
 * EVERY AMOUNT ON THE INVOICE, in paise:
 *
 *   Total = taxable value of the lines + other charges + all GST
 *           - discount + TCS + round off
 *
 * Two discounts, kept apart - never the same one twice:
 *   a line's Disc. %     a percentage off THAT line only (lineFigures), and
 *                        only while With Discount is ticked - the lines'
 *                        taxable value is already net of it
 *   the Other Charges    one overall amount off the products' taxable value
 *   discount             (after their own discounts), never more than that
 *                        value - whatever the With Discount box says
 *
 * The overall discount comes off BEFORE tax: it is shared out over the lines
 * in proportion to their taxable value (discountShares), and each line's GST
 * is charged on what is left of it - so lines on different slabs are each
 * taxed on their own discounted value. A line keeps its own taxable value
 * (taxablePaise, what it was sold at); netTaxablePaise is that less its share,
 * and the document's taxable value after the discount is netTaxablePaise.
 * Other Charges are not discounted.
 *
 * Round off is worked out last, from everything before it, and only while
 * "Show Round Off" is ticked (roundOffFor) - it may be negative.
 */
export const invoiceFigures = (form) => {
  const tax = taxTreatment(form)
  const options = { interState: tax.interState, reverseCharge: form.settings.reverseCharge, withDiscount: form.withDiscount }

  const ownLines = Object.fromEntries(form.lines.map((line) => [line.id, lineFigures(line, options)]))
  const charges = Object.fromEntries(form.charges.map((charge) => [charge.id, chargeFigures(charge, options)]))

  const sum = (rows, key) => Object.values(rows).reduce((total, row) => total + row[key], 0)

  const taxablePaise = sum(ownLines, 'taxablePaise')
  const discountPaise = Math.min(Math.max(toPaise(form.discount.amount) ?? 0, 0), taxablePaise)
  // Each line taxed on its taxable value less its share of the overall discount.
  const shares = discountShares(ownLines, discountPaise)
  const lines = Object.fromEntries(
    Object.entries(ownLines).map(([id, row]) => {
      const share = shares[id] ?? 0
      const netTaxablePaise = row.taxablePaise - share
      return [id, { ...row, overallDiscountPaise: share, netTaxablePaise, ...taxesOn(netTaxablePaise, { cgst: row.cgst, sgst: row.sgst, igst: row.igst }) }]
    }),
  )
  const chargesPaise = sum(charges, 'amountPaise')
  const cgstPaise = sum(lines, 'cgstPaise') + sum(charges, 'cgstPaise')
  const sgstPaise = sum(lines, 'sgstPaise') + sum(charges, 'sgstPaise')
  const igstPaise = sum(lines, 'igstPaise') + sum(charges, 'igstPaise')
  const gstPaise = cgstPaise + sgstPaise + igstPaise
  const tcsPaise = toPaise(form.tcs.amount) ?? 0
  const beforeRoundOff = taxablePaise + chargesPaise + gstPaise - discountPaise + tcsPaise
  const roundOffPaise = form.settings.roundOff ? roundOffFor(beforeRoundOff) : 0

  return {
    tax,
    lines,
    charges,
    taxablePaise,
    // The products' taxable value after the overall discount - what GST is charged on.
    netTaxablePaise: taxablePaise - discountPaise,
    chargesPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    gstPaise,
    discountPaise,
    tcsPaise,
    roundOffPaise,
    totalPaise: beforeRoundOff + roundOffPaise,
  }
}

/** A rate as text without float noise - 9 -> "9", 2.5 -> "2.5". */
export const rateText = (rate) => String(Number(Number(rate || 0).toFixed(4)))

/**
 * The GST charged, one entry per tax and rate, lines and other charges
 * together, in rate order - CGST and SGST for a sale within the state, IGST
 * across states:
 *
 *   [{ tax: 'CGST', rate: 9, paise: 1809 }, { tax: 'SGST', rate: 9, paise: 1809 }]
 *
 * The preview's "CGST @ 9%" rows and the saved `gst_charges` are both read
 * from this, so the printed tax and the saved tax are the same figures.
 */
export const gstByRate = (figures) => {
  const groups = new Map()
  const add = (tax, rate, paise) => {
    if (!paise) return
    const key = `${tax}|${rate}`
    const group = groups.get(key) ?? { tax, rate, paise: 0 }
    group.paise += paise
    groups.set(key, group)
  }

  ;[...Object.values(figures.lines), ...Object.values(figures.charges)].forEach((row) => {
    add('CGST', row.cgst, row.cgstPaise)
    add('SGST', row.sgst, row.sgstPaise)
    add('IGST', row.igst, row.igstPaise)
  })

  const order = { CGST: 0, SGST: 1, IGST: 2 }
  return [...groups.values()].sort((a, b) => a.rate - b.rate || order[a.tax] - order[b.tax])
}

/** The invoice number as it is saved - Auto Increment's parts joined by "/", blanks left out. */
export const invoiceNumberOf = (document) =>
  document.autoIncrement
    ? document.invoiceNoParts.map(textOf).filter(Boolean).join('/')
    : textOf(document.invoiceNo)

/** The Supply Types a Supply offers. */
export const supplyTypesOf = (supply) => SUPPLY_TYPES[supply] ?? []

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

/*
 * Errors are one flat object, keyed by where the field is:
 *
 *   'seller.email'               a field of a card
 *   'lines.<line id>.quantity'   a field of one product line
 *   'charges.<row id>.amount'    a field of one charge row
 *
 * so a card reads its own with errors['seller.email'] and nothing else.
 */

const checkAddressLength = (found, key, value) => {
  if (textOf(value).length > ADDRESS_MAX_LENGTH) found[key] = `Keep it to ${ADDRESS_MAX_LENGTH} characters`
}

/** The checks every optional contact field gets, only when something is typed. */
export const checkContact = (found, prefix, party) => {
  if (textOf(party.phone) && !isValidPhone(party.phone)) found[`${prefix}.phone`] = 'Enter a valid 10-digit phone number'
  if (textOf(party.email) && !isValidEmail(party.email)) found[`${prefix}.email`] = 'Enter a valid email address'
  if (textOf(party.website) && !isValidWebsite(party.website)) found[`${prefix}.website`] = 'Enter a valid website, e.g. example.com'
  if (textOf(party.gstin) && !isValidGstNumber(party.gstin)) found[`${prefix}.gstin`] = 'Enter a valid 15-character GSTIN'
  checkAddressLength(found, `${prefix}.address`, party.address)
}

/** A dispatch / shipping card's own fields - only checked while it is not "Same as". */
export const checkAddressCard = (found, prefix, party, { indian = true } = {}) => {
  if (textOf(party.gstin) && !isValidGstNumber(party.gstin)) found[`${prefix}.gstin`] = 'Enter a valid 15-character GSTIN'
  if (indian && textOf(party.pincode) && !isValidPincode(party.pincode)) found[`${prefix}.pincode`] = 'Enter a valid 6-digit pincode'
  checkAddressLength(found, `${prefix}.address`, party.address)
}

/**
 * What the invoice backend refuses to save without, for a company with
 * e-invoice / e-way bill switched on (InvoiceDetailsView) - asked here, on the
 * field, rather than learnt from a failed save. Each set applies only while
 * its own box is ticked; with both ticked, both apply.
 *
 *   E-Invoice   Ship To: name, address, pincode
 *   E-Way Bill  Ship To: state, GSTIN; Dispatch From: state, pincode, GSTIN;
 *               Document Details: distance, delivery mode
 *
 * The same table marks those fields required on screen (portalRequiredFields).
 */
const PORTAL_RULES = [
  { setting: 'eInvoice', message: 'Required for e-invoice', shipping: ['name', 'address', 'pincode'], dispatch: [], document: [] },
  {
    setting: 'eWayBill',
    message: 'Required for e-way bill',
    shipping: ['state', 'gstin'],
    dispatch: ['state', 'pincode', 'gstin'],
    document: ['distance', 'deliveryMode'],
  },
]

/** The fields of one card ('shipping' | 'dispatch' | 'document') the ticked settings make required. */
export const portalRequiredFields = (settings, card) =>
  new Set(PORTAL_RULES.filter((rule) => settings?.[rule.setting]).flatMap((rule) => rule[card]))

const checkPortalRequirements = (found, form) => {
  // A challan's Settings are not shown - their requirements do not apply.
  if (isChallan(form)) return
  const values = { dispatch: effectiveDispatch(form), shipping: effectiveShipping(form), document: form.document }
  // While "Same as ..." is ticked the card IS its source, so that is where the field is fixed.
  const keyOf = {
    dispatch: (field) => (form.dispatchSameAsSeller ? `seller.${field}` : `dispatch.${field}`),
    shipping: (field) => (form.shippingSameAsBuyer ? `buyer.${field}` : `shipping.${field}`),
    document: (field) => `document.${field}`,
  }

  PORTAL_RULES.filter((rule) => form.settings[rule.setting]).forEach((rule) => {
    ;['shipping', 'dispatch', 'document'].forEach((card) => {
      rule[card].forEach((field) => {
        const key = keyOf[card](field)
        if (!textOf(values[card][field]) && !found[key]) found[key] = rule.message
      })
    })
  })
}

const validateSellerStep = (form, found) => {
  const { seller } = form
  if (!textOf(seller.name)) found['seller.name'] = 'Seller name is required'
  if (!textOf(seller.state)) found['seller.state'] = 'Select the seller state'
  checkContact(found, 'seller', seller)
  if (textOf(seller.pincode) && !isValidPincode(seller.pincode)) found['seller.pincode'] = 'Enter a valid 6-digit pincode'
  if (textOf(seller.pan) && !isValidPan(seller.pan)) found['seller.pan'] = 'Enter a valid 10-character PAN'

  if (!form.dispatchSameAsSeller) checkAddressCard(found, 'dispatch', form.dispatch)
}

const validateBuyerStep = (form, found) => {
  const { buyer } = form
  const foreign = isForeignBuyer(buyer)

  if (!textOf(buyer.ledgerId)) found['buyer.ledgerId'] = 'Select the buyer'
  if (!textOf(buyer.country)) found['buyer.country'] = 'Select the country'
  if (!foreign && !textOf(buyer.state)) found['buyer.state'] = 'Select the buyer state'
  checkContact(found, 'buyer', buyer)
  if (!foreign && textOf(buyer.pincode) && !isValidPincode(buyer.pincode)) found['buyer.pincode'] = 'Enter a valid 6-digit pincode'

  if (!form.shippingSameAsBuyer) checkAddressCard(found, 'shipping', form.shipping, { indian: !foreign })
}

const validateDocumentStep = (form, found, { allowedTypes }) => {
  const { document } = form
  // Any type with a profile - Sales Invoice's own, or another module's (defineDocumentProfiles).
  const profile = DOCUMENT_PROFILES[form.documentType]
  const label = profile?.label ?? findDocumentType(form.documentType)?.label ?? form.documentType

  if (!profile) found.documentType = 'Select a document type'
  else if (!allowedTypes.includes(form.documentType)) found.documentType = `${label} is not part of this company's plan`

  const number = invoiceNumberOf(document)
  const numberKey = document.autoIncrement ? 'document.invoiceNoParts' : 'document.invoiceNo'
  if (!number) found[numberKey] = documentProfile(form).numberMessage || 'Invoice number is required'
  else if (number.length > INVOICE_NO_MAX_LENGTH) found[numberKey] = `Keep it to ${INVOICE_NO_MAX_LENGTH} characters`

  if (!textOf(document.invoiceDate)) found['document.invoiceDate'] = 'Invoice date is required'
  if (textOf(document.distance) && !(numberOf(document.distance) >= 0)) found['document.distance'] = 'Enter the distance in km'
  // Only the fields this type shows - a Challan's Reference No. / PO No., an
  // invoice's Supply Type (one its Supply offers).
  documentProfile(form).fields.forEach(([key, label, extra]) => {
    if (!extra?.required) return
    if (key === 'supplyType') {
      if (!supplyTypesOf(document.supply).some((option) => option.value === document.supplyType)) {
        found['document.supplyType'] = 'Select a supply type'
      }
    } else if (!textOf(document[key])) found[`document.${key}`] = `${label} is required`
  })
}

/**
 * The checks one line is held to - an added line, or the entry form before
 * Add Product. `key(field)` is where each error goes. A product line needs
 * its product (and SKU); a service line its ledger - the rest is the same.
 */
const checkLine = (found, line, key, { productsByKey, ledgersById, withDiscount, challan = false }) => {
  if (isServiceLine(line)) {
    if (!line.ledgerId) found[key('ledgerId')] = 'Select the service ledger'
    else if (ledgersById && !ledgersById.has(String(line.ledgerId))) found[key('ledgerId')] = 'This ledger is no longer in the list'
  } else {
    const product = productsByKey.get(line.productKey)
    if (!line.productKey) found[key('productKey')] = 'Select a product'
    else if (!product) found[key('productKey')] = 'This product is no longer in the list'
    else if (isSkuManaged(product) && !lineVariant(product, line)) found[key('skuValue')] = 'Select a SKU'
  }

  // The invoice backend refuses a line without an HSN/SAC code.
  if (!textOf(line.hsn)) found[key('hsn')] = 'HSN/SAC is required'
  if (!(numberOf(line.quantity) > 0)) found[key('quantity')] = 'Enter a quantity above 0'
  // A challan carries goods, not prices: no rate, no slab, no discount.
  if (challan) {
    if (isServiceLine(line)) found[key('ledgerId')] = 'A challan takes products only - remove this service'
  } else {
    if (!textOf(line.rate) || !(numberOf(line.rate) >= 0) || !Number.isFinite(Number(line.rate))) {
      found[key('rate')] = 'Enter the rate'
    }
    // The GST slab the invoice taxes this line at - 0 is a real slab, blank is not.
    if (!textOf(line.gstRate)) found[key('gstRate')] = 'Select the GST slab'
  }
  if (!challan && withDiscount && textOf(line.discount)) {
    const percent = Number(line.discount)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) found[key('discount')] = 'Between 0 and 100'
  }
  if (textOf(line.description).length > DESCRIPTION_MAX_LENGTH) {
    found[key('description')] = `Keep it to ${DESCRIPTION_MAX_LENGTH} characters`
  }
}

/** Whether the entry form holds something not yet added to the invoice. */
export const isEntryDirty = (entry) =>
  ['productKey', 'ledgerId', 'hsn', 'quantity', 'rate', 'discount', 'description'].some((field) => textOf(entry?.[field]))

/** What is wrong with the entry form - checked by Add Product. Keys are 'entry.<field>'. */
export const validateEntry = (form, { productsByKey, ledgersById }) => {
  const found = {}
  const withDiscount = applicableForm(form).withDiscount
  checkLine(found, form.entry, (field) => `entry.${field}`, { productsByKey, ledgersById, withDiscount, challan: isChallan(form) })
  return found
}

/**
 * What a charge whose ledger has no SAC number says, by the company's ERP:
 * on Intelligere the SAC can be added here; on Tally it is added in Tally
 * (the ledger is Tally's), or another ledger chosen.
 */
export const missingChargeSacMessage = (erp) =>
  erp === 'tally'
    ? 'This ledger has no SAC number - add it in Tally, or choose a ledger that has one'
    : erp === 'intelligere'
      ? 'This ledger has no SAC number - add it below, or choose a ledger that has one'
      : 'This ledger has no SAC number'

const validateProductsStep = (form, found, { productsByKey, ledgersById, chargeSac }) => {
  const challan = isChallan(form)
  if (form.lines.length === 0) found.lines = documentProfile(form).services ? 'Add at least one product or service' : 'Add at least one product'

  form.lines.forEach((line) => {
    checkLine(found, line, (field) => `lines.${line.id}.${field}`, { productsByKey, ledgersById, withDiscount: form.withDiscount, challan })
  })

  // A line typed in but never added would silently not be invoiced.
  if (isEntryDirty(form.entry)) {
    const service = isServiceLine(form.entry)
    const what = service ? 'service' : 'product'
    found[service ? 'entry.ledgerId' : 'entry.productKey'] = form.editingLineId
      ? `Update this ${what}, or cancel the edit, before saving`
      : `Add this ${what} to the invoice (Add Product), or clear it, before saving`
  }

  // A challan has no Other Details - nothing of them is checked (or saved).
  if (challan) return

  // A charge is saved under its ledger's name (other_details), so one ledger
  // can only be charged once per document.
  const chargeLedgers = new Set()
  form.charges.forEach((charge) => {
    const key = (field) => `charges.${charge.id}.${field}`
    if (!charge.ledgerId) found[key('ledgerId')] = 'Select the ledger'
    else if (chargeLedgers.has(charge.ledgerId)) found[key('ledgerId')] = 'This ledger is already charged above'
    // Sales Invoice saves each charge with its own ledger's SAC (ledger_sac) -
    // a ledger without one cannot be charged (`chargeSac`: { erp }, or absent
    // where the module does not save it).
    else if (chargeSac && ledgersById?.has(String(charge.ledgerId)) && !getLedgerSac(ledgersById.get(String(charge.ledgerId)))) {
      found[key('ledgerId')] = missingChargeSacMessage(chargeSac.erp)
    }
    chargeLedgers.add(charge.ledgerId)
    if (!(numberOf(charge.amount) > 0)) found[key('amount')] = 'Enter an amount above 0'
  })

  /** A ledger + amount section: an amount needs its ledger. */
  const figures = invoiceFigures(form)

  // The Other Charges discount: a valid amount, no more than the products'
  // taxable value, and a ledger once it discounts anything.
  if (textOf(form.discount.amount)) {
    const paise = toPaise(form.discount.amount)
    if (paise === null || paise < 0) found['discount.amount'] = 'Enter a valid amount'
    else if (paise > figures.taxablePaise) found['discount.amount'] = 'More than the products’ taxable value'
    else if (paise > 0 && !form.discount.ledgerId) found['discount.ledgerId'] = 'Select the discount ledger'
  }

  // Round off needs a ledger only when there IS a round off - one this
  // company has: a ledger chosen earlier and since gone (or another
  // company's) would be saved with no name, and the round off left out.
  const roundOffLedger = form.roundOff.ledgerId
  if (figures.roundOffPaise !== 0) {
    if (!roundOffLedger) found['roundOff.ledgerId'] = 'Select the round off ledger'
    else if (ledgersById && !ledgersById.has(String(roundOffLedger))) found['roundOff.ledgerId'] = 'This ledger is no longer in the list'
  }

  // TCS: an amount needs its ledger.
  if (textOf(form.tcs.amount)) {
    const amount = Number(form.tcs.amount)
    if (!Number.isFinite(amount) || amount < 0) found['tcs.amount'] = 'Enter a valid amount'
    if (!form.tcs.ledgerId) found['tcs.ledgerId'] = 'Select the ledger'
  }
}

/** Which step each error key belongs to - by its first part. */
const STEP_OF_PREFIX = {
  seller: INVOICE_STEP.SELLER,
  dispatch: INVOICE_STEP.SELLER,
  buyer: INVOICE_STEP.BUYER,
  shipping: INVOICE_STEP.BUYER,
  // Chosen on the first step, in the card above Seller Details.
  documentType: INVOICE_STEP.SELLER,
  document: INVOICE_STEP.DOCUMENT,
  lines: INVOICE_STEP.PRODUCTS,
  charges: INVOICE_STEP.PRODUCTS,
  entry: INVOICE_STEP.PRODUCTS,
  discount: INVOICE_STEP.PRODUCTS,
  roundOff: INVOICE_STEP.PRODUCTS,
  tcs: INVOICE_STEP.PRODUCTS,
}

const stepOfKey = (key) => STEP_OF_PREFIX[key.split('.')[0]] ?? INVOICE_STEP.PRODUCTS

/**
 * A validator - everything wrong with the form, or only what belongs to one
 * step - with `partyChecks` for the Seller and Buyer steps: Sales Invoice's
 * own (the company sells to a buyer ledger), or another module's (Purchase
 * Invoice buys from a supplier ledger). The Document and Products steps are
 * checked the same way for every module.
 *
 *   context.allowedTypes   the document types this company may make
 *   context.productsByKey  Map of the products, by their key
 */
export const validateFormWith = (partyChecks) => (entered, context, step = null) => {
  const found = {}
  // Only what this document type has is checked (applicableForm).
  const form = applicableForm(entered)

  partyChecks.forEach((check) => check(form, found, context))
  validateDocumentStep(form, found, context)
  validateProductsStep(form, found, context)
  checkPortalRequirements(found, form)

  if (!step) return found
  return Object.fromEntries(Object.entries(found).filter(([key]) => stepOfKey(key) === step))
}

/** Sales Invoice's validator - the company's seller details and a buyer ledger. */
export const validateInvoice = validateFormWith([validateSellerStep, validateBuyerStep])

/** The index of the first step with an error, or -1. */
export const errorStep = (errors) => {
  const steps = new Set(Object.keys(errors).map(stepOfKey))
  return INVOICE_STEPS.findIndex((step) => steps.has(step.key))
}

/**
 * THE SALES INVOICE MODULE'S FIXED LISTS - written down in ONE place.
 *
 * Every option value below is what the invoice backend has always been sent
 * by the earlier Intelligere screens, so a document saved from here reads the
 * same to the e-invoice and e-way bill code as one saved from there. Where the wording on screen differs from the value the
 * backend stores ("Supply Regular" on screen, "supply-Regular" sent), both
 * are listed: `label` is shown, `value` is saved.
 *
 * Nothing here is a business rule - those are in
 * Modules/SalesInvoice/salesInvoiceForm.js - and nothing here is fetched.
 */

/* ------------------------------------------------------------------ */
/* Document types                                                     */
/* ------------------------------------------------------------------ */

/**
 * The documents the module can make, in the order they are offered.
 *
 *   value         what is sent as `doc_type`, and how the backend names it
 *   label         what the user sees
 *   premium       true = only offered when the company's `premium_modules`
 *                 (tally/user-companies-list/) lists it. Invoice is the
 *                 module itself, so it is never held back - exactly as the
 *                 earlier screens did (`opt.value === "Invoice" ? false : ...`).
 *   premiumNames  how `premium_modules` may spell it. Compared without case,
 *                 spaces or punctuation (see hasPremiumModule).

 * Every type is saved the same way, through invoice/business-documents/ with
 * its value as `document_type` (Services/salesInvoiceService).
 */
export const DOCUMENT_TYPE_INVOICE = 'Sales Invoice'

export const DOCUMENT_TYPES = [
  { value: DOCUMENT_TYPE_INVOICE, label: 'Sales Invoice', premium: false },
  { value: 'Challan', label: 'Challan', premium: true, premiumNames: ['Challan'] },
  { value: 'Sales Order', label: 'Sales Order', premium: true, premiumNames: ['Sales Order'] },
  { value: 'Purchase Order', label: 'Purchase Order', premium: true, premiumNames: ['Purchase Order'] },
  { value: 'Credit Note', label: 'Credit Note', premium: true, premiumNames: ['Credit Note'] },
  { value: 'Debit Note', label: 'Debit Note', premium: true, premiumNames: ['Debit Note'] },
  // The backend and the premium list call it "Proforma".
  { value: 'Proforma', label: 'Proforma Invoice', premium: true, premiumNames: ['Proforma', 'Proforma Invoice'] },
  { value: 'Quotation', label: 'Quotation', premium: true, premiumNames: ['Quotation'] },
]

export const findDocumentType = (value) => DOCUMENT_TYPES.find((type) => type.value === value) ?? null

/* ------------------------------------------------------------------ */
/* Challan                                                            */
/* ------------------------------------------------------------------ */

/** The Challan document type (DOCUMENT_TYPES) - every Challan-only rule keys off it. */
export const DOCUMENT_TYPE_CHALLAN = 'Challan'

/**
 * The types that name the invoice they go with - a Challan the invoice its
 * goods go with, a Credit / Debit Note the invoice it adjusts. Their Invoice
 * No. / Invoice Date are saved as `invoice_no` / `invoice_date`.
 */
export const DOCUMENT_TYPES_WITH_INVOICE_REF = [DOCUMENT_TYPE_CHALLAN, 'Credit Note', 'Debit Note']

/** Challan Type - saved as `challan_type`, the name the earlier challan screens used. */
export const CHALLAN_TYPES = ['Permanent', 'Temporary', 'Inward', 'Outward', 'Internal'].map((type) => ({ value: type, label: type }))

/**
 * The copies a challan is printed as - each one the whole challan under its
 * own heading, as the earlier challan PDFs were. Saving asks which to make;
 * they go into ONE PDF, one after another, for the one saved document.
 */
export const CHALLAN_COPIES = [
  { value: 'original', label: 'ORIGINAL FOR CONSIGNEE' },
  { value: 'duplicate', label: 'DUPLICATE FOR TRANSPORTER' },
  { value: 'triplicate', label: 'TRIPLICATE FOR SUPPLIER' },
]

/**
 * The Terms & Conditions printed at the foot of every challan - the wording
 * of the earlier challan PDFs (invoicedoc GenerateChallanPdf), kept as it is.
 */
export const CHALLAN_TERMS = [
  'Our responsibility ceases as soon as the stores leaves our godown.',
  'Delivery under this memo cannot be enforced.',
  'Subject to Ahmedabad Jurisdiction.',
]

/* ------------------------------------------------------------------ */
/* The steps of the form                                              */
/* ------------------------------------------------------------------ */

export const INVOICE_STEP = Object.freeze({
  SELLER: 'seller',
  BUYER: 'buyer',
  DOCUMENT: 'document',
  PRODUCTS: 'products',
})

/** In order - the Stepper draws them as given. */
export const INVOICE_STEPS = [
  { key: INVOICE_STEP.SELLER, title: 'Seller' },
  { key: INVOICE_STEP.BUYER, title: 'Buyer' },
  { key: INVOICE_STEP.DOCUMENT, title: 'Document' },
  { key: INVOICE_STEP.PRODUCTS, title: 'Products & Save' },
]

/* ------------------------------------------------------------------ */
/* Field limits                                                       */
/* ------------------------------------------------------------------ */

/** Seller, buyer, dispatch and shipping addresses. */
export const ADDRESS_MAX_LENGTH = 100

/** A product line's Description of Goods. */
export const DESCRIPTION_MAX_LENGTH = 100

/** The document number - the earlier invoice backend refused anything longer. */
export const INVOICE_NO_MAX_LENGTH = 16

/** The title printed at the top of the document, by type ("Tax Invoice" for an invoice). */
export const documentTitle = (value) =>
  value === DOCUMENT_TYPE_INVOICE ? 'Tax Invoice' : (findDocumentType(value)?.label ?? 'Document')

/* ------------------------------------------------------------------ */
/* Document Details dropdowns                                         */
/* ------------------------------------------------------------------ */

/** `Reason_For_Transportation` - the values the earlier screens saved. */
export const TRANSPORT_REASONS = [
  { value: 'Material supply', label: 'Material Supply' },
  { value: 'product Service', label: 'Product Service' },
  { value: 'Maintenance work', label: 'Maintenance Work' },
  { value: 'free of cost service', label: 'Free of Cost Service' },
  { value: 'Material Return', label: 'Material Return' },
  { value: 'Other', label: 'Others' },
]

/** `Delivery_mode` - read by the e-way bill code, so the values are its own. */
export const DELIVERY_MODES = [
  { value: 'Rail', label: 'Rail' },
  { value: 'Road', label: 'Road' },
  { value: 'Air', label: 'Air' },
  { value: 'Ship', label: 'Ship' },
  { value: 'inTransit', label: 'In Transit' },
]

/** `supply` */
export const SUPPLY = Object.freeze({ INWARD: 'Inward', OUTWARD: 'Outward' })

export const SUPPLY_OPTIONS = [
  { value: SUPPLY.INWARD, label: 'Inward' },
  { value: SUPPLY.OUTWARD, label: 'Outward' },
]

/** `s_type` - the Supply Types each Supply offers. */
export const SUPPLY_TYPE_EXPORT = 'Export'

export const SUPPLY_TYPES = {
  [SUPPLY.INWARD]: [
    { value: 'Import', label: 'Import' },
    { value: 'Purchase', label: 'Purchase' },
    { value: 'Job Work Return', label: 'Job Work Return' },
    { value: 'Sales Return', label: 'Sales Return' },
    { value: 'Others', label: 'Other' },
  ],
  [SUPPLY.OUTWARD]: [
    { value: 'supply-Regular', label: 'Supply Regular' },
    { value: SUPPLY_TYPE_EXPORT, label: 'Export' },
    { value: 'Job Work', label: 'Job Work' },
    { value: 'SKD/CKD', label: 'SKD/CKD' },
    { value: 'Recipient Not Known', label: 'Recipient Not Known' },
    { value: 'Exhibition or Fair', label: 'Exhibition or Fair' },
    { value: 'For Own Use', label: 'For Own Use' },
  ],
}

/** What a new invoice starts on - an ordinary sale. */
export const DEFAULT_SUPPLY = SUPPLY.OUTWARD
export const DEFAULT_SUPPLY_TYPE = 'supply-Regular'

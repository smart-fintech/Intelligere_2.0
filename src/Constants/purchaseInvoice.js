/**
 * THE PURCHASE INVOICE MODULE'S FIXED LISTS - written down in ONE place.
 *
 * The three purchase documents, under the names the backend has always given
 * them (`doc_type` on the earlier screens): each is sent as `document_type`
 * to invoice/business-documents/, invoice/last-document-number/ and
 * invoice/unique-products/, exactly as written here.
 *
 *   value         what is sent as document_type
 *   label         what the user sees
 *   premium       true = only offered when the company's `premium_modules`
 *                 lists it (premiumNames) - as the Sales Invoice types are.
 *                 Purchase Invoice is the module itself and is never held back.
 */

/** The module's entry in `active_modules` - its key in Constants/dashboardModules. */
export const PURCHASE_INVOICE_MODULE = 'Purchase Invoice'

export const PURCHASE_DOCUMENT_TYPE_INVOICE = 'Purchase Invoice'
export const PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN = 'Inbound Challan'
export const PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER = 'Outbound Purchase Order'

export const PURCHASE_DOCUMENT_TYPES = [
  { value: PURCHASE_DOCUMENT_TYPE_INVOICE, label: 'Purchase Invoice', premium: false },
  { value: PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN, label: 'Inbound Challan', premium: true, premiumNames: ['Inbound Challan'] },
  {
    value: PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER,
    label: 'Outbound Purchase Order',
    premium: true,
    premiumNames: ['Outbound Purchase Order'],
  },
]

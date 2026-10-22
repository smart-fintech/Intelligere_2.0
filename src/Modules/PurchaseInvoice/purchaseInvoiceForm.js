/**
 * THE PURCHASE INVOICE FORM - what differs from the Sales Invoice form, and
 * nothing else.
 *
 * A purchase document is the same form as a sale (Modules/SalesInvoice/
 * salesInvoiceForm - Document Details, products, Other Details, figures,
 * checks) with the parties the other way round:
 *
 *   seller   the SUPPLIER - one of the company's ledgers, entered by the user
 *            (choosing the ledger fills in what it holds); the same shape as a
 *            sale's buyer, so the ledger it came from is updated the same way
 *   buyer    the COMPANY - filled in from the company record; the same shape
 *            as a sale's seller, so the company is updated the same way
 *
 * so the supplier's state and the company's settle CGST + SGST or IGST by the
 * same rule. Each purchase type's fields, labels, products and Other Details
 * are its own profile (defineDocumentProfiles), read by the shared form
 * wherever a type's rules are - no sales type is changed by them.
 */

import {
  PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN,
  PURCHASE_DOCUMENT_TYPE_INVOICE,
  PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER,
} from '@/Constants/purchaseInvoice'
import {
  checkAddressCard,
  checkContact,
  createInvoiceForm,
  defineDocumentProfiles,
  isForeignBuyer,
  textOf,
  validateFormWith,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { isValidPan, isValidPincode } from '@/Utils/validation'

/* ------------------------------------------------------------------ */
/* The purchase document types                                        */
/* ------------------------------------------------------------------ */

/**
 * The three purchase documents (see DOCUMENT_PROFILES in salesInvoiceForm
 * for what each key means). None has the company's Settings - its Seller is
 * the supplier - and Round Off follows the company's setting where Other
 * Details has it.
 *
 *   Purchase Invoice          as a Sales Invoice: products and services,
 *                             discounts, GST ledgers, every Other Details section
 *   Inbound Challan           as a Challan: goods only, its own sheet and copies
 *   Outbound Purchase Order   as a Purchase Order: no discounts; Round Off, Note
 *
 * `uploadsFile` (Purchase Invoice, Inbound Challan): no PDF is made from the
 * form - the supplier's own document is chosen in the preview panel and, when
 * there is one, uploaded with the saved document (invoice/save-document-pdf/).
 */
export const PURCHASE_PROFILES = {
  [PURCHASE_DOCUMENT_TYPE_INVOICE]: {
    label: 'Purchase Invoice',
    title: 'Purchase Invoice',
    uploadsFile: true,
    settings: [],
    number: 'Purchase Invoice No.',
    date: 'Purchase Invoice Date',
    numberMessage: 'Purchase Invoice No. is required',
    fields: [
      ['referenceNo', 'Reference No.'],
      ['referenceDate', 'Reference Date'],
      ['poNo', 'PO No.'],
      ['poDate', 'PO Date'],
      ['deliveryNote', 'Delivery Note'],
      ['deliveryNoteDate', 'Delivery Note Date'],
      ['transportReason', 'Reason for Transportation'],
      ['transporter', 'Delivery Transporter'],
      ['termsOfPayment', 'Mode/Terms of Payment'],
      ['freightTerms', 'Freight Terms of Payment'],
      ['lrNo', 'Bill of Lading / LR-RR No.'],
      ['lrDate', 'LR-RR Date'],
      ['vehicleNo', 'Vehicle Number'],
    ],
    services: true,
    discount: true,
    other: ['charges', 'discount', 'tcs', 'roundOff', 'note'],
    gst: true,
  },
  [PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN]: {
    label: 'Inbound Challan',
    title: 'Inbound Challan',
    uploadsFile: true,
    challan: true,
    challanTitle: 'INBOUND CHALLAN',
    challanLabels: ['Inbound Challan No.', 'Inbound Challan Date'],
    settings: [],
    number: 'Inbound Challan No.',
    date: 'Inbound Challan Date',
    numberMessage: 'Inbound Challan No. is required',
    fields: [
      // Required, as on a sales Challan.
      ['referenceNo', 'Reference No. / PO No.', { required: true }],
      ['referenceDate', 'Reference Date / PO Date'],
      ['challanInvoiceNo', 'Invoice No.'],
      ['challanInvoiceDate', 'Invoice Date'],
      ['transportReason', 'Reason for Transportation'],
      // One value: the backend keeps Delivery Transporter and Dispatch Through
      // as the same field (delivery_transporter), printed "Dispatch through".
      ['transporter', 'Delivery Transporter / Dispatch Through'],
      ['freightTerms', 'Freight Terms of Payment'],
      ['lrNo', 'Bill of Lading / LR-RR No.'],
      ['lrDate', 'LR-RR Date'],
      ['vehicleNo', 'Vehicle Number'],
      ['distance', 'Distance (km)'],
      ['deliveryMode', 'Delivery Mode'],
      ['challanType', 'Inbound Challan Type'],
    ],
    services: false,
    discount: false,
    other: [],
    gst: false,
  },
  [PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER]: {
    label: 'Outbound Purchase Order',
    title: 'Outbound Purchase Order',
    settings: [],
    number: 'Outbound Purchase Order No.',
    date: 'Outbound Purchase Order Date',
    numberMessage: 'Outbound Purchase Order No. is required',
    fields: [
      ['referenceNo', 'Reference No.'],
      ['referenceDate', 'Reference Date'],
      ['transporter', 'Dispatch Through'],
      ['termsOfPayment', 'Mode/Terms of Payment'],
      ['freightTerms', 'Freight Terms of Payment'],
    ],
    services: true,
    discount: false,
    other: ['roundOff', 'note'],
    gst: true,
  },
}

defineDocumentProfiles(PURCHASE_PROFILES)

/* ------------------------------------------------------------------ */
/* A new purchase form                                                */
/* ------------------------------------------------------------------ */

/**
 * A new purchase document for the company: the supplier (seller) empty, to
 * be chosen - its country India - and the company as the buyer, from its
 * record. Everything else starts as a new sales form does.
 */
export const createPurchaseForm = (company) => {
  const base = createInvoiceForm(company)
  return {
    ...base,
    documentType: PURCHASE_DOCUMENT_TYPE_INVOICE,
    // The sale's empty buyer ledger is the purchase's supplier...
    seller: base.buyer,
    // ...and the sale's company seller is the purchase's buyer.
    buyer: base.seller,
  }
}

/* ------------------------------------------------------------------ */
/* The Seller and Buyer steps' checks                                 */
/* ------------------------------------------------------------------ */

/** Step 1 - the supplier: its ledger, name, address, state and GSTN; Dispatched From. */
const validateSupplierStep = (form, found) => {
  const { seller } = form
  const foreign = isForeignBuyer(seller)

  if (!textOf(seller.ledgerId)) found['seller.ledgerId'] = 'Select the seller company'
  if (!textOf(seller.country)) found['seller.country'] = 'Select the country'
  if (!textOf(seller.address)) found['seller.address'] = 'Seller address is required'
  if (!textOf(seller.state)) found['seller.state'] = 'Select the seller state'
  checkContact(found, 'seller', seller)
  if (!textOf(seller.gstin)) found['seller.gstin'] = 'Seller GSTN is required'
  if (!foreign && textOf(seller.pincode) && !isValidPincode(seller.pincode)) found['seller.pincode'] = 'Enter a valid 6-digit pincode'

  if (!form.dispatchSameAsSeller) checkAddressCard(found, 'dispatch', form.dispatch, { indian: !foreign })
}

/** Step 2 - the company buying: its name and state; Shipping To. */
const validatePurchaserStep = (form, found) => {
  const { buyer } = form
  if (!textOf(buyer.name)) found['buyer.name'] = 'Buyer name is required'
  if (!textOf(buyer.state)) found['buyer.state'] = 'Select the buyer state'
  checkContact(found, 'buyer', buyer)
  if (textOf(buyer.pincode) && !isValidPincode(buyer.pincode)) found['buyer.pincode'] = 'Enter a valid 6-digit pincode'
  if (textOf(buyer.pan) && !isValidPan(buyer.pan)) found['buyer.pan'] = 'Enter a valid 10-character PAN'

  if (!form.shippingSameAsBuyer) checkAddressCard(found, 'shipping', form.shipping)
}

/** Everything wrong with a purchase form, or one step's (validateFormWith). */
export const validatePurchase = validateFormWith([validateSupplierStep, validatePurchaserStep])

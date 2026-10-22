/**
 * HOW THE PRINTED INVOICE WRITES THINGS - figures, words, dates and the text
 * of the party boxes - with no screen attached. The template
 * (InvoiceTemplate.jsx) reads everything it prints through here, so the
 * on-screen sheet and the PDF captured from it can never word a value two
 * ways.
 *
 *   formatAmount(v)         1234.5 -> "1,234.50" (Indian grouping, always 2 places)
 *   amountInWords(v)        "One Thousand, Two Hundred Thirty-Four Rupees and Fifty Paise Only"
 *   taxAmountInWords(v)     "One Thousand ... And Fifty Paise Only."
 *   formatSheetDate(v)      "2026-10-18" -> "18/10/2026"
 *   sellerLines / partyLines / dispatchLines   a party box's lines
 *   headerMetaRows / transportRows             the header grid's cells
 *
 * A party line is a list of segments, `[{ t: 'GSTIN/UIN : ' }, { t: '24ABC...', b: true }]`,
 * so a value can be bold inside a line without the template building strings.
 */

import { toDocumentDate } from '@/Services/salesInvoiceService'

/* ------------------------------------------------------------------ */
/* Values                                                             */
/* ------------------------------------------------------------------ */

/** Whether a value is worth printing: not null, not blank text, not an empty list. */
export const has = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

const amountFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** An amount as the sheet prints it - "1,00,000.00", never ₹ (the columns say what it is). */
export const formatAmount = (value) => amountFormat.format(round2(value))

/** A date as the sheet prints it - DD/MM/YYYY, the same as the saved document. */
export const formatSheetDate = (value) => toDocumentDate(value)

/* ------------------------------------------------------------------ */
/* Amounts in words - Indian grouping (crore, lakh, thousand)         */
/* ------------------------------------------------------------------ */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const underThousand = (number) => {
  const parts = []
  let rest = number
  if (rest >= 100) {
    parts.push(`${ONES[Math.floor(rest / 100)]} Hundred`)
    rest %= 100
  }
  if (rest >= 20) {
    const ones = ONES[rest % 10]
    parts.push(ones ? `${TENS[Math.floor(rest / 10)]}-${ones}` : TENS[Math.floor(rest / 10)])
    rest = 0
  }
  if (rest > 0) parts.push(ONES[rest])
  return parts.join(' ')
}

/** 1234567 -> "Twelve Lakh, Thirty-Four Thousand, Five Hundred Sixty-Seven". */
export const numberToWords = (value) => {
  let number = Math.floor(Math.abs(Number(value) || 0))
  if (number === 0) return 'Zero'

  const chunks = []
  const crore = Math.floor(number / 10000000)
  if (crore) chunks.push(`${crore >= 1000 ? numberToWords(crore) : underThousand(crore)} Crore`)
  number %= 10000000
  const lakh = Math.floor(number / 100000)
  if (lakh) chunks.push(`${underThousand(lakh)} Lakh`)
  number %= 100000
  const thousand = Math.floor(number / 1000)
  if (thousand) chunks.push(`${underThousand(thousand)} Thousand`)
  number %= 1000
  if (number) chunks.push(underThousand(number))
  return chunks.join(', ')
}

const rupeesAndPaise = (value) => {
  const amount = Math.abs(round2(value))
  const rupees = Math.floor(amount)
  return { rupees, paise: Math.round((amount - rupees) * 100), negative: round2(value) < 0 }
}

/** The invoice total in words. */
export const amountInWords = (value) => {
  const { rupees, paise, negative } = rupeesAndPaise(value)
  const words = `${numberToWords(rupees)} Rupees${paise > 0 ? ` and ${numberToWords(paise)} Paise` : ''} Only`
  return negative ? `Minus ${words}` : words
}

/** The tax total in words, as the tax line of the summary writes it. */
export const taxAmountInWords = (value) => {
  const { rupees, paise } = rupeesAndPaise(value)
  return paise > 0 ? `${numberToWords(rupees)} And ${numberToWords(paise)} Paise Only.` : `${numberToWords(rupees)} Only.`
}

/* ------------------------------------------------------------------ */
/* Party boxes                                                        */
/* ------------------------------------------------------------------ */

const segment = (t, b = false) => ({ t, b })

/** Segment groups joined by a separator, empty groups left out. */
const joinGroups = (groups, separator = ' , ') =>
  groups
    .filter((group) => group && group.length)
    .flatMap((group, index) => (index ? [segment(separator), ...group] : group))

const contactLine = (party, phoneLabel = 'Phone No. : ') =>
  joinGroups([
    has(party.email) ? [segment('Email : '), segment(party.email)] : null,
    has(party.phone) ? [segment(phoneLabel), segment(party.phone)] : null,
  ])

const gstinLine = (party) =>
  joinGroups([
    has(party.gstin) ? [segment('GSTIN/UIN : '), segment(party.gstin, true)] : null,
    has(party.pan) ? [segment('PAN : '), segment(party.pan, true)] : null,
  ])

const stateLine = (party, { codeLabel = ' , Code : ', pinLabel = ' , Pin Code : ' } = {}) => {
  if (!has(party.state)) return []
  const line = [segment('State : '), segment(party.state, true)]
  if (has(party.stateCode)) line.push(segment(codeLabel), segment(party.stateCode, true))
  if (has(party.pincode)) line.push(segment(pinLabel), segment(party.pincode, true))
  return line
}

const present = (lines) => lines.filter((line) => line && line.length)

/** The seller box - the only one with Udyam and Category. */
export const sellerLines = (seller) =>
  present([
    has(seller.address) ? [segment(seller.address)] : null,
    contactLine(seller, 'Phone No. '),
    gstinLine(seller),
    has(seller.udyam) ? [segment('Udyam : '), segment(seller.udyam, true)] : null,
    has(seller.category) ? [segment('Category : '), segment(seller.category)] : null,
    stateLine(seller, { codeLabel: ' Code : ', pinLabel: ' Pin Code : ' }),
    has(seller.website) ? [segment(seller.website)] : null,
  ])

/** The buyer and consignee boxes - PAN beside the GSTIN where the party has one (a purchase document's buyer). */
export const partyLines = (party) =>
  present([
    has(party.address) ? [segment(party.address)] : null,
    contactLine(party),
    gstinLine(party),
    stateLine(party, { pinLabel: ' , Pin : ' }),
    has(party.website) ? [segment(party.website)] : null,
  ])

/** The "Terms of delivery / Dispatch From" box. */
export const dispatchLines = (dispatch) =>
  present([
    has(dispatch.address) ? [segment(dispatch.address)] : null,
    has(dispatch.gstin) ? [segment('GSTIN : '), segment(dispatch.gstin, true)] : null,
    stateLine(dispatch, { pinLabel: ' , Pin : ' }),
  ])

/** The same lines with nothing bold - the seller and buyer boxes print plain. */
export const plainLines = (lines) => lines.map((line) => line.map((part) => ({ ...part, b: false })))

/** A Consignee (Ship to) box is printed only when something was actually entered for it. */
export const hasConsignee = (party) => [party.name, party.address, party.gstin, party.pincode].some(has)

/** A Dispatch From box is printed only when something was actually entered for it. */
export const hasDispatch = (dispatch) => [dispatch.company, dispatch.address, dispatch.gstin, dispatch.pincode].some(has)

/* ------------------------------------------------------------------ */
/* The header grid                                                    */
/* ------------------------------------------------------------------ */

/**
 * Header boxes two to a row. Blank cells are dropped and the ones after them
 * move up, so a half-empty row never stretches one value across the width; an
 * odd last cell is padded by the template so it stays half-width.
 */
const twoUpRows = (cells) => {
  const filled = cells.filter((cell) => has(cell.value))
  const rows = []
  for (let index = 0; index < filled.length; index += 2) rows.push(filled.slice(index, index + 2))
  return rows
}

/** The document details beside the parties, two to a row, blanks removed (twoUpRows). */
export const headerMetaRows = (invoice) =>
  twoUpRows([
    // The type's own labels ("Sales Order No") - an invoice's when not given.
    { label: invoice.numberLabel || 'Invoice No', value: invoice.invoiceNo },
    { label: invoice.dateLabel || 'Invoice Date', value: formatSheetDate(invoice.invoiceDate) },
    // The invoice a Credit / Debit Note adjusts.
    { label: 'Invoice No', value: invoice.linkedInvoiceNo },
    { label: 'Invoice Date', value: formatSheetDate(invoice.linkedInvoiceDate) },
    { label: 'Reference No', value: invoice.referenceNo },
    { label: 'Reference Date', value: formatSheetDate(invoice.referenceDate) },
    { label: 'PO No', value: invoice.poNo },
    { label: 'PO Date', value: formatSheetDate(invoice.poDate) },
    { label: 'Delivery Note', value: invoice.deliveryNote },
    { label: 'Delivery Note Date', value: formatSheetDate(invoice.deliveryNoteDate) },
    { label: 'Reason For Transport', value: invoice.transportReason },
    { label: 'Dispatch Through', value: invoice.dispatchThrough },
    { label: 'Mode/Terms of Payment', value: invoice.paymentTerms },
    { label: 'Freight Terms of Payment', value: invoice.freightTerms },
    { label: 'BL / LR-RR No', value: invoice.lrNo },
    { label: 'LR-RR Date', value: formatSheetDate(invoice.lrDate) },
  ])

/**
 * The transport rows under them, blanks removed: Transporter ID | Vehicle No,
 * then Distance | Supply | Delivery Mode as three boxes of their own.
 */
export const transportRows = (invoice) =>
  [
    [
      { label: 'Transporter ID', value: invoice.transporterId },
      { label: 'Vehicle No', value: invoice.vehicleNo },
    ],
    [
      { label: 'Distance', value: invoice.distance },
      { label: 'Supply', value: invoice.supply },
      { label: 'Delivery Mode', value: invoice.deliveryMode },
    ],
  ]
    .map((row) => row.filter((cell) => has(cell.value)))
    .filter((row) => row.length > 0)

/**
 * A CHALLAN's header boxes, in the order the earlier challan PDFs print them,
 * with only the ones that have a value - blanks are dropped and the rest move
 * up two to a row, as the invoice's (twoUpRows):
 *
 *   Challan No./Delivery No.  | Challan Date/Delivery Date.
 *   Invoice No.               | Invoice Date
 *   Reference No./PO No.      | Reference Date./PO Date.
 *   Reason For Transport      | Freight Terms of Payment
 *   Dispatched Through        | Approx Distance  Delivery Mode   (one box, two values)
 *   Bill of Lading/LR-RR No.  | Motor Vehicle No.
 *   Challan Type
 *
 * Approx Distance and Delivery Mode share a box only when both are given;
 * either alone is a plain box of its own.
 */
export const challanMetaRows = (model) => {
  const { invoice, challan } = model
  const distance = { label: 'Approx Distance', value: invoice.distance }
  const mode = { label: 'Delivery Mode', value: invoice.deliveryMode }
  const distanceAndMode = !has(distance.value) ? mode : has(mode.value) ? { ...distance, pair: mode } : distance

  return twoUpRows([
    { label: challan.numberLabel || 'Challan No./Delivery No.', value: invoice.invoiceNo },
    { label: challan.dateLabel || 'Challan Date/Delivery Date.', value: formatSheetDate(invoice.invoiceDate) },
    { label: 'Invoice No.', value: challan.invoiceNo },
    { label: 'Invoice Date', value: formatSheetDate(challan.invoiceDate) },
    { label: 'Reference No./PO No.', value: invoice.referenceNo },
    { label: 'Reference Date./PO Date.', value: formatSheetDate(invoice.referenceDate) },
    { label: 'Reason For Transport', value: invoice.transportReason },
    { label: 'Freight Terms of Payment', value: invoice.freightTerms },
    { label: 'Dispatched Through', value: invoice.dispatchThrough },
    distanceAndMode,
    { label: 'Bill of Lading/LR-RR No.', value: invoice.lrNo },
    // Only where the type has the field (Inbound Challan) - never on a sales challan.
    { label: 'LR-RR Date', value: formatSheetDate(invoice.lrDate) },
    { label: 'Motor Vehicle No.', value: invoice.vehicleNo },
    { label: 'Challan Type', value: challan.type },
  ])
}

/**
 * A TALLY VOUCHER - read, mapped and turned into what Send to Tally sends.
 * Nothing here draws or asks the server anything:
 *
 *   readVoucher(row)                         a voucher of invoice/tally-vouchers/, under the names the screen uses
 *   resolveVoucher(voucher, choices, refs)   every ledger / product / SKU it names, found (or not) in the company's lists
 *   buildTallyVoucherPayload(...)            the Send to Tally payload, from the voucher and its resolved mapping
 *
 * A voucher is a saved business document, so its fields are read under the
 * names the document was saved with (buildBusinessDocumentPayload):
 *
 *   document_id                     the voucher's own id - every send and delete names it
 *   document_no / document_date     top level, else invoice_master_details
 *   total_taxable_amount, total_amount
 *   doc_pdf                         the document's PDF
 *   buyer_id / buyer_details        the LEDGER side (a sale's buyer, a purchase's supplier)
 *   product_data                    the lines - product_type "Service" is a service (its
 *                                   "Product Name" is its ledger's name), anything else a product
 *   other_details                   Other Charges (each under its ledger's name), discount,
 *                                   tcs, "round off" ({ <ledger name>: amount }), note
 *   gst_charges                     { <slab>: { <GST ledger name>: amount } } (earlier documents:
 *                                   { <GST ledger name>: amount })
 *
 * JSON sent as text is read too, and anything missing is simply empty - a
 * value is never made up. The voucher's own values (names, amounts, taxes)
 * are kept exactly as they came, whatever is mapped: a mapping only says
 * WHICH ledger / product of the company a value belongs to.
 *
 * MAPPING STATUS - every ledger, product and SKU the voucher names is one of
 *   matched   found in the company's lists - by id first, else by its exact name
 *   selected  chosen by the user
 *   missing   the voucher names one the lists do not have - the user must choose
 *   unset     the voucher names none, and one is needed (the account ledger)
 * Nothing is ever picked for the user beyond an exact match.
 */

import { isSkuManaged, skuValueOf } from '@/Modules/SalesInvoice/salesInvoiceForm'
import { getLedgerSac } from '@/Services/ledgerService'
import { OTHER_CHARGES_SOURCE, SERVICE_PRODUCT_TYPE, TALLY_VOUCHER_MODULE, fileUrlOf, toDocumentDate } from '@/Services/salesInvoiceService'

/* ------------------------------------------------------------------ */
/* Reading what the server sent                                       */
/* ------------------------------------------------------------------ */

const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())
const sameText = (a, b) => textOf(a) !== '' && textOf(a).toLowerCase() === textOf(b).toLowerCase()

/** An object the API may send as JSON text - {} for anything else. */
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

/** A number the voucher sent ("3.00", 120, "1,200.50") - null when it sent none, or nothing numeric. */
export const numberOrNull = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean') return null
  const raw = String(value).replace(/,/g, '').trim()
  if (!raw) return null
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}

/** The GST rate a line or charge was taxed at - IGST's, else CGST + SGST - or null when it carries none. */
export const gstRateOf = (row) => {
  const igst = numberOrNull(row?.igst)
  if (igst !== null) return igst
  const cgst = numberOrNull(row?.cgst)
  const sgst = numberOrNull(row?.sgst)
  return cgst === null && sgst === null ? null : (cgst ?? 0) + (sgst ?? 0)
}

/**
 * Which GST a line is taxed with, from its own values - never from a field
 * merely being there (every line may carry cgst, sgst and igst, zeros included):
 *   'igst'       IGST charged - a rate or amount above zero
 *   'cgst_sgst'  CGST / SGST charged - a rate or amount above zero
 *   null         no GST charged (every value missing or zero)
 * A line with both is read as IGST only when CGST / SGST are all zero.
 */
export const lineTaxKind = (row) => {
  const above = (value) => (numberOrNull(value) ?? 0) > 0
  if (above(row?.cgst) || above(row?.sgst) || above(row?.cgstAmount) || above(row?.sgstAmount)) return 'cgst_sgst'
  if (above(row?.igst) || above(row?.igstAmount)) return 'igst'
  return null
}

/** A line's or charge's taxes, as sent: { cgst, sgst, igst, cgstAmount, sgstAmount, igstAmount } - each null when absent. */
const taxesOf = (row) => ({
  cgst: numberOrNull(row?.cgst),
  sgst: numberOrNull(row?.sgst),
  igst: numberOrNull(row?.igst),
  cgstAmount: numberOrNull(row?.cgst_amount),
  sgstAmount: numberOrNull(row?.sgst_amount),
  igstAmount: numberOrNull(row?.igst_amount),
})

/** SKU details as text - "Size: 4x9, Color: Pink" from { Size, Color }, a string as it is. */
export const skuDetailsText = (value) => {
  const details = objectOf(value)
  if (Object.keys(details).length > 0) {
    return Object.entries(details)
      .filter(([, detail]) => textOf(detail))
      .map(([name, detail]) => `${name}: ${textOf(detail)}`)
      .join(', ')
  }
  return typeof value === 'string' && !value.trim().startsWith('{') ? textOf(value) : ''
}

const readLine = (row, index) => ({
  // Its place in product_data - what a choice made for it is kept under.
  index,
  service: sameText(row.product_type, SERVICE_PRODUCT_TYPE),
  name: textOf(row['Product Name'] ?? row.product_name),
  description: textOf(row.Description ?? row.description),
  productId: textOf(row.product_id),
  productType: textOf(row.product_type),
  skuCode: textOf(row.sku_code),
  skuDetails: row.sku_details ?? null,
  hsn: textOf(row.hsn_sac_code),
  quantity: numberOrNull(row.Quantity),
  discount: numberOrNull(row.discount),
  rate: numberOrNull(row['Selling Rate']),
  unit: textOf(row['Per Unit']),
  amount: numberOrNull(row.product_amount),
  ...taxesOf(row),
  // A ledger id the line may carry for its service ledger - used when there.
  ledgerId: textOf(row.ledger_id),
  source: row,
})

/** gst_charges as entries - each slab's ledgers in turn, or the flat { ledger: amount } of an earlier document. */
const readGstCharges = (value) =>
  Object.entries(objectOf(value)).flatMap(([key, entry]) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const slab = textOf(key)
      return Object.entries(entry).map(([ledgerName, amount]) => ({ key: `gst:${slab}:${ledgerName}`, slab, ledgerName: textOf(ledgerName), amount: numberOrNull(amount) }))
    }
    return [{ key: `gst:${key}`, slab: null, ledgerName: textOf(key), amount: numberOrNull(entry) }]
  })

/** Where a charge sits in other_details, and what the screen calls it. */
export const CHARGE_KIND = Object.freeze({
  CHARGE: 'charge',
  DISCOUNT: 'discount',
  TCS: 'tcs',
  ROUND_OFF: 'round_off',
})

const LEDGER_SECTIONS = [
  ['discount', CHARGE_KIND.DISCOUNT, 'Discount'],
  ['tcs', CHARGE_KIND.TCS, 'TCS'],
  ['round off', CHARGE_KIND.ROUND_OFF, 'Round Off'],
]

/**
 * other_details as a list of charges: every Other Charges row (its key is
 * its ledger's name), then the discount, TCS and round off - each one
 * { <its ledger's name>: amount }. The note is not a charge.
 */
const readCharges = (other) => {
  const charges = []
  Object.entries(other).forEach(([key, value]) => {
    if (key === 'note' || LEDGER_SECTIONS.some(([section]) => section === key)) return
    if (value && typeof value === 'object' && !Array.isArray(value) && (value.source === OTHER_CHARGES_SOURCE || 'amount' in value)) {
      const taxes = taxesOf(value)
      // ledgerSac: the SAC saved with the charge (Sales Invoice saves its ledger's) - '' when none.
      charges.push({ key: `charge:${key}`, kind: CHARGE_KIND.CHARGE, label: textOf(key), ledgerName: textOf(key), amount: numberOrNull(value.amount), gstRate: gstRateOf(value), ledgerSac: getLedgerSac(value), ...taxes })
    }
  })
  LEDGER_SECTIONS.forEach(([section, kind, label]) => {
    Object.entries(objectOf(other[section])).forEach(([ledgerName, amount]) => {
      charges.push({ key: `${kind}:${ledgerName}`, kind, label, ledgerName: textOf(ledgerName), amount: numberOrNull(amount), gstRate: null })
    })
  })
  return charges
}

/**
 * The fields the screen and the payload read, from the many a voucher sends:
 *
 *   id, documentType, documentNo, documentDate
 *   taxableAmount, totalAmount     numbers (null when not sent)
 *   pdfUrl                         doc_pdf as a URL the browser opens - null for none
 *   party                          the ledger side: { id, name, details }
 *   seller / buyerDetails          seller_details / buyer_details as sent
 *   shipTo, dispatchFrom, master   ship_to, dispatch_from, invoice_master_details as sent
 *   products, services             the lines (readLine)
 *   charges                        readCharges
 *   gstLedgers                     gst_charges as [{ key, slab, ledgerName, amount }] - read
 *                                  by slab ({ "5": { "<ledger>": 13.5 } }), or flat by ledger
 *                                  ({ "<ledger>": 13.5 }, earlier documents - slab null)
 *   uploadType                     upload_type as sent ("pdf" for a PDF-uploaded voucher - the
 *                                  only kind that can be edited and saved)
 *   note                           other_details.note
 *   narration                      the voucher's narration when it has one, else its note -
 *                                  what the Narration box starts with
 *   source                         the voucher exactly as sent
 */
export const readVoucher = (row) => {
  const master = objectOf(row.invoice_master_details)
  const buyer = objectOf(row.buyer_details)
  const other = objectOf(row.other_details)
  const lines = listOf(row.product_data).filter((line) => line && typeof line === 'object').map(readLine)
  return {
    id: row.document_id ?? null,
    documentType: textOf(row.document_type),
    documentNo: textOf(row.document_no ?? master.document_no),
    documentDate: textOf(row.document_date ?? master.document_date),
    taxableAmount: numberOrNull(row.total_taxable_amount),
    totalAmount: numberOrNull(row.total_amount),
    pdfUrl: fileUrlOf(row.doc_pdf ?? row.doc_PDF),
    party: {
      id: textOf(row.buyer_id ?? buyer.ledger_obj_id),
      name: textOf(row.buyer_name ?? buyer.ledeger_name),
    },
    buyerDetails: buyer,
    sellerDetails: objectOf(row.seller_details),
    shipTo: objectOf(row.ship_to),
    dispatchFrom: objectOf(row.dispatch_from),
    master,
    products: lines.filter((line) => !line.service),
    services: lines.filter((line) => line.service),
    charges: readCharges(other),
    gstLedgers: readGstCharges(row.gst_charges),
    note: textOf(other.note),
    uploadType: textOf(row.upload_type),
    narration: textOf(row.narration ?? other.note),
    source: row,
  }
}

/* ------------------------------------------------------------------ */
/* Mapping                                                            */
/* ------------------------------------------------------------------ */

export const MAPPING_STATUS = Object.freeze({
  MATCHED: 'matched',
  SELECTED: 'selected',
  MISSING: 'missing',
  UNSET: 'unset',
})

const isResolved = (status) => status === MAPPING_STATUS.MATCHED || status === MAPPING_STATUS.SELECTED

/** Item Invoice (the products go with it) or Accounting Invoice (they do not). */
export const INVOICE_MODE = Object.freeze({ ITEM: 'item', ACCOUNTING: 'accounting' })

/**
 * No choice made yet - what a voucher starts with. `narration` null is "not
 * edited" (the voucher's own narration stands); `voucherType` is a
 * voucher_type_name of the company's list; `mode` Item Invoice; `edits` the
 * values typed over the voucher's own:
 *   { lines: { [index]: { [field]: text } }, charges: { [key]: text }, gst: { [key]: text } }
 */
export const EMPTY_CHOICES = Object.freeze({
  account: '',
  party: '',
  lines: {},
  charges: {},
  narration: null,
  voucherType: '',
  mode: INVOICE_MODE.ITEM,
  edits: Object.freeze({ lines: {}, charges: {}, gst: {} }),
})

/**
 * The product fields that can be typed over - each as the line holds it. The
 * name and SKU code are not typed: they are CHOSEN from the product list
 * (choices.lines - see mappedLine).
 */
export const EDITABLE_LINE_FIELDS = Object.freeze(['hsn', 'quantity', 'discount', 'gstRate', 'cgst', 'sgst', 'igst', 'rate', 'unit', 'amount'])
const NUMBER_FIELDS = new Set(['quantity', 'discount', 'rate', 'amount', 'cgst', 'sgst', 'igst'])

/**
 * A line with what was typed over it. Nothing is worked out again (no
 * amount from the rate, no tax from the amount): each value is what was
 * typed. CGST %, SGST % and IGST % are each the rate typed (their amounts
 * stay as sent). "GST %" is the line's whole rate - its IGST, or CGST + SGST halved
 * (`split`: whether the voucher is taxed CGST + SGST when the line carried
 * neither).
 */
const editedLine = (line, edits, split) => {
  if (!edits) return line
  const next = { ...line }
  Object.entries(edits).forEach(([field, value]) => {
    if (!EDITABLE_LINE_FIELDS.includes(field)) return
    if (field === 'gstRate') {
      const rate = numberOrNull(value)
      const halves = line.igst === null && (line.cgst !== null || line.sgst !== null || split)
      next.igst = halves ? null : rate
      next.cgst = halves ? (rate === null ? null : rate / 2) : null
      next.sgst = halves ? (rate === null ? null : rate / 2) : null
    } else next[field] = NUMBER_FIELDS.has(field) ? numberOrNull(value) : textOf(value)
  })
  return next
}

/** The voucher with the user's edits over its own values - what is shown and sent. */
export const editedVoucher = (voucher, edits) => {
  const typed = edits ?? EMPTY_CHOICES.edits
  const split = [...voucher.products, ...voucher.services].some((line) => line.cgst !== null || line.sgst !== null)
  const amountOf = (entry, value) => (value === undefined ? entry : { ...entry, amount: numberOrNull(value) })
  return {
    ...voucher,
    products: voucher.products.map((line) => editedLine(line, typed.lines?.[line.index], split)),
    charges: voucher.charges.map((charge) => amountOf(charge, typed.charges?.[charge.key])),
    gstLedgers: voucher.gstLedgers.map((entry) => amountOf(entry, typed.gst?.[entry.key])),
  }
}

/**
 * What the product details are, from the lines that go with the voucher:
 * "product", "service", "product_service", or "no_product" when none go
 * (an Accounting Invoice with no services).
 */
export const productDetailsTypeOf = ({ products, services }) => {
  if (products > 0 && services > 0) return 'product_service'
  if (products > 0) return 'product'
  if (services > 0) return 'service'
  return 'no_product'
}

/**
 * The company ledger a voucher names - by id first, else by its exact name
 * (case and outer spaces aside). '' when none is found.
 *   ledgers   { byId: Map, named: [{ id, name }] } - useInvoiceReferenceData's
 */
export const findLedgerId = (ledgers, { id, name }) => {
  const byId = textOf(id)
  if (byId && ledgers.byId.has(byId)) return byId
  return ledgers.named.find((ledger) => sameText(ledger.name, name))?.id ?? ''
}

const ledgerNameOf = (ledgers, id) => textOf(ledgers.byId.get(textOf(id))?.ledeger_name)

/**
 * One ledger slot: the user's choice when there is one (and it is still a
 * ledger of this company), else the exact match, else missing / unset.
 */
const ledgerSlot = (ledgers, chosen, expected) => {
  const chosenId = textOf(chosen)
  if (chosenId && ledgers.byId.has(chosenId)) return { status: MAPPING_STATUS.SELECTED, ledgerId: chosenId, ledgerName: ledgerNameOf(ledgers, chosenId) }
  if (!expected || (!textOf(expected.id) && !textOf(expected.name))) return { status: MAPPING_STATUS.UNSET, ledgerId: '', ledgerName: '' }
  const found = findLedgerId(ledgers, expected)
  return found
    ? { status: MAPPING_STATUS.MATCHED, ledgerId: found, ledgerName: ledgerNameOf(ledgers, found) }
    : { status: MAPPING_STATUS.MISSING, ledgerId: '', ledgerName: '' }
}

/**
 * A product line, matched in the company's product list (readProducts) -
 * Product Name first, then its SKU Code under THAT product only:
 *
 *   1. the product of exactly the line's name (case and outer spaces aside);
 *      none -> not matched
 *   2. its SKU of exactly the line's sku_code - only among that product's own
 *      SKUs (a SKU of another product is never taken, whatever its code). A
 *      product kept without SKUs matches a line with no SKU code.
 *
 * Both must match, or neither is mapped (`reason` says which failed:
 * 'product' - no product of that name, 'sku' - the product is there but not
 * with that SKU code). The user's choice ({ productKey, skuValue }) stands
 * over all of it.
 * -> { status, skuStatus, reason, product, variant, productKey, skuValue }
 */
const productSlot = (products, line, chosen) => {
  const choice = chosen && typeof chosen === 'object' ? chosen : null
  const chosenProduct = choice?.productKey ? products.find((product) => String(product.key) === String(choice.productKey)) : null
  if (chosenProduct) {
    const skuManaged = isSkuManaged(chosenProduct)
    const index = skuManaged ? chosenProduct.variants.findIndex((variant, at) => skuValueOf(variant, at) === choice.skuValue) : 0
    const variant = index >= 0 ? (chosenProduct.variants[index] ?? null) : null
    return {
      status: MAPPING_STATUS.SELECTED,
      skuStatus: !skuManaged ? MAPPING_STATUS.MATCHED : variant ? MAPPING_STATUS.SELECTED : MAPPING_STATUS.UNSET,
      reason: null,
      product: chosenProduct,
      variant,
      productKey: String(chosenProduct.key),
      skuValue: variant && skuManaged ? choice.skuValue : '',
    }
  }

  const notMapped = (reason) => ({ status: MAPPING_STATUS.MISSING, skuStatus: MAPPING_STATUS.MISSING, reason, product: null, variant: null, productKey: '', skuValue: '' })

  // 1. Product Name
  const product = products.find((candidate) => sameText(candidate.name, line.name))
  if (!product) return notMapped('product')

  // 2. SKU Code - under this product only
  if (!isSkuManaged(product)) {
    if (textOf(line.skuCode)) return notMapped('sku')
    return { status: MAPPING_STATUS.MATCHED, skuStatus: MAPPING_STATUS.MATCHED, reason: null, product, variant: product.variants[0] ?? null, productKey: String(product.key), skuValue: '' }
  }
  const index = textOf(line.skuCode) ? product.variants.findIndex((variant) => sameText(variant.skuCode, line.skuCode)) : -1
  if (index < 0) return notMapped('sku')
  return { status: MAPPING_STATUS.MATCHED, skuStatus: MAPPING_STATUS.MATCHED, reason: null, product, variant: product.variants[index], productKey: String(product.key), skuValue: skuValueOf(product.variants[index], index) }
}

/** Whether a line's product AND its SKU are mapped (matched or chosen) - a product kept without SKUs needs none. */
export const isProductMapped = (slot) => Boolean(slot.product) && (!isSkuManaged(slot.product) || Boolean(slot.variant))

/**
 * A product line as the product list maps it - only its Product Name, SKU
 * Code and SKU Details (product_details' product_name, sku_code,
 * sku_details), all three from the product list: the product's name, and
 * its SKU's code and sku_details. Nothing else of the line - product_id,
 * HSN/SAC, quantity, rate, unit, discount, GST, amount - is touched: those
 * stay the voucher's own (or what was typed over them).
 *
 *   mapped                 the product's name, the SKU's code and details
 *   product chosen, SKU not yet
 *                          the product's name and no SKU (the voucher's SKU
 *                          belongs to whatever product it was, never this one)
 *   not mapped             the voucher's own values, shown as they came (and
 *                          the voucher cannot be sent until it is mapped)
 */
const mappedLine = (line, slot) => {
  if (!slot.product) return line
  if (!isProductMapped(slot)) return { ...line, name: slot.product.name, skuCode: '', skuDetails: null }
  return {
    ...line,
    name: slot.product.name,
    skuCode: slot.variant?.skuCode ?? '',
    skuDetails: slot.variant ? Object.fromEntries(slot.variant.skuDetails) : {},
  }
}

/**
 * What choosing a product for a line keeps: the product, and - when it is
 * kept by SKU - the SKU of exactly the code the line already shows, if it
 * has one; otherwise its SKU is left to choose (none is picked for the user).
 * -> { productKey, skuValue }, the value of choices.lines[index].
 */
export const productChoice = (product, skuCode) => {
  if (!product) return { productKey: '', skuValue: '' }
  const index = isSkuManaged(product) && textOf(skuCode) ? product.variants.findIndex((variant) => sameText(variant.skuCode, skuCode)) : -1
  return { productKey: String(product.key), skuValue: index >= 0 ? skuValueOf(product.variants[index], index) : '' }
}

/**
 * Every SKU the product list has, with the product it belongs to - for a
 * line whose product is not found: choosing one of them chooses its product
 * too, so a SKU is never mapped to a product it does not belong to.
 *   [{ value: "<product key>::<sku value>", product, variant, skuValue }]
 */
export const allSkusOf = (products) =>
  products.filter(isSkuManaged).flatMap((product) =>
    product.variants.map((variant, index) => ({
      value: `${product.key}::${skuValueOf(variant, index)}`,
      product,
      variant,
      skuValue: skuValueOf(variant, index),
    })),
  )

const round2 = (value) => Math.round(value * 100) / 100

/**
 * gst_charges' entries, merged by the LEDGER each is mapped to: entries mapped
 * (found or chosen) to the same company ledger - the same ledger id, never a
 * similar name - become one, their amounts added; anything else stays apart
 * (a CGST and an SGST ledger, two slabs on different ledgers, an entry not
 * mapped yet). The voucher's own slab-wise entries are left as they are.
 *
 *   -> [{ key, ledgerId, ledgerName, status, slots, slabs, sourceNames, amount }]
 *      key      one entry: its own key (its typed amount is that entry's);
 *               merged: "merged:" + the entries' keys - a total typed for it
 *               stands for the group, and goes when the group changes
 *      amount   the entries' amounts added (each as sent, or as typed), or
 *               the total typed for the group
 *   gstEdits   edits.gst - { [key]: text }
 */
export const groupGstByLedger = (gst, gstEdits = {}) => {
  const groups = []
  gst.forEach((slot) => {
    const mappedTo = isResolved(slot.status) ? slot.ledgerId : ''
    const group = mappedTo ? groups.find((entry) => entry.ledgerId === mappedTo) : null
    if (group) group.slots.push(slot)
    else groups.push({ ledgerId: mappedTo, ledgerName: slot.ledgerName, status: slot.status, slots: [slot] })
  })
  return groups.map((group) => {
    const merged = group.slots.length > 1
    const key = merged ? `merged:${group.slots.map((slot) => slot.entry.key).join('|')}` : group.slots[0].entry.key
    const amounts = group.slots.map((slot) => slot.entry.amount).filter((amount) => amount !== null)
    const typed = merged ? gstEdits?.[key] : undefined
    return {
      ...group,
      key,
      slabs: [...new Set(group.slots.map((slot) => slot.entry.slab).filter((slab) => slab !== null))],
      sourceNames: [...new Set(group.slots.map((slot) => slot.entry.ledgerName))],
      amount: typed !== undefined ? numberOrNull(typed) : amounts.length ? round2(amounts.reduce((total, amount) => total + amount, 0)) : null,
    }
  })
}

/**
 * Every mapping a voucher needs, as it stands now:
 *
 *   account    the Sales / Purchase account ledger - the voucher names none,
 *              so it is the user's to choose (needed when it has products;
 *              a service line carries its own ledger)
 *   party      the ledger side's ledger - buyer_id, else its name
 *   products   [{ line, sourceLine, ...productSlot }] - each line's product and SKU,
 *              matched by name then SKU code (productSlot) or chosen in Product
 *              Details; `line` is the line as it maps (mappedLine), `sourceLine`
 *              as the voucher has it. On an Item Invoice, a line whose product
 *              and SKU are not both mapped stops the send (a problem)
 *   services   [{ line, ...ledgerSlot }] - the ledger named by the line
 *   charges    [{ charge, ...ledgerSlot }] - the ledger each is under
 *   gst        [{ entry, ...ledgerSlot }] - gst_charges' ledgers, one per slab and ledger
 *   gstGroups  the same, merged by the company ledger each is mapped to (groupGstByLedger) -
 *              what the GST Charges table shows and the Tally payload sends
 *   voucher    the voucher with the user's edits (editedVoucher) - what is shown and sent
 *   mode       Item Invoice or Accounting Invoice (INVOICE_MODE)
 *   narration  the Narration box - the user's text, else the voucher's own
 *   voucherType  the voucher type picked, when it is one of `voucherTypes`; else
 *              the document type's default (`defaultVoucherType`) - the one
 *              thing picked for the user, and only when Tally has it;
 *              none is ever picked for the user
 *   problems   what still stops Send to Tally / Verified, in words - [] when nothing
 *
 *   choices    { account, party, lines: { [index]: ledgerId | { productKey, skuValue } },
 *                charges: { [key]: ledgerId }, narration, voucherType, mode, edits }
 *   refs       { ledgers, products, accountLabel, voucherTypes, defaultVoucherType } -
 *              voucherTypes every voucher_type_name of tally/voucher-list/ (null
 *              while unknown); defaultVoucherType the document type's default
 *              as Tally names it (defaultVoucherTypeFor), '' when it has none
 */
export const resolveVoucher = (sourceVoucher, choices, { ledgers, products, accountLabel = 'Account', voucherTypes = null, defaultVoucherType = '' }) => {
  const picked = { ...EMPTY_CHOICES, ...(choices ?? {}) }
  const edited = editedVoucher(sourceVoucher, picked.edits)
  const mode = picked.mode === INVOICE_MODE.ACCOUNTING ? INVOICE_MODE.ACCOUNTING : INVOICE_MODE.ITEM
  const narration = typeof picked.narration === 'string' ? picked.narration : edited.narration
  const voucherType = !voucherTypes
    ? ''
    : voucherTypes.includes(picked.voucherType)
      ? picked.voucherType
      : voucherTypes.includes(defaultVoucherType)
        ? defaultVoucherType
        : ''
  const account = ledgerSlot(ledgers, picked.account, null)
  const party = ledgerSlot(ledgers, picked.party, edited.party)
  // Each product line found (or chosen) in the product list, and shown / sent as it maps (mappedLine).
  const productRows = edited.products.map((line) => {
    const slot = productSlot(products, line, picked.lines?.[line.index])
    return { ...slot, line: mappedLine(line, slot), sourceLine: line }
  })
  const voucher = { ...edited, products: productRows.map((row) => row.line) }
  const services = voucher.services.map((line) => ({ line, ...ledgerSlot(ledgers, picked.lines?.[line.index], { id: line.ledgerId, name: line.name }) }))
  const charges = voucher.charges.map((charge) => ({ charge, ...ledgerSlot(ledgers, picked.charges?.[charge.key], { name: charge.ledgerName }) }))
  const gst = voucher.gstLedgers.map((entry) => ({ entry, ...ledgerSlot(ledgers, picked.charges?.[entry.key], { name: entry.ledgerName }) }))
  const gstGroups = groupGstByLedger(gst, picked.edits?.gst)

  const problems = []
  if (!voucherType) problems.push(voucherTypes && voucherTypes.length === 0 ? 'Tally has no voucher types.' : 'Select the voucher type.')
  if (voucher.id === null || voucher.id === undefined || textOf(voucher.id) === '') problems.push('The voucher has no document_id.')
  if (voucher.products.length > 0 && !isResolved(account.status)) problems.push(`Select the ${accountLabel} ledger.`)
  if (!isResolved(party.status)) problems.push(voucher.party.name ? `Ledger "${voucher.party.name}" is not in the ledger list - select the party ledger.` : 'Select the party ledger.')
  if (mode === INVOICE_MODE.ITEM) {
    productRows.forEach((slot) => {
      if (isProductMapped(slot)) return
      const name = slot.sourceLine.name || '(no name)'
      problems.push(
        slot.product
          ? `Select the SKU of "${slot.product.name}" (product line ${slot.sourceLine.index + 1}).`
          : slot.reason === 'sku'
            ? `Product "${name}" has no SKU "${slot.sourceLine.skuCode}" in the product list - select the product and its SKU.`
            : `Product "${name}" is not in the product list - select the product and its SKU.`,
      )
    })
  }
  services.forEach(({ line, status }) => {
    if (!isResolved(status)) problems.push(`Service ledger "${line.name || '(no name)'}" is not in the ledger list - select one.`)
  })
  charges.forEach(({ charge, status }) => {
    if (!isResolved(status)) problems.push(`${charge.label} ledger "${charge.ledgerName}" is not in the ledger list - select one.`)
  })
  gst.forEach(({ entry, status }) => {
    if (!isResolved(status)) problems.push(`GST ledger "${entry.ledgerName}" is not in the ledger list - select one.`)
  })

  return { voucher, mode, account, party, products: productRows, services, charges, gst, gstGroups, narration, voucherType, problems }
}

/* ------------------------------------------------------------------ */
/* Edit: what changed, for invoice/edit-document/                       */
/* ------------------------------------------------------------------ */

/** Whether a voucher can be edited and saved - its upload_type is exactly "pdf", as the API sent it. */
export const canEditVoucher = (voucher) => voucher?.source?.upload_type === 'pdf'

/**
 * A product field: the line's name for it, and the key product_data sends it
 * under (the row's own key when it has one of the names, else the first).
 */
const PRODUCT_EDIT_FIELDS = [
  ['name', ['Product Name', 'product_name']],
  ['skuCode', ['sku_code']],
  ['skuDetails', ['sku_details']],
  ['hsn', ['hsn_sac_code']],
  ['quantity', ['Quantity', 'quantity']],
  ['discount', ['discount']],
  ['cgst', ['cgst']],
  ['sgst', ['sgst']],
  ['igst', ['igst']],
  ['rate', ['Selling Rate']],
  ['unit', ['Per Unit']],
  ['amount', ['product_amount']],
]

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** A value in the type the voucher sent the field in - text stays text ("311.46"), a number a number. */
const likeSent = (sent, value) => {
  if (value === null || value === undefined) return value ?? null
  if (typeof sent === 'string' && typeof value === 'number') return String(value)
  return value
}

/** other_details with each charge under the ledger it is mapped to now, and its amount as it is now. */
const otherDetailsAfter = (voucher, mapping) => {
  const other = { ...objectOf(voucher.source.other_details) }
  const sections = {}
  mapping.charges.forEach(({ charge, ledgerName }) => {
    const name = ledgerName || charge.ledgerName
    if (charge.kind === CHARGE_KIND.CHARGE) {
      const original = objectOf(other[charge.ledgerName])
      delete other[charge.ledgerName]
      other[name] = { ...original, amount: likeSent(original.amount, charge.amount) }
      return
    }
    const section = LEDGER_SECTIONS.find(([, kind]) => kind === charge.kind)[0]
    const sent = objectOf(voucher.source.other_details)[section] ?? {}
    sections[section] = { ...sections[section], [name]: likeSent(objectOf(sent)[charge.ledgerName], charge.amount) }
  })
  return { ...other, ...sections }
}

/** gst_charges with each tax under the ledger it is mapped to now - slab-wise when the voucher's were. */
const gstChargesAfter = (mapping) => {
  const gst = {}
  mapping.gst.forEach(({ entry, ledgerName }) => {
    const name = ledgerName || entry.ledgerName
    const amount = entry.amount ?? 0
    if (entry.slab === null) {
      gst[name] = Math.round(((gst[name] ?? 0) + amount) * 100) / 100
      return
    }
    const slab = { ...(gst[entry.slab] ?? {}) }
    slab[name] = Math.round(((slab[name] ?? 0) + amount) * 100) / 100
    gst[entry.slab] = slab
  })
  return gst
}

/**
 * WHAT AN EDIT CHANGED - the body of invoice/edit-document/, from the voucher
 * as it was when Edit was pressed (`before`) and as it is now (`after`), both
 * resolveVoucher's. Only what changed is in it; nothing unchanged is sent
 * again, and nothing is ever blanked:
 *
 *   document_id        always - which voucher
 *   narration          the Narration box
 *   voucher_type       the Voucher Type
 *   account_ledger     the Sales / Purchase ledger's name (as the voucher update sends it)
 *   buyer_id, buyer_name   the party ledger, when another is chosen
 *   other_details      the whole object, when a charge's ledger or amount changed -
 *                      each charge under the ledger now mapped, with its amount
 *   gst_charges        the whole object, when a GST ledger or amount changed -
 *                      slab-wise as the voucher sent it, each tax under its ledger
 *   product_details    [{ product_id, ...changed fields }] - only the lines that
 *                      changed, each named by its own product_id and carrying
 *                      only its changed fields, under product_data's own keys
 *                      ("Product Name", sku_code, sku_details, hsn_sac_code,
 *                      Quantity, discount, cgst, sgst, igst, "Selling Rate",
 *                      "Per Unit", product_amount)
 *
 * -> { payload, missingIds }: payload null when nothing changed; missingIds the
 *    product line numbers that changed but have no product_id to name them by
 *    (such a voucher cannot be saved).
 */
export const buildVoucherEditPayload = ({ voucher, before, after }) => {
  const payload = { document_id: voucher.id }
  if (after.narration !== before.narration) payload.narration = after.narration
  if (after.voucherType !== before.voucherType) payload.voucher_type = after.voucherType
  if (after.account.ledgerId !== before.account.ledgerId) payload.account_ledger = after.account.ledgerName || null
  if (after.party.ledgerId !== before.party.ledgerId && after.party.ledgerId) {
    payload.buyer_id = numberOrNull(after.party.ledgerId) ?? after.party.ledgerId
    payload.buyer_name = after.party.ledgerName
  }

  const chargeChanged = after.charges.some((slot, index) => {
    const was = before.charges[index]
    return !was || slot.ledgerId !== was.ledgerId || !sameValue(slot.charge.amount, was.charge.amount)
  })
  if (chargeChanged) payload.other_details = otherDetailsAfter(voucher, after)

  const gstChanged = after.gst.some((slot, index) => {
    const was = before.gst[index]
    return !was || slot.ledgerId !== was.ledgerId || !sameValue(slot.entry.amount, was.entry.amount)
  })
  if (gstChanged) payload.gst_charges = gstChargesAfter(after)

  const rows = listOf(voucher.source.product_data).filter((row) => row && typeof row === 'object')
  const missingIds = []
  const productDetails = []
  after.products.forEach((slot, index) => {
    const was = before.products[index]?.line ?? slot.sourceLine
    const now = slot.line
    const row = rows[slot.sourceLine.index] ?? {}
    const changed = {}
    PRODUCT_EDIT_FIELDS.forEach(([field, keys]) => {
      if (sameValue(now[field], was[field])) return
      const key = keys.find((name) => name in row) ?? keys[0]
      changed[key] = field === 'skuDetails' ? now[field] ?? null : likeSent(row[key], now[field])
    })
    if (Object.keys(changed).length === 0) return
    if (row.product_id === undefined || row.product_id === null || textOf(row.product_id) === '') {
      missingIds.push(slot.sourceLine.index + 1)
      return
    }
    productDetails.push({ product_id: row.product_id, ...changed })
  })
  if (productDetails.length > 0) payload.product_details = productDetails

  return { payload: Object.keys(payload).length > 1 ? payload : null, missingIds }
}

/* ------------------------------------------------------------------ */
/* The Send to Tally payload                                          */
/* ------------------------------------------------------------------ */

const ledgerRef = (slot) => ({ ledger_id: numberOrNull(slot.ledgerId) ?? (slot.ledgerId || null), ledger_name: slot.ledgerName || null })

const taxPayload = (row) => ({
  cgst: row.cgst,
  sgst: row.sgst,
  igst: row.igst,
  cgst_amount: row.cgstAmount,
  sgst_amount: row.sgstAmount,
  igst_amount: row.igstAmount,
})

/** The first of `keys` any of `records` carries (in that order), as text - null when none does. */
const firstText = (records, keys) => {
  for (const record of records) {
    for (const key of keys) {
      const value = textOf(record?.[key])
      if (value) return value
    }
  }
  return null
}

/** A party's fields, under each name the company record (comp_*), a ledger record (ledeger_*) or a saved address may use. */
const PARTY_FIELDS = {
  name: ['comp_name', 'ledeger_name', 'name'],
  gstin: ['comp_gstin', 'ledeger_gstin', 'ledger_gstin', 'gstin', 'gst_no'],
  state: ['comp_state', 'ledeger_state', 'ledger_state', 'state', 'statename'],
  pincode: ['pincode', 'ledger_pincode', 'ledeger_pincode', 'comp_pincode'],
  address: ['comp_address', 'ledeger_address', 'ledger_address', 'address'],
}

const partyOf = (records, name) => ({
  name: name || firstText(records, PARTY_FIELDS.name),
  gstin: firstText(records, PARTY_FIELDS.gstin),
  state: firstText(records, PARTY_FIELDS.state),
  pincode: firstText(records, PARTY_FIELDS.pincode),
  address: firstText(records, PARTY_FIELDS.address),
})

/** The document types that CREDIT the party with the total (a purchase, a sales return) - every other type debits it. */
const PARTY_CREDITED_TYPES = Object.freeze(['Purchase Invoice', 'Credit Note'])

/**
 * Voucher_amount_dr / Voucher_amount_cr - the total on the party's side, the
 * taxable value on the account's: a Sales Invoice or Debit Note debits the
 * party (dr = total_amount, cr = total_taxable_amount); a Purchase Invoice or
 * Credit Note credits it (cr = total_amount, dr = total_taxable_amount).
 */
export const voucherAmountsOf = (voucher) =>
  PARTY_CREDITED_TYPES.some((type) => sameText(type, voucher.documentType))
    ? { Voucher_amount_cr: voucher.totalAmount, Voucher_amount_dr: voucher.taxableAmount }
    : { Voucher_amount_cr: voucher.taxableAmount, Voucher_amount_dr: voucher.totalAmount }

/**
 * gst_charges as Tally takes it - by GST slab, then by the ledger each tax is
 * mapped to (found or chosen), its amount as it is now:
 *   { "5": { "Output CGST 2.5%": 13.5, "Output SGST 2.5%": 13.5 }, "18": { "Output IGST 18%": 90 } }
 * Slabs never merge; one ledger twice in a slab is added up. An entry with no
 * amount (or 0) is not sent. An earlier document's flat entry (no slab) stays
 * flat - { "<ledger>": amount } - as no slab is made up for it.
 */
export const tallyGstCharges = (gst) => {
  const charges = {}
  gst.forEach(({ entry, ledgerName }) => {
    if (!entry.amount) return
    const name = ledgerName || entry.ledgerName
    if (entry.slab === null) {
      charges[name] = round2((charges[name] ?? 0) + entry.amount)
      return
    }
    const slab = { ...(charges[entry.slab] ?? {}) }
    slab[name] = round2((slab[name] ?? 0) + entry.amount)
    charges[entry.slab] = slab
  })
  return charges
}

/**
 * THE SEND TO TALLY PAYLOAD - sent over the WebSocket as { payload } (the
 * envelope of every Tally message):
 *
 *   {
 *     module_name: "invoice_voucher_create",       TALLY_VOUCHER_MODULE
 *     company_name: "<the active company>",
 *     document_id: 124837,                       the voucher's own document_id
 *     data: [{
 *       Voucher_amount_cr, Voucher_amount_dr     the total and the taxable value (voucherAmountsOf)
 *       narration, voucher_type                  the Narration box, the voucher type chosen
 *       account_ledger                           the Sales / Purchase ledger chosen - its name
 *       document_type, document_date (DD/MM/YYYY), document_no
 *       seller_name, seller_gstin, seller_state, seller_pincode, seller_address,
 *       buyer_name, buyer_gstin, buyer_state, buyer_pincode, buyer_address
 *                                                the company side from seller_details, else
 *                                                the company record; the ledger side named by
 *                                                its mapped ledger, its details from
 *                                                buyer_details and that ledger's record (the
 *                                                flow's `parties` says which side is which)
 *       ship_to, dispatch_from, document_details as the voucher sent them
 *       product_details_type                     "product" | "service" | "product_service" |
 *                                                "no_product" (productDetailsTypeOf)
 *       product_details: [                       in the voucher's own line order
 *         product: { product_name, description, product_type, product_id, sku_code,
 *                    sku_details, hsn_sac_code, quantity, unit, rate, discount,
 *                    cgst, sgst, igst, cgst_amount, sgst_amount, igst_amount, amount }
 *                    - product_name, sku_code and sku_details the mapped product's and
 *                    SKU's; Item Invoice only (an Accounting Invoice sends no products)
 *         service: { service_name, description, product_type, hsn_sac_code, quantity,
 *                    rate, discount, <the taxes>, amount, ledger_id, ledger_name }
 *       ]
 *       other_details: [{ type: "charge" | "discount" | "tcs" | "round_off", name, amount,
 *                         charges only: gst_rate, <the taxes>, ledger_sac }]
 *                         - name the mapped ledger's; ledger_sac that ledger's SAC, else the
 *                         one saved with the charge when it is the same ledger, else null
 *       gst_charges: { "<slab>": { "<mapped ledger>": amount } }   (tallyGstCharges)
 *     }]
 *   }
 *
 * Every value is the voucher's own, or what the user typed over it
 * (editedVoucher - amounts as numbers, null when there is none); the ledger
 * / product names are those of the mapping. Nothing is made up: a value the
 * voucher and the records do not have is null.
 *   ledgers   useInvoiceReferenceData's { byId } - the mapped ledgers' records
 *   parties   { company: 'seller' | 'buyer', ledger: 'buyer' | 'seller' } - the flow's
 */
export const buildTallyVoucherPayload = ({ voucher: sourceVoucher, mapping, company, ledgers, parties = { company: 'seller', ledger: 'buyer' } }) => {
  const voucher = mapping.voucher ?? sourceVoucher
  const items = mapping.mode !== INVOICE_MODE.ACCOUNTING
  const recordOf = (slot) => (slot?.ledgerId ? (ledgers?.byId?.get(textOf(slot.ledgerId)) ?? null) : null)

  const companySide = partyOf([voucher.sellerDetails, company], textOf(company?.comp_name))
  // A ledger found as the voucher names it: the voucher's own details first. One chosen instead: that ledger's.
  const partyRecord = recordOf(mapping.party)
  const ledgerSide = partyOf(
    mapping.party.status === MAPPING_STATUS.MATCHED ? [voucher.buyerDetails, partyRecord] : [partyRecord, voucher.buyerDetails],
    mapping.party.ledgerName || voucher.party.name,
  )
  const { seller, buyer } = parties.ledger === 'seller' ? { seller: ledgerSide, buyer: companySide } : { seller: companySide, buyer: ledgerSide }

  const productEntries = (items ? mapping.products : []).map((slot) => {
    const { line } = slot
    // Only a line whose product AND SKU are mapped names them (a voucher with one that is not cannot be sent).
    const mapped = isProductMapped(slot)
    return {
      index: line.index,
      entry: {
        product_name: mapped ? line.name : null,
        description: line.description,
        product_type: line.productType || 'Product',
        product_id: numberOrNull(line.productId) ?? (line.productId || null),
        sku_code: mapped ? line.skuCode || null : null,
        sku_details: mapped ? (line.skuDetails ?? null) : null,
        hsn_sac_code: line.hsn || null,
        quantity: line.quantity,
        unit: line.unit || null,
        rate: line.rate,
        discount: line.discount,
        ...taxPayload(line),
        amount: line.amount,
      },
    }
  })
  const serviceEntries = mapping.services.map((slot) => ({
    index: slot.line.index,
    entry: {
      service_name: slot.line.name,
      description: slot.line.description,
      product_type: slot.line.productType || SERVICE_PRODUCT_TYPE,
      hsn_sac_code: slot.line.hsn || null,
      quantity: slot.line.quantity,
      rate: slot.line.rate,
      discount: slot.line.discount,
      ...taxPayload(slot.line),
      amount: slot.line.amount,
      ...ledgerRef(slot),
    },
  }))

  const otherDetails = mapping.charges.map((slot) => {
    const { charge } = slot
    const name = slot.ledgerName || charge.ledgerName
    if (charge.kind !== CHARGE_KIND.CHARGE) return { type: charge.kind, name, amount: charge.amount }
    const sac = getLedgerSac(recordOf(slot)) || (sameText(name, charge.ledgerName) ? charge.ledgerSac : '')
    return { type: charge.kind, name, amount: charge.amount, gst_rate: charge.gstRate, ...taxPayload(charge), ledger_sac: sac || null }
  })

  return {
    module_name: TALLY_VOUCHER_MODULE,
    company_name: textOf(company?.comp_name),
    document_id: voucher.id,
    data: [
      {
        ...voucherAmountsOf(voucher),
        narration: mapping.narration ?? voucher.narration,
        voucher_type: mapping.voucherType || null,
        account_ledger: mapping.account.ledgerName || null,
        document_type: voucher.documentType,
        document_date: toDocumentDate(voucher.documentDate) || voucher.documentDate,
        document_no: voucher.documentNo,
        seller_name: seller.name,
        seller_gstin: seller.gstin,
        seller_state: seller.state,
        seller_pincode: seller.pincode,
        seller_address: seller.address,
        buyer_gstin: buyer.gstin,
        buyer_state: buyer.state,
        buyer_pincode: buyer.pincode,
        buyer_address: buyer.address,
        buyer_name: buyer.name,
        ship_to: voucher.shipTo,
        dispatch_from: voucher.dispatchFrom,
        document_details: voucher.master,
        product_details_type: productDetailsTypeOf({ products: productEntries.length, services: serviceEntries.length }),
        product_details: [...productEntries, ...serviceEntries].sort((a, b) => a.index - b.index).map(({ entry }) => entry),
        other_details: otherDetails,
        gst_charges: tallyGstCharges(mapping.gst),
      },
    ],
  }
}

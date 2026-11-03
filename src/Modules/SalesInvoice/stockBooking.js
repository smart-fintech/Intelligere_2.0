/**
 * A PURCHASE'S STOCK INTO THE WAREHOUSES - which saved purchase documents
 * book their stock, and what, with no screen attached (the booking itself:
 * StockBookingModal / ProductFormModal's `booking`):
 *
 *   needsStockBooking({ documentType, orderSource, inventory, editing })
 *       a NEW Purchase Invoice or Inbound Challan of a company with Inventory
 *       Management - except a Purchase Invoice whose Prefill From is an
 *       Inbound Challan: that stock came in with the Inbound Challan.
 *   stockBookingItems({ lines, productsByKey })
 *       its product lines, each with the product and SKU it is in the product
 *       list (its productKey, and the SKU's place in that product's list -
 *       lineVariant, as the line chose it; a product without SKUs is its one
 *       variant) and its quantity and rate:
 *       -> { items: [{ key, productKey, skuIndex, productName, skuCode, quantity, rate }],
 *            unmatched: [product names] }   a line whose product or SKU is no longer
 *       in the list is never given another's - it is left out, by name.
 *
 * EDITING ONE (History's Edit) - the update (invoice/business-documents/ PUT)
 * keeps a saved line only when it names it by its product_id; a line it does
 * not name is removed with the stock it brought in, and comes back as a new
 * line with none. So an edit keeps the lines whose stock it did not change,
 * and books the others again after the update, as a new document would:
 *
 *   needsStockRebooking({ documentType, prefillFrom, inventory })
 *       the saved one would have booked its stock (needsStockBooking) - its own
 *       prefill_from, as saved, says whether it came from an Inbound Challan.
 *   savedLinesOf(productData, lines)
 *       the form's lines as loaded (formFromSavedDocument - one per saved row, in
 *       order), by id: the product_id of the row each was read from, and what its
 *       stock was booked for (product / service, SKU, quantity) -> { [line id]: { productId, stock } }
 *   keptLineId(line, savedLines)
 *       the product_id to update the line under - only while its product, SKU and
 *       quantity are as saved; null for a changed or added line, booked again.
 */

import { PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN, PURCHASE_DOCUMENT_TYPE_INVOICE } from '@/Constants/purchaseInvoice'
import { listOf } from '@/Modules/SalesInvoice/documentPrefill'
import { isServiceLine, lineVariant, textOf } from '@/Modules/SalesInvoice/salesInvoiceForm'

export const STOCK_BOOKING_TYPES = Object.freeze([PURCHASE_DOCUMENT_TYPE_INVOICE, PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN])

export const needsStockBooking = ({ documentType, orderSource, inventory, editing }) =>
  Boolean(inventory) &&
  !editing &&
  STOCK_BOOKING_TYPES.includes(documentType) &&
  !(documentType === PURCHASE_DOCUMENT_TYPE_INVOICE && orderSource === PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN)

export const stockBookingItems = ({ lines, productsByKey }) => {
  const items = []
  const unmatched = []
  lines
    .filter((line) => !isServiceLine(line) && line.productKey)
    .forEach((line) => {
      const product = productsByKey.get(line.productKey) ?? null
      const variant = lineVariant(product, line)
      const skuIndex = product && variant ? product.variants.indexOf(variant) : -1
      if (skuIndex < 0) {
        unmatched.push(textOf(product?.name) || 'A product')
        return
      }
      items.push({
        key: String(line.id),
        productKey: String(product.key),
        skuIndex,
        productName: textOf(product.name),
        skuCode: textOf(variant.skuCode),
        quantity: textOf(line.quantity),
        rate: textOf(line.rate),
      })
    })
  return { items, unmatched }
}

/** The type a saved prefill_from names - { document_from, document_id } as sent, or { "<type>": [...] } as the server keeps it. */
const savedSourceOf = (prefillFrom) => {
  if (!prefillFrom || typeof prefillFrom !== 'object') return ''
  if (textOf(prefillFrom.document_from)) return textOf(prefillFrom.document_from)
  return Object.keys(prefillFrom).find((key) => Array.isArray(prefillFrom[key]) && prefillFrom[key].length > 0) ?? ''
}

export const needsStockRebooking = ({ documentType, prefillFrom, inventory }) =>
  needsStockBooking({ documentType, orderSource: savedSourceOf(prefillFrom), inventory, editing: false })

/** What a line's stock was booked for - a change to any of it books the line again. */
const stockOf = (line) => JSON.stringify([line.kind, line.productKey, line.skuValue, line.ledgerId, Number(textOf(line.quantity))])

export const savedLinesOf = (productData, lines) => {
  const rows = listOf(productData)
  return Object.fromEntries(lines.map((line, index) => [line.id, { productId: rows[index]?.product_id ?? null, stock: stockOf(line) }]))
}

export const keptLineId = (line, savedLines) => {
  const saved = savedLines?.[line.id]
  return saved && textOf(saved.productId) && saved.stock === stockOf(line) ? saved.productId : null
}

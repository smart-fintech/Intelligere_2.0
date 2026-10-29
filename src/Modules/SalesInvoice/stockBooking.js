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
 */

import { PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN, PURCHASE_DOCUMENT_TYPE_INVOICE } from '@/Constants/purchaseInvoice'
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

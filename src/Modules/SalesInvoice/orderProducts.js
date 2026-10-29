/**
 * ORDER PRODUCTS - a document's products taken, one by one, from its party's
 * orders: the order numbers are asked for once Step 2 is done, the chosen
 * orders' products listed, and a product's + fills the entry form with it -
 * Add Product then makes it a line, as for any product.
 *
 *   orderSourceOf(documentType, choice)   the type its products come from (Prefill From), or null
 *   readOrderRows(reply)          invoice/order-product-details/'s rows, as the table lists them
 *   entryFromOrderRow(row, ...)   the entry form filled with one - null when its
 *                                 product (or service ledger) is not in the lists
 *   orderReference(rows)          the one Reference No. the checked rows share - or ''
 *
 * A line filled from an order keeps where it came from as its `order`
 * ({ documentNo, documentId, referenceNo, remainQty, key, itemKey }): Add
 * Product refuses more than remainQty, or a row already on the document
 * (salesInvoiceForm - activeOrderOf), and the save writes its reference_no,
 * ref_doc_no and document_id on the line (salesInvoiceService).
 */

import { DOCUMENT_TYPE_CHALLAN } from '@/Constants/salesInvoice'
import {
  PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN,
  PURCHASE_DOCUMENT_TYPE_INVOICE,
  PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER,
} from '@/Constants/purchaseInvoice'
import { lineFromSavedProduct } from '@/Modules/SalesInvoice/documentPrefill'
import { isServiceLine, textOf } from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * PREFILL FROM - the user chooses where a document's products come from
 * (none at first), from these alone: Challan from a Sales Order (beside its
 * Proforma, which fills the whole form - PREFILL_SOURCES), Purchase Invoice
 * from an Inbound Challan, Inbound Challan from an Outbound Purchase Order.
 * Any type not here (Outbound Purchase Order) takes none.
 */
export const ORDER_SOURCE_CHOICES = Object.freeze({
  [DOCUMENT_TYPE_CHALLAN]: Object.freeze(['Sales Order']),
  [PURCHASE_DOCUMENT_TYPE_INVOICE]: Object.freeze([PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN]),
  [PURCHASE_DOCUMENT_TYPE_INBOUND_CHALLAN]: Object.freeze([PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER]),
})

/** The types a document may choose its products from - [] for none. */
export const orderSourceChoicesOf = (documentType) => ORDER_SOURCE_CHOICES[documentType] ?? []

/** The type its products come from - the one chosen (`choice`), or null for none. */
export const orderSourceOf = (documentType, choice = '') => (orderSourceChoicesOf(documentType).includes(choice) ? choice : null)

/** A quantity as a number - null when the row has none. */
const quantityOf = (value) => {
  if (textOf(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * The rows as the table shows them, each with its own `key` - its order, product
 * and SKU (a second identical row in one order gets "#2"), the same however
 * often the list is asked for:
 *   { key, documentNo, documentId, referenceNo, productName, hsn, skuCode,
 *     remainQty, quantity, raw }   raw - the row as sent
 */
export const readOrderRows = (reply) => {
  const seen = new Map()
  return (Array.isArray(reply) ? reply : [])
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const base = `${textOf(row.document_id) || textOf(row.document_no)}|${textOf(row.product_id) || textOf(row['Product Name'])}|${textOf(row.sku_code)}`
      const count = (seen.get(base) ?? 0) + 1
      seen.set(base, count)
      return {
        key: count > 1 ? `${base}#${count}` : base,
        documentNo: textOf(row.document_no),
        documentId: row.document_id ?? null,
        referenceNo: textOf(row.reference_no),
        productName: textOf(row['Product Name']),
        hsn: textOf(row.hsn_sac_code),
        skuCode: textOf(row.sku_code),
        remainQty: quantityOf(row.remain_qty),
        quantity: quantityOf(row.Quantity),
        raw: row,
      }
    })
}

/** Whether a row still has anything to deliver - a row with no remain_qty at all is not held back. */
export const orderRowAvailable = (row) => row.remainQty === null || row.remainQty > 0

/**
 * The entry form filled with one order row: its product (by name and SKU code)
 * or service (by ledger name), HSN/SAC, rate, unit, discount, GST slab and
 * description (lineFromSavedProduct), the quantity it still has to deliver, and
 * its `order`. Null when the product or ledger is not in the lists.
 */
export const entryFromOrderRow = (row, { ledgers, products }) => {
  const line = lineFromSavedProduct({ ...row.raw, ref_doc_no: '' }, { ledgers, products })
  const itemKey = isServiceLine(line) ? line.ledgerId : line.productKey
  if (!itemKey) return null
  return {
    ...line,
    quantity: row.remainQty === null ? line.quantity : String(row.remainQty),
    order: {
      documentNo: row.documentNo,
      documentId: row.documentId,
      referenceNo: row.referenceNo,
      remainQty: row.remainQty,
      key: row.key,
      itemKey,
    },
  }
}

/** The Reference No. every checked row shares - '' when they have none, or not the same one. */
export const orderReference = (rows) => {
  const references = new Set(rows.map((row) => row.referenceNo))
  if (references.size !== 1) return ''
  return [...references][0]
}

/**
 * THE INVENTORY SALES ORDERS - inventory/sales_order_history/'s records, read
 * for the History's Inventory Sales Order view (InventorySalesOrderHistory).
 *
 *   readInventorySalesOrder(record, index) ->
 *     { key, soNo, soDate, buyerName, bookedStatus, process, hasProcess, processDone,
 *       pdfUrl, booked: [bookedItem], opo: [linkedDocument], ic: [linkedDocument] }
 *
 *   hasProcess       the order's `process` holds anything (soProcess - hasProcess):
 *                    Show Process; else Book Process
 *
 *   bookedItem       { key, name, skuCode, skuDetails: [[name, value]], category,
 *                      orderQty, bookedQty, requiredQty, minQty,
 *                      warehouses: [{ id, name, qty }] }
 *   linkedDocument   { key, docNo, docDate, buyerName, pdfUrl,
 *                      products: [{ key, name, quantity, rate, hsn, remainQty, amount }] }
 *
 * Every field is optional: a missing one reads as '' (text) or null (a
 * number), a missing list as []. A product's name comes as "Product Name" or
 * product_name - both are read. The PDF URLs are the server's, as sent.
 */

import { hasProcess } from '@/Modules/SalesInvoice/History/soProcess'

const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())
const numberOf = (value) => {
  const number = Number(value)
  return textOf(value) !== '' && Number.isFinite(number) ? number : null
}
const listOf = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [])
const objectOf = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const nameOf = (row) => textOf(row['Product Name']) || textOf(row.product_name)

const readBookedItem = (item, index) => ({
  key: `${textOf(item.sku_code) || nameOf(item)}#${index}`,
  name: nameOf(item),
  skuCode: textOf(item.sku_code),
  skuDetails: Object.entries(objectOf(item.sku_details)).filter(([, value]) => textOf(value) !== ''),
  category: textOf(item.category),
  orderQty: numberOf(item.order_qty),
  bookedQty: numberOf(item.booked_qty),
  requiredQty: numberOf(item.required_qty),
  minQty: numberOf(item.min_qty),
  warehouses: listOf(item.warehouse).map((entry) => ({
    id: textOf(entry.warehouse_id ?? entry.id),
    name: textOf(entry.warehouse_name ?? entry.name),
    qty: numberOf(entry.book_qty ?? entry.booked_qty),
  })),
})

const readLinkedDocument = (entry, index) => {
  const master = objectOf(entry.master_details)
  const docNo = textOf(master.DOC_no ?? master.doc_no)
  return {
    key: `${docNo}#${index}`,
    docNo,
    docDate: textOf(master.doc_date),
    buyerName: textOf(master.buyer_name),
    pdfUrl: textOf(master.doc_pdf),
    products: listOf(entry.product_details).map((product, at) => ({
      key: `${nameOf(product)}#${at}`,
      name: nameOf(product),
      quantity: numberOf(product.quantity),
      rate: numberOf(product.rate),
      hsn: textOf(product.hsn),
      remainQty: numberOf(product.remain_qty),
      amount: numberOf(product.amount),
    })),
  }
}

export const readInventorySalesOrder = (record, index) => {
  const soNo = textOf(record.so_no)
  return {
    // The order's number, with its place for one sent without (or twice).
    key: `${soNo}#${index}`,
    soNo,
    soDate: textOf(record.so_date),
    buyerName: textOf(record.buyer_name),
    bookedStatus: textOf(record.booked_status),
    // The status as text ("ongoing"); a list or an object holds no status of its own.
    process: typeof record.process === 'object' ? '' : textOf(record.process),
    hasProcess: hasProcess(record.process),
    processDone: numberOf(record.total_process_done),
    pdfUrl: textOf(record.so_pdf),
    booked: listOf(record.booked_inventory).map(readBookedItem),
    opo: listOf(record.OPO).map(readLinkedDocument),
    ic: listOf(record.IC).map(readLinkedDocument),
  }
}

/** A status as words - "partial" -> "Partial", "not_booked" -> "Not booked". */
export const statusText = (value) => {
  const words = textOf(value).replace(/[_-]+/g, ' ')
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

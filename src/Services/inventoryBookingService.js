/**
 * A SALES ORDER'S STOCK, BOOKED - once the order is saved:
 *
 *   POST inventory/inventory_booking/   { company_name, document_id, products: [{ "Product Name",
 *        sku_code, quantity, warehouse: [{ id, book_qty }] }] }   (Modules/SalesInvoice/inventoryBooking)
 *        -> { msg: "Sales order booked successfully" }
 */

import { api } from '@/Services/authService'

const INVENTORY_BOOKING_URL = 'inventory/inventory_booking/'

/** Books the stock - a reply saying it failed (success: false) is thrown. */
export const bookInventory = (body) =>
  api.post(INVENTORY_BOOKING_URL, body).then((reply) => {
    if (reply && typeof reply === 'object' && reply.success === false) throw new Error(reply.msg || 'The stock could not be booked.')
    return reply
  })

/*
 * A CHALLAN'S STOCK, TAKEN OUT - before a Challan with no Prefill From is saved
 * (Modules/SalesInvoice/challanStock):
 *
 *   POST inventory/SKUWarehouseSummaryAPI/   [{ company_name, product_name, hsn_code,
 *        quantity | order_qty, sku_code }]
 *        -> [[{ Products, order_qty, sku_code, sku_details, manage_qty, warehouse: [{ id,
 *              warehouse_name, Qty, total_booked_qty, so_booked_qty: [{ document_no, qty,
 *              buyer_name, document_date }] }] }]]   - or { msg } when there is nothing to take
 *   PUT  inventory/SKUWarehouseSummaryAPI/   { company_name, product: [{ document_id, warehouse:
 *        [{ id, remove_qty, so_booked_qty?: [{ so_no, qty, remove_qty }] }] }] }
 *        -> { msg, updated: [...], errors: [...] }
 */
const STOCK_SUMMARY_URL = 'inventory/SKUWarehouseSummaryAPI/'

export const getStockSummary = (body) => api.post(STOCK_SUMMARY_URL, body)

/** Takes the stock out - a reply with `errors` is thrown, with them as its message: nothing is taken as done. */
export const updateStockSummary = (body) =>
  api.put(STOCK_SUMMARY_URL, body).then((reply) => {
    const errors = Array.isArray(reply?.errors) ? reply.errors.filter((entry) => entry !== null && entry !== undefined && entry !== '') : []
    if (errors.length > 0) {
      const words = errors.map((entry) => (typeof entry === 'string' ? entry : entry?.msg || entry?.error || entry?.message || JSON.stringify(entry)))
      throw new Error(words.join(' '))
    }
    return reply
  })

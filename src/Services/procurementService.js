/**
 * A SALES ORDER'S PURCHASING - what its products still need, and the request
 * for quotation sent to vendors (Modules/SalesInvoice/procurement):
 *
 *   POST inventory/order_requirement/   { company_name, document_no, product: [{ "Product Name",
 *        sku_code, requirement_qty, warehouse_id }] }      (sku_code "" for a product without SKU)
 *        -> { "<key>": { product_id, "Product Name", sku_code, sku_details, Category,
 *              warehouse: [{ warehouse_id }], required_qty, order_qty, order_qty_wo_min_qty,
 *              rate, min_qty, available_qty, vendors: [{ id, name, email, contact, address }],
 *              "GST Rate", "HSN Code", "Per Unit",
 *              "Semi-Finished": { "<key>": { ..., "Raw Material": {...} } },
 *              "Raw Material": { "<key>": {...} } } }
 *   POST inventory/request_quotation/   { company_name, document_no, buyer_company_id,
 *        vendors: [{ vendor_id_seller, products: [{ product_id, quantity, warehouse_id }] }] }
 *        -> { msg: "successfully saved" }
 */

import { api } from '@/Services/authService'

const ORDER_REQUIREMENT_URL = 'inventory/order_requirement/'
const REQUEST_QUOTATION_URL = 'inventory/request_quotation/'

/** A reply that says it failed (success: false) is thrown, as a refusal is. */
const refused = (fallback) => (reply) => {
  if (reply && typeof reply === 'object' && reply.success === false) throw new Error(reply.msg || fallback)
  return reply
}

/** What each of the order's products needs - its BOM, level by level, with the quantities to buy. */
export const getOrderRequirement = (body) => api.post(ORDER_REQUIREMENT_URL, body).then(refused('The requirements could not be calculated.'))

/** Sends a request for quotation - the vendors it names, each with its products. */
export const requestQuotation = (body) => api.post(REQUEST_QUOTATION_URL, body).then(refused('The request for quotation could not be sent.'))

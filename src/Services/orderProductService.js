/**
 * ORDER PRODUCTS - the products a document can take from its party's orders
 * (Challan from a Sales Order, Inbound Challan from an Outbound Purchase
 * Order, Purchase Invoice from an Inbound Challan - Modules/SalesInvoice/orderProducts):
 *
 *   POST invoice/order-document-numbers/   { buyer_id, company_id, document_type }
 *        -> ["SO/23/25-26", "SO/24/25-26"]   the party's documents of that type
 *   POST invoice/order-product-details/    { company_id, buyer_id, document_type, document_no: [...] }
 *        -> [{ document_id, document_no, product_id, "Product Name", Quantity, remain_qty,
 *              hsn_sac_code, sku_code, "Selling Rate", "Per Unit", cgst, sgst, igst, reference_no, ... }]
 *
 * (invoice/order-document-numbers/ is what the earlier screens' invoice/get_so/ was.)
 */

import { api } from '@/Services/authService'

const ORDER_NUMBERS_URL = 'invoice/order-document-numbers/'
const ORDER_PRODUCTS_URL = 'invoice/order-product-details/'

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** The document numbers in a reply - each once, in the order sent; anything that is not a number left out. */
export const readOrderNumbers = (reply) => {
  const list = Array.isArray(reply) ? reply : []
  return [...new Set(list.map((entry) => (typeof entry === 'string' || typeof entry === 'number' ? text(entry) : '')).filter(Boolean))]
}

export const getOrderNumbers = ({ buyerId, companyId, documentType }) =>
  api.post(ORDER_NUMBERS_URL, { buyer_id: buyerId, company_id: companyId, document_type: documentType }).then(readOrderNumbers)

export const buildOrderProductsBody = ({ companyId, buyerId, documentType, documentNos }) => ({
  company_id: companyId,
  buyer_id: buyerId,
  document_type: documentType,
  document_no: [...documentNos],
})

/** The chosen documents' products, as sent - a list of objects (empty when there are none). */
export const getOrderProducts = (request) =>
  api.post(ORDER_PRODUCTS_URL, buildOrderProductsBody(request)).then((reply) => (Array.isArray(reply) ? reply.filter((row) => row && typeof row === 'object') : []))

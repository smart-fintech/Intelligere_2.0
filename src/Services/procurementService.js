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
 *
 * and what came of those requests (Inventory Details > Compare Quotation):
 *
 *   POST inventory/AllRequestSO/        { company_name }
 *        -> [{ document_no, "<vendor email>": { vendor_id_seller, buyer_company_id, requested_at,
 *              document_no, document_date, products: [{ product_id, quantity, warehouse_id,
 *              "Product Name", sku_code, sku_details, "HSN Code", "Per Unit", "GST Rate" }],
 *              seller: { id, name, email, gst_no, address, contact }, buyer: {...},
 *              response?: { master_details, other_details, product: [...] } }, ... }]
 *        one entry per Sales Order, one key per vendor asked - its email, never a fixed name;
 *        `response` is the vendor's quotation, once there is one (quotationRequests)
 *   POST inventory/updated_quotation/   multipart: file (the vendor's filled-in .docx), company_name
 *        -> { msg: "file upload success" }; refused -> { msg: "reference_no missing in master_details" }
 *   PUT  inventory/updated_quotation/   { document_no, vendor_email, company_name, source: "form",
 *        response: { master_details, other_details, product } }   the Quote Form / Edit Quotation
 *   POST inventory/compare_quotation/   { document_no, company_name }
 *        -> { "<vendor email>": { product: [{ ...the quoted line, past_quotation: [...] }],
 *              master_details: { quotation_date, quotation_no, delivery_time, vendor_name },
 *              vendor_details: { id, name, ..., rating } } }
 */

import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { api } from '@/Services/authService'

const ORDER_REQUIREMENT_URL = 'inventory/order_requirement/'
const REQUEST_QUOTATION_URL = 'inventory/request_quotation/'
const QUOTATION_REQUESTS_URL = 'inventory/AllRequestSO/'
const UPLOAD_QUOTATION_URL = 'inventory/updated_quotation/'

/** A reply that says it failed (success: false) is thrown, as a refusal is. */
const refused = (fallback) => (reply) => {
  if (reply && typeof reply === 'object' && reply.success === false) throw new Error(reply.msg || fallback)
  return reply
}

/** What each of the order's products needs - its BOM, level by level, with the quantities to buy. */
export const getOrderRequirement = (body) => api.post(ORDER_REQUIREMENT_URL, body).then(refused('The requirements could not be calculated.'))

/** Sends a request for quotation - the vendors it names, each with its products. */
export const requestQuotation = (body) => api.post(REQUEST_QUOTATION_URL, body).then(refused('The request for quotation could not be sent.'))

/** The History read again: at once where it is on screen, on next use elsewhere. */
const markQuotationsChanged = (companyName) => invalidateQueries(QUERY.QUOTATION_REQUESTS, { whose: companyName, refetchActive: true })

/** The company's requests for quotation, by Sales Order - read through useQuotationRequests, which keeps the answer. */
export const getQuotationRequests = (companyName) => api.post(QUOTATION_REQUESTS_URL, { company_name: companyName })

/**
 * Sends a vendor's filled-in quotation. Accepted, the company's requests are
 * read again - at once where they are on screen, on next use elsewhere - so
 * History shows it; refused, nothing is read again.
 */
export const uploadQuotation = async (companyName, file) => {
  const body = new FormData()
  body.append('file', file)
  body.append('company_name', companyName)

  // Multipart named for this one call: the instance's JSON default would turn the FormData into JSON.
  const reply = await api.post(UPLOAD_QUOTATION_URL, body, { headers: { 'Content-Type': 'multipart/form-data' } })
  markQuotationsChanged(companyName)
  return reply
}

/** Saves a vendor's quotation typed in (Quote Form / Edit Quotation) - `body` is buildQuotationBody's. Saved, the History is read again. */
export const saveQuotationForm = async (body) => {
  const reply = await api.put(UPLOAD_QUOTATION_URL, body)
  markQuotationsChanged(body.company_name)
  return reply
}

/** The order's quotations side by side, each line with its past quotations - asked each time Compare Quotations is pressed. */
export const compareQuotations = ({ companyName, documentNo }) =>
  api.post('inventory/compare_quotation/', { document_no: documentNo, company_name: companyName })

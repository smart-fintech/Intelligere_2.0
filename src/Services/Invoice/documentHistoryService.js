/**
 * HISTORY - a company's saved documents (Sales Invoice and Purchase Invoice):
 *
 *   POST   invoice/business-document-history/   saved documents, by type and financial year
 *   POST   inventory/sales_order_history/       inventory-managed Sales Orders (the Inventory Sales Order view)
 *   POST   inventory/progress_report/           { company_name, document_no } -> a booked Sales Order's processes
 *   PUT    inventory/progress_report/           the processes saved (Book / Show Process)
 *   POST   invoice/regenerate_voucher/          a document's voucher, made again
 *   POST   invoice/export-documents-excel/      the documents, as Excel
 *   DELETE invoice/document-delete/             remove one
 */

import { sharedRequest, text } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'
import { numberingDocumentType } from '@/Services/Invoice/salesInvoiceService'
import { changesProducts } from '@/Services/Product/productCache'

const DOCUMENT_HISTORY_URL = 'invoice/business-document-history/'
const DOCUMENT_DELETE_URL = 'invoice/document-delete/'
const REGENERATE_VOUCHER_URL = 'invoice/regenerate_voucher/'
const EXPORT_DOCUMENTS_URL = 'invoice/export-documents-excel/'

/** A saved document's type as the backend names it now - one saved as "Invoice" (the earlier name) is a "Sales Invoice". */
export const documentTypeOfRecord = (documentType) => {
  const name = text(documentType)
  return name.toLowerCase() === 'invoice' ? 'Sales Invoice' : numberingDocumentType(name)
}

/** The document types History can regenerate a voucher for. */
export const REGENERATE_VOUCHER_TYPES = Object.freeze(['Sales Invoice', 'Credit Note', 'Debit Note', 'Purchase Invoice'])

/**
 * POST invoice/regenerate_voucher/  { company_id, document_id, document_type }
 *   -> { msg: "Voucher regenerated successfully." }
 * The document by its own document_id, its type as the history names it.
 */
export const buildRegenerateVoucherBody = ({ companyId, documentId, documentType }) => ({
  company_id: companyId,
  document_id: documentId,
  document_type: documentTypeOfRecord(documentType),
})

export const regenerateVoucher = (record) => api.post(REGENERATE_VOUCHER_URL, buildRegenerateVoucherBody(record))

/**
 * POST invoice/export-documents-excel/ - the history's documents, as the
 * filters applied choose them (buildDocumentExportBody, historyHelpers)
 *   -> { msg: "Excel exported successfully", file_name: "https://.../Invoice_x.xlsx" }
 */
export const exportDocumentsExcel = (body) => api.post(EXPORT_DOCUMENTS_URL, body)

/**
 * POST invoice/business-document-history/  { company_id, date: "2025-2026", document_type }
 * -> the company's saved documents of that type and financial year. The
 * document type is named as the numbering endpoint names it (an invoice is
 * "Sales Invoice"). A bare array is read, or one under `data` / `results`.
 */
export const getDocumentHistory = async ({ companyId, financialYear, documentType }) => {
  const body = { company_id: companyId, date: financialYear, document_type: numberingDocumentType(documentType) }
  const reply = await sharedRequest(DOCUMENT_HISTORY_URL, body, () => api.post(DOCUMENT_HISTORY_URL, body))
  const list = Array.isArray(reply) ? reply : Array.isArray(reply?.data) ? reply.data : Array.isArray(reply?.results) ? reply.results : []
  return list.filter((row) => row && typeof row === 'object')
}

const INVENTORY_SALES_ORDER_HISTORY_URL = 'inventory/sales_order_history/'

/**
 * POST inventory/sales_order_history/  { company_name }
 * -> the company's inventory-managed Sales Orders: [{ booked_status, so_no,
 * so_date, so_pdf, buyer_name, process, total_process_done, booked_inventory,
 * OPO, IC }] (History/inventorySalesOrders reads them). A bare array is
 * read, or one record on its own.
 */
export const getInventorySalesOrderHistory = async (companyName) => {
  const body = { company_name: companyName }
  const reply = await sharedRequest(INVENTORY_SALES_ORDER_HISTORY_URL, body, () => api.post(INVENTORY_SALES_ORDER_HISTORY_URL, body))
  const list = Array.isArray(reply) ? reply : reply && typeof reply === 'object' && 'so_no' in reply ? [reply] : []
  return list.filter((row) => row && typeof row === 'object')
}

const PROGRESS_REPORT_URL = 'inventory/progress_report/'

/**
 * POST inventory/progress_report/  { company_name, document_no }  - a booked Sales
 * Order's processes: [{ pid, name, sku_code, sku_details, product_details,
 * warehouse, colour_code, percentage, total, totalDone, ... }] (read by
 * History/soProcess - readProcessItems). The reply as it came.
 */
export const getProgressReport = ({ companyName, soNo }) => {
  const body = { company_name: companyName, document_no : soNo }
  return sharedRequest(PROGRESS_REPORT_URL, body, () => api.post(PROGRESS_REPORT_URL, body))
}

/**
 * PUT inventory/progress_report/  { company_name, document_no, total_process_done,
 * process: [...], inventory_add }  (buildProgressBody) -> { inventory_add: [...]? }
 * - the products whose stock is still to be added, when there are any:
 * [{ name, sku_code, warehouse_id, add_qty, category }].
 */
export const saveProgressReport = (body) => api.put(PROGRESS_REPORT_URL, body)

/**
 * DELETE invoice/document-delete/  { id, x_deleted: "true", y_deleted: "false" }
 * -> { msg }. `id` is the document's document_id; the flags go as the text
 * the backend takes them as. The body goes as the DELETE's `data`, as every
 * DELETE here sends one. A refusal (a document referenced elsewhere, say)
 * arrives as an error carrying the backend's own message (see authService).
 */
export const deleteBusinessDocument = (documentId) =>
  changesProducts(api.delete(DOCUMENT_DELETE_URL, { data: { id: documentId, x_deleted: 'true', y_deleted: 'false' } }))

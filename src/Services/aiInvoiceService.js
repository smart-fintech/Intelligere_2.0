/**
 * AI VOUCHER - invoice files read by the backend's AI, which makes a voucher of
 * each one in the background:
 *
 *   POST invoice/ai-invoice-processing/   multipart { company_name, document_type, files, files, ... }
 *        -> { msg: "Processing started in background", upload_id }
 *   POST invoice/pdf-progress/            { company_name }
 *        -> { total, processing, success, failed, pending, percentage, msg,
 *             invoices: [{ id, file_name, invoice_number, status, message }] }
 *           or {} - no upload, or the latest one already acknowledged
 *   POST invoice/pdf-progress/            { company_name, voucher: true }
 *        -> {} - the latest upload marked as seen (only when the user presses OK)
 *
 * Every file goes under the same field, `files` - the backend reads every file
 * of the request (request.FILES.getlist for each key), so a repeated field is
 * what it takes.
 */

import { PURCHASE_DOCUMENT_TYPE_INVOICE } from '@/Constants/purchaseInvoice'
import { DOCUMENT_TYPE_INVOICE } from '@/Constants/salesInvoice'
import { api } from '@/Services/authService'

const AI_PROCESSING_URL = 'invoice/ai-invoice-processing/'
const AI_PROGRESS_URL = 'invoice/pdf-progress/'
// The instance's default type is JSON, which would turn a FormData into JSON;
// for a FormData axios then drops this header and the browser writes the
// multipart type with its own boundary.
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

/** The two `document_type`s the AI reads for - a Purchase Invoice voucher or a Sales Invoice one. */
export const AI_DOCUMENT_TYPES = Object.freeze([PURCHASE_DOCUMENT_TYPE_INVOICE, DOCUMENT_TYPE_INVOICE])

/** The files it takes - PDF and images, checked by name. */
export const AI_INVOICE_ACCEPT = '.pdf,.jpg,.jpeg,.png'

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const count = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}
const percentOf = (value) => Math.min(100, Math.round(count(value)))

export const buildAiProcessingFormData = ({ companyName, documentType, files }) => {
  const body = new FormData()
  body.append('company_name', text(companyName))
  body.append('document_type', documentType)
  for (const file of files) body.append('files', file, file.name)
  return body
}

/** Starts the AI processing of the files - the reply only says it has STARTED. */
export const startAiInvoiceProcessing = (upload) => api.post(AI_PROCESSING_URL, buildAiProcessingFormData(upload), MULTIPART)

const progressRequests = new Map()

/**
 * The company's latest upload, as it stands. A request still on its way for
 * the company is shared, not sent again (React's Strict Mode runs an effect twice).
 */
export const getAiInvoiceProgress = (companyName) => {
  const key = text(companyName)
  if (!progressRequests.has(key)) {
    const request = api.post(AI_PROGRESS_URL, { company_name: key }).finally(() => progressRequests.delete(key))
    progressRequests.set(key, request)
  }
  return progressRequests.get(key)
}

/** OK on the finished upload: marks the latest upload as seen - never sent by itself. */
export const acknowledgeAiInvoiceProgress = (companyName) => api.post(AI_PROGRESS_URL, { company_name: text(companyName), voucher: true })

const STATUSES = ['success', 'failed', 'processing', 'pending']

/**
 * One progress reply, read:
 *
 *   { kind: 'empty' }                 {} - nothing to show
 *   { kind: 'error', message }        only a `msg` (company_name is required, Company not found)
 *   { kind: 'progress', total, success, failed, processing, pending, percentage, msg,
 *     invoices: [{ key, fileName, invoiceNumber, status, message }], finished }
 *
 * Everything is as the backend sent it. `finished` - nothing pending or
 * processing, by the counts AND by the files' own statuses - is when polling
 * stops; a percentage of 100 alone is never taken for it.
 */
export const readAiProgress = (reply) => {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return { kind: 'empty' }
  const hasCounts = ['total', 'success', 'failed', 'processing', 'pending'].some((field) => reply[field] !== undefined)
  const rows = Array.isArray(reply.invoices) ? reply.invoices.filter((row) => row && typeof row === 'object') : []
  if (!hasCounts && rows.length === 0) return text(reply.msg) ? { kind: 'error', message: text(reply.msg) } : { kind: 'empty' }

  const invoices = rows.map((row, index) => {
    const status = text(row.status).toLowerCase()
    return {
      key: `${row.id ?? index}-${text(row.file_name)}`,
      fileName: text(row.file_name),
      invoiceNumber: text(row.invoice_number),
      status: STATUSES.includes(status) ? status : status || 'pending',
      message: text(row.message),
    }
  })
  const progress = {
    total: reply.total === undefined ? invoices.length : count(reply.total),
    success: count(reply.success),
    failed: count(reply.failed),
    processing: count(reply.processing),
    pending: count(reply.pending),
    percentage: percentOf(reply.percentage),
    msg: text(reply.msg),
    invoices,
  }
  const stillGoing = invoices.some((row) => row.status === 'processing' || row.status === 'pending')
  return {
    kind: 'progress',
    ...progress,
    finished: progress.total > 0 && progress.processing === 0 && progress.pending === 0 && !stillGoing,
  }
}

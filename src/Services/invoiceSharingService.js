/**
 * SHARING A DOCUMENT WITH THE BUYER'S OWN COMPANY - and receiving one:
 *
 *   GET  tally/AllCompanyList/   every company on Intelligere -> [{ id, comp_name, comp_gstin, ... }]
 *        (`id` is the company's id - the one tally/user-companies-list/ calls company_id)
 *   POST invoice/xy-invoice/     { document_id, document_no, company_id, buyer_company_id,
 *                                  buyer_gstin, document_type }  -> { msg }   share one
 *   POST invoice/xy-invoice/     { company_id }  -> [{ id, document_id, seller_data_id,
 *                                  buyer_data_id, document_date, document_no, document_type,
 *                                  doc_pdf }]   the documents shared WITH this company
 *   PUT  invoice/xy-invoice/     { company_id, document_no, accepted, document_id }
 *                                  -> { msg, id, document_id, accepted }   accept / decline one
 *
 * Of the company list only id, comp_name and comp_gstin are kept: the
 * endpoint sends every field of every company, and nothing else of another
 * company is held here.
 */

import { api } from '@/Services/authService'

const ALL_COMPANIES_URL = 'tally/AllCompanyList/'
const SHARED_INVOICE_URL = 'invoice/xy-invoice/'

/** How long one answer of the company list is reused - it changes rarely, and is asked after every save. */
const COMPANY_LIST_FRESH_MS = 5 * 60 * 1000

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const nameKey = (value) => text(value).replace(/\s+/g, ' ').toLowerCase()
const listOf = (reply) => (Array.isArray(reply) ? reply : Array.isArray(reply?.data) ? reply.data : Array.isArray(reply?.results) ? reply.results : [])

let companies = null

/** Every company on Intelligere - { id, name, gstin } only; one answer reused for a while, a failure asked again next time. */
export const getAllCompanies = () => {
  if (companies && Date.now() - companies.at < COMPANY_LIST_FRESH_MS) return companies.request
  const request = api.get(ALL_COMPANIES_URL).then((reply) =>
    listOf(reply)
      .filter((row) => row && row.id !== undefined && row.id !== null && text(row.comp_name))
      .map((row) => ({ id: row.id, name: text(row.comp_name), gstin: text(row.comp_gstin).toUpperCase() })),
  )
  companies = { at: Date.now(), request }
  request.catch(() => {
    if (companies?.request === request) companies = null
  })
  return request
}

/**
 * The company a buyer is, by its name - case and spacing aside - never the
 * company sharing it. When two have that name, the one with the buyer's GSTIN;
 * still two, none (it cannot be told which). -> { id, name, gstin } | null
 */
export const findBuyerCompany = (list, { buyerName, buyerGstin, ownCompanyId }) => {
  const wanted = nameKey(buyerName)
  if (!wanted) return null
  const matches = list.filter((company) => nameKey(company.name) === wanted && String(company.id) !== String(ownCompanyId))
  if (matches.length <= 1) return matches[0] ?? null
  const byGstin = matches.filter((company) => company.gstin && company.gstin === text(buyerGstin).toUpperCase())
  return byGstin.length === 1 ? byGstin[0] : null
}

export const buildShareInvoiceBody = ({ documentId, documentNo, companyId, buyerCompanyId, buyerGstin, documentType }) => ({
  document_id: documentId,
  document_no: text(documentNo),
  company_id: companyId,
  buyer_company_id: buyerCompanyId,
  buyer_gstin: text(buyerGstin).toUpperCase(),
  document_type: text(documentType),
})

/** Shares a saved document with the buyer's company. */
export const shareInvoice = (offer) => api.post(SHARED_INVOICE_URL, buildShareInvoiceBody(offer))

const sharedListRequests = new Map()

/**
 * The documents other companies have shared with this one. A request still on
 * its way for the company is shared, not sent again (React's Strict Mode runs
 * an effect twice).
 */
export const getSharedInvoices = (companyId) => {
  const key = String(companyId)
  if (!sharedListRequests.has(key)) {
    const request = api
      .post(SHARED_INVOICE_URL, { company_id: companyId })
      .then(listOf)
      .finally(() => sharedListRequests.delete(key))
    sharedListRequests.set(key, request)
  }
  return sharedListRequests.get(key)
}

export const buildSharedInvoiceResponse = ({ companyId, documentNo, documentId, accepted }) => ({
  company_id: companyId,
  document_no: text(documentNo),
  accepted: Boolean(accepted),
  document_id: documentId,
})

/** Accepts (a Purchase Invoice voucher is made of it) or declines a shared document. */
export const respondToSharedInvoice = (answer) => api.put(SHARED_INVOICE_URL, buildSharedInvoiceResponse(answer))

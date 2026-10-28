/**
 * PREFILL FROM - a new document filled in from one saved earlier:
 *
 *   POST invoice/document-details/           { company_id, document_type }
 *        -> { "1": { document_id, document_no, buyer_name, buyer_data_id }, "2": ... }
 *           the company's documents of that type, to choose from
 *   POST invoice/prefill-document-details/   { document_ids: [..], document_no: [..] }
 *        -> [ the document(s), as invoice/business-document-history/ sends them ]
 *
 * One document at a time here (the backend takes a list). What is saved with
 * the new document, as `prefill_from`, is where it came from:
 *
 *   { document_from: "Sales Order", document_id: [14492] }      ({} when none)
 */

import { api } from '@/Services/authService'

const DOCUMENT_LIST_URL = 'invoice/document-details/'
const PREFILL_DETAILS_URL = 'invoice/prefill-document-details/'

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/**
 * The documents to choose from - the reply's entries (an object keyed "1",
 * "2", ... or a list), each kept by its own document_id and document_no:
 * [{ documentId, documentNo, buyerName, buyerId }]. An entry without both is
 * left out - it could not be asked for.
 */
export const readPrefillDocuments = (reply) => {
  const entries = Array.isArray(reply) ? reply : reply && typeof reply === 'object' ? Object.values(reply) : []
  return entries
    .filter((entry) => entry && typeof entry === 'object' && text(entry.document_id) && text(entry.document_no))
    .map((entry) => ({
      documentId: entry.document_id,
      documentNo: text(entry.document_no),
      buyerName: text(entry.buyer_name),
      buyerId: entry.buyer_data_id ?? null,
    }))
}

/** The company's documents of a type - readPrefillDocuments of the reply. */
export const getPrefillDocuments = ({ companyId, documentType }) =>
  api.post(DOCUMENT_LIST_URL, { company_id: companyId, document_type: documentType }).then(readPrefillDocuments)

export const buildPrefillDetailsBody = (documents) => ({
  document_ids: documents.map((document) => document.documentId),
  document_no: documents.map((document) => document.documentNo),
})

/** The chosen document(s), as the history sends them - a list (empty when none was found). */
export const getPrefillDocumentDetails = (documents) =>
  api.post(PREFILL_DETAILS_URL, buildPrefillDetailsBody(documents)).then((reply) => (Array.isArray(reply) ? reply.filter((row) => row && typeof row === 'object') : []))

/** `prefill_from` as saved: { document_from, document_id: [...] } - {} when the document was not prefilled. */
export const buildPrefillFrom = (source) =>
  source && text(source.documentFrom) && source.documentIds?.length ? { document_from: text(source.documentFrom), document_id: [...source.documentIds] } : {}

/** A saved document's own `prefill_from` (an object, or its JSON text), as it is - {} for anything else. */
export const readPrefillFrom = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * The GST ledger mappings of a company's documents - which ledger each tax
 * and rate is posted to, kept per side (Sales Invoice / Purchase Invoice).
 *
 *   POST   invoice/document-mapping/   { company_id, document_type } -> that type's mappings ({ cgst: "..." } or {})
 *   POST   invoice/document-mapping/   { company_id, document_type, sales_mapping | purchase_mapping: {...} } -> add one
 *   DELETE invoice/document-mapping/   the same body - remove one
 */

import { sharedRequest } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'

const DOCUMENT_MAPPING_URL = 'invoice/document-mapping/'

/** The two document types mappings are kept for - each with its own key in a save or delete body. */
export const MAPPING_DOCUMENT_TYPE = Object.freeze({ SALES: 'Sales Invoice', PURCHASE: 'Purchase Invoice' })
const MAPPING_KEY = Object.freeze({ [MAPPING_DOCUMENT_TYPE.SALES]: 'sales_mapping', [MAPPING_DOCUMENT_TYPE.PURCHASE]: 'purchase_mapping' })

const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

/**
 * The read's answer as { key: value } - flat as the endpoint sends it
 * ({ cgst: "CGST", sgst_6: "..." }, or {} when there are none). An answer
 * nested under its type's key (sales_mapping / purchase_mapping) is read the
 * same; a `msg` and anything that is not a name are left out.
 */
export const readDocumentMappings = (reply, documentType) => {
  const nested = plainObject(reply) ? reply[MAPPING_KEY[documentType]] : null
  const source = plainObject(nested) ? nested : plainObject(reply) ? reply : {}
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, value]) => key !== 'msg' && (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}

/**
 * POST invoice/document-mapping/  { company_id, document_type }  - the body
 * with no mapping is the read; one carrying a mapping is a save (saveDocumentMapping).
 *   -> { cgst: "CGST", sgst_6: "..." }  or  {}
 */
export const getDocumentMappings = async (companyId, documentType) => {
  const body = { company_id: companyId, document_type: documentType }
  const reply = await sharedRequest(DOCUMENT_MAPPING_URL, body, () => api.post(DOCUMENT_MAPPING_URL, body))
  return readDocumentMappings(reply, documentType)
}

/**
 * The body naming one mapping, under its type's key:
 *   { company_id, document_type: "Sales Invoice", sales_mapping: { cgst: "CGST" } }
 *   { company_id, document_type: "Purchase Invoice", purchase_mapping: { sgst_6: "Unsecured Loan" } }
 */
export const buildMappingPayload = (companyId, documentType, key, value) => {
  const mappingKey = MAPPING_KEY[documentType]
  if (!mappingKey) throw new Error(`Mappings are not kept for ${documentType || 'this document type'}.`)
  return { company_id: companyId, document_type: documentType, [mappingKey]: { [key]: value } }
}

/** POST invoice/document-mapping/ - adds (or replaces) one mapping. */
export const saveDocumentMapping = (companyId, documentType, key, value) =>
  api.post(DOCUMENT_MAPPING_URL, buildMappingPayload(companyId, documentType, key, value))

/** DELETE invoice/document-mapping/ - removes the one mapping named by its key and value (a DELETE body goes under `data`). */
export const deleteDocumentMapping = (companyId, documentType, key, value) =>
  api.delete(DOCUMENT_MAPPING_URL, { data: buildMappingPayload(companyId, documentType, key, value) })

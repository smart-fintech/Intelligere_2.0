/**
 * DOCUVAULT - every URL of the module.
 *
 *   POST   docuvault/users/       { company_name }
 *          -> { user_details: [{ email, name, designation, total_size,
 *                                total_file_uploads: 'not downloaded/total' }],
 *               total_used_space_gb: '0.02/0.5 GB', storage_status: 'empty' | 'full' }
 *          The Owner gets all of the company's sub users, a sub user only themselves.
 *
 *   POST   docuvault/documents/   { company_name, email }
 *          -> { documents: [{ id, date, document_name, document_description, uploaded_by,
 *                             email, file_upload, file_size, is_downloaded }],
 *               currently_total_size_use, storage_status }
 *          Sizes are in MB; `date` is like "15 Oct. 26-18:31"; `file_upload` is the S3 URL.
 *
 *   POST   docuvault/documents/   multipart, one file per request - see uploadDocument
 *   PUT    docuvault/documents/   { id } - marks a document downloaded
 *   DELETE docuvault/documents/   { id }
 *
 * Nothing here shows a message: a failure, always a 400 { msg }, is an Error
 * carrying the backend's own text (Services/Global/apiService), for the screen to show.
 */

import { DOCUVAULT_MODULE } from '@/Constants/docuVault'
import { hasActiveModule } from '@/Services/Auth/accessService'
import { api } from '@/Services/Global/apiService'
import { MULTIPART } from '@/Services/Global/apiHelpers'

const USERS_URL = 'docuvault/users/'
const DOCUMENTS_URL = 'docuvault/documents/'

// Named so axios sends the FormData as it is - see Services/Company/bankService.

/** Whether the company's `active_modules` lists the module (Services/Auth/accessService). */
export const hasDocuVaultModule = (company) => hasActiveModule(company, DOCUVAULT_MODULE)

export const getDocuVaultUsers = (companyName) => api.post(USERS_URL, { company_name: companyName })

export const getDocuVaultDocuments = (companyName, email) =>
  api.post(DOCUMENTS_URL, { company_name: companyName, email })

/**
 * One file. `count` is its place in the batch and `documentCount` the size of
 * the batch: the backend raises its one notification on `count` 1. The size and
 * the S3 address are the backend's to work out, so they are not sent.
 */
export const uploadDocument = ({ companyName, email, file, description, count = 1, documentCount = 1 }) => {
  const body = new FormData()
  body.append('company_name', companyName)
  body.append('email', email)
  body.append('file', file)
  body.append('document_name', file.name)
  if (description) body.append('document_description', description)
  body.append('count', count)
  body.append('document_count', documentCount)
  return api.post(DOCUMENTS_URL, body, MULTIPART)
}

export const markDocumentDownloaded = (id) => api.put(DOCUMENTS_URL, { id })

export const deleteDocument = (id) => api.delete(DOCUMENTS_URL, { data: { id } })

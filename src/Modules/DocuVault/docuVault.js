/**
 * DocuVault's plain logic - no React, no requests.
 *
 *   readDocumentsReply  docuvault/documents/ -> the reply, each row with `uploaded_at`
 *   isUpdateMessage     whether a WebSocket message is the document_updated event
 *   refreshDocuVault    marks the lists changed, and reads again what is on screen
 *   documentsKey        the cache key of one user's documents
 *   isStorageFull       whether any of the statuses given says full
 *   sameEmail           two emails compared, whatever their case
 *   showStorage         "0.02/0.5 GB" -> "0.02 of 0.5 GB"
 *   showMb              an amount in MB for a cell
 */

import { DOCUVAULT_UPDATED_ACTION, STORAGE_FULL } from '@/Constants/docuVault'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'

/**
 * The time in an API date - "15 Oct. 26-18:31" - for sorting, which that text
 * cannot do by itself ("02 Nov" would come before "15 Oct").
 */
const readUploadTime = (date) => Date.parse(String(date ?? '').replace(/\. (\d{2})-/, ' 20$1 ')) || 0

export const readDocumentsReply = (reply) => ({
  ...reply,
  documents: (reply?.documents ?? []).map((document) => ({ ...document, uploaded_at: readUploadTime(document.date) })),
})

export const isUpdateMessage = (data) => data?.action === DOCUVAULT_UPDATED_ACTION

/** In lower case, as the backend looks emails up: the session's may be spelt as it was typed at sign-in. */
export const documentsKey = (companyName, email) => [QUERY.DOCUVAULT_DOCUMENTS, companyName, String(email).toLowerCase()]

/**
 * After a change to one user's documents. The users are read again for every
 * company: storage is shared across all the Owner's companies, so a file in one
 * moves the figure shown in another.
 */
export const refreshDocuVault = (companyName, email) => {
  invalidateQueries(QUERY.DOCUVAULT_DOCUMENTS, { whose: documentsKey(companyName, email).slice(1), refetchActive: true })
  invalidateQueries(QUERY.DOCUVAULT_USERS, { refetchActive: true })
}

export const isStorageFull = (...statuses) => statuses.includes(STORAGE_FULL)

export const sameEmail = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()

export const showStorage = (value) => String(value ?? '').replace('/', ' of ')

export const showMb = (value) => (value === null || value === undefined ? '--' : `${value} MB`)

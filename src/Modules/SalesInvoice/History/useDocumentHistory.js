/**
 * The company's saved documents for one type and financial year
 * (invoice/business-document-history/):
 *
 *   const history = useDocumentHistory({ companyId, documentType, financialYear })
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      readHistoryRow(...) of each document
 *   error     the message when the list could not be loaded
 *   reload()  reads it again - after a delete, after a Tally fetch
 *
 * It asks again when the company, the type or the year changes, and only
 * then - a re-render is never a request (and the service shares a request
 * still on its way, so React's Strict Mode double effect asks once).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { readHistoryRow, uniqueHistoryRows } from '@/Modules/SalesInvoice/History/historyHelpers'
import { getDocumentHistory } from '@/Services/salesInvoiceService'

const NONE = []

export default function useDocumentHistory({ companyId, documentType, financialYear, refresh = 0 }) {
  const [state, setState] = useState({ status: 'ready', rows: NONE, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(null)
  // `refresh` - a document saved or updated elsewhere - reads the list again, like a reload.
  const key = companyId && documentType && financialYear ? `${companyId}|${documentType}|${financialYear}#${attempt}.${refresh}` : null

  useEffect(() => {
    if (!key) return
    latest.current = key

    getDocumentHistory({ companyId, financialYear, documentType })
      .then((list) => {
        // Each document once, by its document_id - a reply that lists one twice never shows it twice.
        if (latest.current === key) setState({ status: 'ready', rows: uniqueHistoryRows(list.map(readHistoryRow)), error: null, forKey: key })
      })
      .catch((failure) => {
        if (latest.current !== key) return
        setState({ status: 'failed', rows: NONE, error: failure.message, forKey: key })
      })
  }, [key, companyId, financialYear, documentType])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])

  // 'loading' is "the answer held is not for this company, type, year and
  // attempt". A reload of the same list keeps its rows on screen meanwhile.
  if (!key) return { status: 'idle', rows: NONE, error: null, reload }
  if (state.forKey === key) return { ...state, reload }
  const sameList = state.forKey?.split('#')[0] === key.split('#')[0]
  return { status: 'loading', rows: sameList ? state.rows : NONE, error: null, reload }
}

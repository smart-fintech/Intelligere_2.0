/**
 * THE DOCUMENT NUMBER - invoice/last-document-number/, asked for the
 * document type chosen on Step 1, its answer put into the form
 * (applyDocumentDefaults: only fields the user has not touched):
 *
 *   const numbering = useDocumentNumbering({ companyId, documentType, stepIndex, round, apply })
 *   numbering.status   'idle' (no company or type) | 'loading' | 'ready' | 'failed'
 *   numbering.retry()  asks again for the same company and type
 *
 * WHEN IT ASKS
 *   - when the screen opens: the number is there before the Document step
 *   - when Step 2 (or any later step) is reached with a company, document
 *     type or `round` it has not been asked for yet - the type is settled on
 *     Step 1, so flicking through types there asks nothing
 *   - retry()
 *
 * A save starts a new round, but asks NOTHING then: the form it leaves
 * behind is empty and back on Step 1, and the next document's number is
 * asked when that one reaches Step 2 - after the save, so it is never the
 * number just used. Step 3 cannot be reached without passing Step 2.
 *
 * Moving between steps with the same company and type, and re-rendering,
 * never ask again; two asks at once for the same body share one request
 * (getLastDocumentNumber). Only the answer for the type and company now
 * chosen is applied - one for a type left behind is dropped. "No document
 * found" is an answer, not a failure, and leaves the form as it is.
 */

import { useEffect, useState } from 'react'

import { getLastDocumentNumber } from '@/Services/salesInvoiceService'

export default function useDocumentNumbering({ companyId, documentType, stepIndex, round, apply }) {
  const wanted = { companyId, documentType, round }
  const wantedKey = JSON.stringify(wanted)

  // What is asked for. Set while rendering (React's "adjust state when a
  // prop changes" pattern), so no effect runs twice to decide it.
  const [target, setTarget] = useState(wanted)
  const targetKey = JSON.stringify(target)
  if (targetKey !== wantedKey && stepIndex >= 1) setTarget(wanted)

  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState({ key: null, attempt: -1, status: 'loading' })

  useEffect(() => {
    if (!target.companyId || !target.documentType) return undefined
    let current = true
    getLastDocumentNumber(target.companyId, target.documentType)
      .then((reply) => {
        if (!current) return
        apply(reply)
        setAnswer({ key: targetKey, attempt, status: 'ready' })
      })
      .catch((failure) => {
        if (!current) return
        console.warn('[Sales Invoice] Last document number:', failure.message)
        setAnswer({ key: targetKey, attempt, status: 'failed' })
      })
    return () => {
      current = false
    }
    // target is read through targetKey - a new object with the same values is not a new ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, attempt, apply])

  const asking = Boolean(target.companyId && target.documentType)
  const status = !asking ? 'idle' : answer.key === targetKey && answer.attempt === attempt ? answer.status : 'loading'
  return { status, retry: () => setAttempt((count) => count + 1) }
}

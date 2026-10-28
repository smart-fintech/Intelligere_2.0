/**
 * THE DOCUMENT NUMBER - invoice/last-document-number/, asked for the
 * document type chosen on Step 1, its answer put into the form
 * (applyDocumentDefaults: only fields the user has not touched):
 *
 *   const numbering = useDocumentNumbering({ companyId, documentType, round, apply })
 *   numbering.request()  Step 2's Next - asks, unless this company, type and
 *                        round have already been asked (or are being asked)
 *   numbering.retry()    asks again after a failure (the Retry button)
 *   numbering.status     'idle' (not asked for the current type) | 'loading'
 *                        | 'ready' | 'failed'
 *
 * WHEN IT ASKS - only when the Buyer step's Next calls request(). Nothing is
 * asked when the screen opens, on a render, from an effect, on moving
 * between steps, or after a save: a save starts a new `round`, so the next
 * document asks again at ITS Step 2 Next - never reusing the number just
 * used. Pressing Next on Step 2 again with the same company and type asks
 * nothing more; a different type (chosen back on Step 1) asks again.
 *
 * Only the answer for the company, type and round still chosen is applied -
 * one for a type left behind is dropped. "No document found" is an answer,
 * not a failure, and leaves the form as it is.
 *
 * AUTO INCREMENT - numbering.setAutoIncrement(on), the box on Step 3: the
 * company's setting is saved first (saveAutoIncrement), and only once it is
 * does the box change (setAutoIncrement - the form's). Ticked, the number is
 * then asked for again and applied the same way (the last document's parts,
 * the middle one plus 1 - withDocumentDefaults); unticked, nothing is asked
 * and the number typed stays. A refused save changes nothing and asks
 * nothing. `switching` while the save is on its way - one at a time.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import { getLastDocumentNumber, saveAutoIncrement } from '@/Services/salesInvoiceService'

export default function useDocumentNumbering({ companyId, documentType, round, apply, setAutoIncrement }) {
  const key = JSON.stringify({ companyId, documentType, round })
  const [answer, setAnswer] = useState({ key: null, status: 'idle' })

  // The key on screen now - an answer for another is dropped.
  const latest = useRef(key)
  useEffect(() => {
    latest.current = key
  })
  // The key already asked for (in flight or answered) - what a repeated Next skips.
  const asked = useRef(null)

  const ask = useCallback(
    (force) => {
      if (!companyId || !documentType) return
      if (!force && asked.current === key) return
      asked.current = key
      setAnswer({ key, status: 'loading' })

      getLastDocumentNumber(companyId, documentType)
        .then((reply) => {
          if (latest.current !== key) return
          apply(reply)
          setAnswer({ key, status: 'ready' })
        })
        .catch((failure) => {
          // A failure can be asked again - by Retry, or the next Step 2 Next.
          if (asked.current === key) asked.current = null
          if (latest.current !== key) return
          console.warn('[Sales Invoice] Last document number:', failure.message)
          setAnswer({ key, status: 'failed' })
        })
    },
    [key, companyId, documentType, apply],
  )

  const request = useCallback(() => ask(false), [ask])
  const retry = useCallback(() => ask(true), [ask])

  const [switching, setSwitching] = useState(false)
  const saving = useRef(false)
  const switchAutoIncrement = useCallback(
    async (on) => {
      if (saving.current || !companyId) return
      saving.current = true
      setSwitching(true)
      try {
        await saveAutoIncrement(companyId, on)
      } catch (failure) {
        toast.error(failure.message || 'Auto Increment could not be saved.')
        return
      } finally {
        saving.current = false
        setSwitching(false)
      }
      setAutoIncrement(on)
      if (on) ask(true)
    },
    [companyId, setAutoIncrement, ask],
  )

  return { status: answer.key === key ? answer.status : 'idle', request, retry, switching, setAutoIncrement: switchAutoIncrement }
}

/**
 * One of the active company's reports - a list read with its name:
 *
 *   const report = useCompanyReport(getExpiredProducts, isOpen)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      the rows exactly as the backend sent them. A reload keeps the
 *             ones on screen until the new ones arrive. Empty until the first
 *             answer is in.
 *   error     the message when the request failed
 *   reload()  asks again - Refresh and Retry. Nothing retries on its own.
 *
 * `load(companyName)` is the service call (getProductCustomReport,
 * getExpiredProducts ...) - a function defined once, at module level, never
 * one made during render. `enabled` is whether anything on screen needs it:
 * until it first is, nothing is fetched and `status` is 'idle'. Once read,
 * the answer is kept - turning `enabled` off and on again does not ask again,
 * so switching between views costs nothing.
 *
 * The same rules as useProducts: read with the active company's name, from
 * the store, read again whenever the company changes, and an older company's
 * rows are never handed out. A failed request is announced once, here, in
 * the backend's own words.
 */

import { useEffect, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'

const NO_ROWS = []

export default function useCompanyReport(load, enabled = true) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const [state, setState] = useState({ status: 'loading', rows: NO_ROWS, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!enabled || !companyName) return

    const requestKey = `${companyName}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    load(companyName)
      .then((rows) => {
        if (request.current === requestKey) setState({ status: 'ready', rows, error: null, forKey: companyName })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        toast.error(failure.message)
        setState((previous) => ({
          status: 'failed',
          rows: previous.forKey === companyName ? previous.rows : NO_ROWS,
          error: failure.message,
          forKey: companyName,
        }))
      })
  }, [load, enabled, companyName, attempt])

  const mine = Boolean(companyName) && state.forKey === companyName
  const asked = enabled || mine

  return {
    status: !companyName || !asked ? 'idle' : mine ? state.status : 'loading',
    rows: mine ? state.rows : NO_ROWS,
    error: mine ? state.error : null,
    reload: () => {
      setState((previous) => ({ ...previous, status: 'loading' }))
      setAttempt((count) => count + 1)
    },
  }
}

/**
 * One of the shared code lists (Services/codeList), for the field that
 * offers it - the HSN dropdown on a Product form, the SAC dropdown on the
 * Ledger form:
 *
 *   const sac = useCodeList(cachedSacList, loadSacList)
 *
 *   status    'loading' | 'ready' | 'failed'
 *   list      [{ code, names }] - empty until it is in
 *   error     the message when the request failed
 *   retry()   asks again
 *
 * The list itself is kept by the service - fetched once for the whole app,
 * the same request shared by every screen asking at once - so a second form,
 * or the same one opened again, has it straight away and this asks for
 * nothing.
 *
 * `cached` and `load` are the service's own functions, which never change,
 * so the effect below re-runs only when Retry says to.
 */

import { useEffect, useState } from 'react'

const NOTHING = []

export function useCodeList(cached, load) {
  const [state, setState] = useState(() => {
    const list = cached()
    return list
      ? { status: 'ready', list, error: null }
      : { status: 'loading', list: NOTHING, error: null }
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cached()) return undefined

    let current = true

    load()
      .then((list) => {
        if (current) setState({ status: 'ready', list, error: null })
      })
      .catch((failure) => {
        // `failure.message` is the backend's own text (see authService).
        if (current) setState({ status: 'failed', list: NOTHING, error: failure.message })
      })

    return () => {
      current = false
    }
  }, [attempt, cached, load])

  return {
    ...state,
    retry: () => {
      setState({ status: 'loading', list: NOTHING, error: null })
      setAttempt((count) => count + 1)
    },
  }
}

export default useCodeList

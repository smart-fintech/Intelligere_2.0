/**
 * The units the active company's products can be counted in, as the choices
 * of the Product form's Unit dropdown:
 *
 *   const units = useProductUnits()
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   options   [{ value, label }] - both the unit exactly as the backend
 *             names it ("NOS", "Nos" and "N/A" are three different units)
 *   error     the message when the request failed
 *   retry()   asks again - nothing retries on its own
 *
 * Read with the active company's name, from the store and never typed, and
 * read again whenever the company changes - the same way useProductGroups
 * reads the groups. An older company's units are never handed out: until
 * the answer for THIS company is in, `options` is empty.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getProductUnits } from '@/Services/productService'

const NO_UNITS = []

export default function useProductUnits() {
  const { activeCompanyName: companyName } = useActiveCompany()

  const [state, setState] = useState({ status: 'loading', units: NO_UNITS, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyName) return

    const requestKey = `${companyName}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getProductUnits(companyName)
      .then((units) => {
        if (request.current === requestKey) setState({ status: 'ready', units, error: null, forKey: companyName })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        setState({ status: 'failed', units: NO_UNITS, error: failure.message, forKey: companyName })
      })
  }, [companyName, attempt])

  const mine = Boolean(companyName) && state.forKey === companyName
  const units = mine ? state.units : NO_UNITS

  const options = useMemo(() => [...new Set(units)].map((unit) => ({ value: unit, label: unit })), [units])

  return {
    status: !companyName ? 'idle' : mine ? state.status : 'loading',
    options,
    error: mine ? state.error : null,
    retry: () => {
      setState((previous) => ({ ...previous, forKey: null }))
      setAttempt((count) => count + 1)
    },
  }
}

/**
 * The units a product can be counted in, as the choices of the Product
 * form's Unit dropdown:
 *
 *   const units = useProductUnits()
 *
 *   status    'loading' | 'ready' | 'failed'
 *   options   [{ value, label }] - both the unit exactly as the backend
 *             names it ("NOS", "Nos" and "N/A" are three different units)
 *   error     the message when the request failed
 *   retry()   asks again - nothing retries on its own
 *
 * The request itself is made, and its answer kept, by getProductUnits in
 * Services/productService - the list is the same for every company, so any
 * number of screens using this hook, and any number of remounts, share ONE
 * request per visit.
 */

import { useEffect, useMemo, useState } from 'react'

import { getProductUnits } from '@/Services/productService'

const LOADING = { status: 'loading', units: null, error: null }

export default function useProductUnits() {
  const [state, setState] = useState(LOADING)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // An answer arriving after the screen has gone is dropped.
    let current = true

    getProductUnits()
      .then((units) => {
        if (current) setState({ status: 'ready', units, error: null })
      })
      .catch((failure) => {
        if (current) setState({ status: 'failed', units: null, error: failure.message })
      })

    return () => {
      current = false
    }
  }, [attempt])

  const options = useMemo(
    () => [...new Set(state.units ?? [])].map((unit) => ({ value: unit, label: unit })),
    [state.units],
  )

  return {
    status: state.status,
    options,
    error: state.error,
    retry: () => {
      setState(LOADING)
      setAttempt((count) => count + 1)
    },
  }
}

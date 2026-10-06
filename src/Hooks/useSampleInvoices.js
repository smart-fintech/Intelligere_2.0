/**
 * The sample invoices behind the Invoice Format field, for any screen that
 * shows them:
 *
 *   const { status, formats, error, retry } = useSampleInvoices()
 *
 *   status    'loading' | 'ready' | 'failed'
 *   formats   [{ value: '1', src }, ...] - one per sample invoice image
 *   error     the message when the request failed
 *   retry()   asks again - nothing retries on its own
 *
 * The request itself is made, and its answer kept, by getSampleInvoices in
 * Services/inventoryService - so any number of screens using this hook, and
 * any number of remounts, share ONE request per visit.
 */

import { useEffect, useMemo, useState } from 'react'

import { getSampleInvoices, toInvoiceFormats } from '@/Services/inventoryService'

const LOADING = { status: 'loading', data: null, error: null }

export default function useSampleInvoices() {
  const [state, setState] = useState(LOADING)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // An answer arriving after the screen has gone is dropped.
    let current = true

    getSampleInvoices()
      .then((data) => {
        if (current) setState({ status: 'ready', data, error: null })
      })
      .catch((failure) => {
        if (current) setState({ status: 'failed', data: null, error: failure.message })
      })

    return () => {
      current = false
    }
  }, [attempt])

  const formats = useMemo(() => toInvoiceFormats(state.data), [state.data])

  return {
    status: state.status,
    error: state.error,
    formats,
    retry: () => {
      setState(LOADING)
      setAttempt((count) => count + 1)
    },
  }
}

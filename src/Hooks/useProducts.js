/**
 * The active company's products, for whichever Product page is showing:
 *
 *   const products = useProducts()
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      the products exactly as the backend sent them. While a reload
 *             is on its way, and after one that failed, these are still the
 *             rows from before - a list on screen is never emptied by a
 *             Refresh. Empty until the first answer is in.
 *   error     the message when the request failed
 *   reload()  asks again - Refresh, Retry, and after a save or a sync.
 *             Nothing retries on its own.
 *
 * ONE CALL FOR EVERYONE: getProducts in Services/inventoryService - POST
 * inventory/product/ with the company's name. Tally or Intelligere, MSME or
 * Accounting Professional, with Inventory Management or without, the list
 * is fetched the same way, here, and holds the company's products with SKUs
 * and without alike. What differs between the two Product pages is only how
 * each reads a row.
 *
 * Read with the active company's name, from the store and never typed, and
 * read again whenever the company changes. An older company's products are
 * never handed out: until the answer for THIS company is in, `rows` is
 * empty and `status` is 'loading'. A failed request is announced once, here,
 * in the backend's own words (see authService).
 *
 * Only one Product page is ever on screen for a user (see
 * useInventoryAccess), so this is asked once per company, not once per page.
 */

import { useEffect, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { getProducts } from '@/Services/inventoryService'

/** What a company whose list is not in shows - one array, so memos built on it hold. */
const NO_ROWS = []

export default function useProducts() {
  const { activeCompanyName: companyName } = useActiveCompany()

  // Kept with the company it belongs to: a result for an older company (the
  // header changed while it was on its way) is not this company's.
  const [state, setState] = useState({ status: 'loading', rows: NO_ROWS, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyName) return

    const requestKey = `${companyName}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getProducts(companyName)
      .then((rows) => {
        if (request.current === requestKey) setState({ status: 'ready', rows, error: null, forKey: companyName })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        toast.error(failure.message)
        setState((previous) => ({
          status: 'failed',
          // The rows already on screen stay if they are this company's.
          rows: previous.forKey === companyName ? previous.rows : NO_ROWS,
          error: failure.message,
          forKey: companyName,
        }))
      })
  }, [companyName, attempt])

  const mine = Boolean(companyName) && state.forKey === companyName

  return {
    status: !companyName ? 'idle' : mine ? state.status : 'loading',
    rows: mine ? state.rows : NO_ROWS,
    error: mine ? state.error : null,
    reload: () => {
      setState((previous) => ({ ...previous, status: 'loading' }))
      setAttempt((count) => count + 1)
    },
  }
}

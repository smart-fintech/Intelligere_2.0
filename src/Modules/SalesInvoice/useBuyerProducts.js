/**
 * The products this buyer has had on earlier documents of this type
 * (invoice/unique-products/), offered under the Product Details form:
 *
 *   const buyerProducts = useBuyerProducts({ companyId, ledgerId, documentType })
 *
 *   status   'idle' | 'loading' | 'ready' | 'failed'
 *   rows     [{ "Product Name", sku_code, hsn_sac_code, ... }] as the server sent them
 *
 * `ledgerId` is the buyer's ledger once the Buyer step has been completed
 * (and its details saved) - until then it is null and nothing is asked.
 * It asks again when the buyer, the company or the document type changes,
 * and only then: a re-render is never a request.
 */

import { useEffect, useRef, useState } from 'react'

import { getUniqueProducts } from '@/Services/salesInvoiceService'

const NONE = []

export default function useBuyerProducts({ companyId, ledgerId, documentType }) {
  const [state, setState] = useState({ status: 'idle', rows: NONE, forKey: null })
  const latest = useRef(null)
  const key = companyId && ledgerId && documentType ? `${companyId}|${ledgerId}|${documentType}` : null

  useEffect(() => {
    if (!key) return
    latest.current = key

    getUniqueProducts({ companyId, ledgerId, documentType })
      .then((rows) => {
        if (latest.current === key) setState({ status: 'ready', rows, forKey: key })
      })
      .catch((failure) => {
        if (latest.current !== key) return
        console.warn('[Sales Invoice] The buyer’s earlier products could not be loaded:', failure.message)
        setState({ status: 'failed', rows: NONE, forKey: key })
      })
  }, [key, companyId, ledgerId, documentType])

  // 'loading' is "the answer held is not for this buyer, company and type".
  if (!key) return { status: 'idle', rows: NONE }
  return state.forKey === key ? { status: state.status, rows: state.rows } : { status: 'loading', rows: NONE }
}

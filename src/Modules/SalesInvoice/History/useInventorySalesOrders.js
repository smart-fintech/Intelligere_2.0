/**
 * The company's inventory-managed Sales Orders (inventory/sales_order_history/):
 *
 *   const orders = useInventorySalesOrders(companyName)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      readInventorySalesOrder(...) of each order
 *   error     the message when the list could not be loaded
 *   reload()  reads it again (Retry)
 *
 * Asked when the hook is first used - the Inventory Sales Order view is
 * mounted only once that radio is chosen - and again when the company
 * changes or reload() is called; a re-render is never a request (and the
 * service shares a request still on its way, so Strict Mode asks once).
 */

import { useCallback, useEffect, useState } from 'react'

import { readInventorySalesOrder } from '@/Modules/SalesInvoice/History/inventorySalesOrders'
import { getInventorySalesOrderHistory } from '@/Services/salesInvoiceService'

const NONE = []

export default function useInventorySalesOrders(companyName) {
  const [state, setState] = useState({ status: 'ready', rows: NONE, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const key = companyName ? `${companyName}#${attempt}` : null

  useEffect(() => {
    if (!key) return undefined
    let current = true
    getInventorySalesOrderHistory(companyName)
      .then((list) => current && setState({ status: 'ready', rows: list.map(readInventorySalesOrder), error: null, forKey: key }))
      .catch((failure) => current && setState({ status: 'failed', rows: NONE, error: failure.message || 'The Sales Orders could not be loaded.', forKey: key }))
    return () => {
      current = false
    }
  }, [key, companyName])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])

  // 'loading' is "the answer held is not for this company and attempt" - a reload keeps its rows on screen meanwhile.
  if (!key) return { status: 'idle', rows: NONE, error: null, reload }
  if (state.forKey === key) return { ...state, reload }
  const sameList = state.forKey?.split('#')[0] === key.split('#')[0]
  return { status: 'loading', rows: sameList ? state.rows : NONE, error: null, reload }
}

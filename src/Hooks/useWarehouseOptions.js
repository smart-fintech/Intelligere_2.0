/**
 * The active company's warehouses as the choices of a dropdown - for saying
 * where a product's stock is kept:
 *
 *   const warehouses = useWarehouseOptions(formNeedsThem)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   options   [{ value, label }] - `value` is the warehouse's identifier
 *             (`warehouse_obj_id`) as text, which is both what a dropdown
 *             works in and how the product endpoint takes it; `label` is the
 *             warehouse's name
 *   error     the message when the request failed
 *   retry()   asks again - nothing retries on its own
 *
 * `enabled` is whether anything on screen needs them. While it is false
 * NOTHING is fetched and `status` is 'idle'.
 *
 * The same list the Warehouse tab shows (getWarehouses), read with the same
 * `company_id` from the store. A warehouse that has arrived without an
 * identifier cannot be chosen, so it is left out.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getWarehouseId, getWarehouses } from '@/Services/inventoryService'

const NO_WAREHOUSES = []

export default function useWarehouseOptions(enabled) {
  const { activeCompanyId: companyId } = useActiveCompany()

  // Kept with the company it belongs to, as on the Warehouse tab: an answer
  // for a company the header has since left is not this company's.
  const [state, setState] = useState({ status: 'loading', warehouses: NO_WAREHOUSES, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!enabled || !companyId) return

    const requestKey = `${companyId}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getWarehouses(companyId)
      .then((warehouses) => {
        if (request.current === requestKey) setState({ status: 'ready', warehouses, error: null, forKey: companyId })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        setState({ status: 'failed', warehouses: NO_WAREHOUSES, error: failure.message, forKey: companyId })
      })
  }, [enabled, companyId, attempt])

  const mine = enabled && Boolean(companyId) && state.forKey === companyId
  const warehouses = mine ? state.warehouses : NO_WAREHOUSES

  const options = useMemo(
    () =>
      warehouses.reduce((list, warehouse) => {
        const id = getWarehouseId(warehouse)
        if (id === null) return list

        list.push({ value: String(id), label: warehouse.name || `Warehouse ${id}` })
        return list
      }, []),
    [warehouses],
  )

  return {
    status: !enabled || !companyId ? 'idle' : mine ? state.status : 'loading',
    options,
    error: mine ? state.error : null,
    retry: () => {
      setState((previous) => ({ ...previous, forKey: null }))
      setAttempt((count) => count + 1)
    },
  }
}

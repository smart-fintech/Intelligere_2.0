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
 * A second argument names another company's `company_id`, for a screen that
 * is about a company other than the active one (Create Sub User):
 *
 *   const warehouses = useWarehouseOptions(true, company.company_id)
 *
 * The same list the Warehouse tab shows - the shared one (useWarehouses), so
 * it costs no request when another screen has it already, and it follows a
 * warehouse created, changed or deleted. A warehouse that has arrived without
 * an identifier cannot be chosen, so it is left out.
 */

import { useMemo } from 'react'

import useWarehouses from '@/Hooks/useWarehouses'
import { getWarehouseId } from '@/Services/inventoryService'

export default function useWarehouseOptions(enabled, forCompanyId) {
  const { status, warehouses, error, reload } = useWarehouses(enabled, forCompanyId)

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

  return { status, options, error, retry: reload }
}

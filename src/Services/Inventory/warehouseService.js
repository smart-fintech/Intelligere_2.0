/**
 * A company's warehouses (Inventory Details' Warehouse tab, and every screen
 * that picks one through useWarehouses).
 */

import { BUSINESS_TYPE_MANUFACTURER } from '@/Constants/inventory'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toList } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'

/*
 * ONE URL, FOUR JOBS - AND THE LIST IS A **POST**, as with the ledgers:
 *
 *   POST    inventory/warehouse_create/   list them   { company_id }
 *   POST    inventory/warehouse_create/   add one     { company_id, ...warehouse }
 *   PUT     inventory/warehouse_create/   change one  { warehouse_obj_id, ...warehouse }
 *   DELETE  inventory/warehouse_create/   remove one  { warehouse_obj_id }
 *
 * The list answers with a bare array of:
 *
 *   { "warehouse_obj_id": 5, "company_id": 1, "name": "Main Warehouse",
 *     "warehouse_address": "...", "contact": "9876543210", "email": "...",
 *     "pincode": "380001", "state_name": "Gujarat",
 *     "contact_person_name": "Ramesh", "is_manufacturing_plant": false,
 *     "is_active": true, ... }
 *
 * Saving and deleting answer { msg, data? }; only `msg` is ever shown.
 *
 * The list is kept in the shared cache and read through useWarehouses, so
 * every screen shares one answer per company. A create, change or delete
 * that succeeded reads it again (changesWarehouses) - once, for every screen
 * showing it, and on next use for the rest. A failed one changes nothing.
 */
const WAREHOUSE_URL = 'inventory/warehouse_create/'

/** Passes `request`'s answer on unchanged, reading the warehouse lists again once it succeeded. */
const changesWarehouses = (request) =>
  request.then((reply) => {
    invalidateQueries(QUERY.WAREHOUSES, { refetchActive: true })
    return reply
  })

/** A warehouse's identifier - its row key, and what update and delete name. */
export const getWarehouseId = (warehouse) => warehouse?.warehouse_obj_id ?? null

/**
 * Whether this company's warehouses have the Manufacturing Plant setting
 * (`is_manufacturing_plant`). The company's Master Details decide it, by
 * their `business_type`:
 *
 *   Manufacturer   no  - the form does not show it and does not send it
 *   anything else  yes - Trader, and a company with no Master Details yet
 *
 * `masterDetails` is the company's record as the backend sent it (see
 * useMasterDetails), or null when it has none. This is the ONE place the
 * rule is written; a screen asks it rather than comparing the value itself.
 * Only ask once the record has actually been read - while it is loading, or
 * when reading it failed, there is no answer and none should be assumed.
 */
export const hasManufacturingPlantSetting = (masterDetails) =>
  masterDetails?.business_type === BUSINESS_TYPE_MANUFACTURER

/**
 * The warehouses of one company. The id comes from the caller, which reads
 * it from the active company in the store - never from a form. Without one
 * there is nothing to ask for. Screens read it through useWarehouses, never
 * directly, so it is asked once and shared.
 */
export const getWarehouses = async (companyId) => {
  if (!companyId) return []

  return toList(await api.post(WAREHOUSE_URL, { company_id: companyId }))
}

/** Adds a warehouse. `payload` is the form plus the active company's `company_id`. */
export const createWarehouse = (payload) => changesWarehouses(api.post(WAREHOUSE_URL, payload))

/** Changes a warehouse. `payload` is the form plus its `warehouse_obj_id`. */
export const updateWarehouse = (payload) => changesWarehouses(api.put(WAREHOUSE_URL, payload))

/**
 * Removes a warehouse - only its id goes up. A DELETE with a body has to be
 * put under `data` for axios to send it, hence the wrapper here.
 */
export const deleteWarehouse = (warehouseId) =>
  changesWarehouses(api.delete(WAREHOUSE_URL, { data: { warehouse_obj_id: warehouseId } }))

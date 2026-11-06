/**
 * The Inventory Details settings of the company the user is working in - its
 * Master Details record - and the plan checks every inventory screen asks
 * (hasInventoryManagement, hasSingleWarehouseLimit, isSkuManagementEnabled).
 *
 * The rest of Inventory lives beside this file, one per backend resource:
 *
 *   warehouseService            inventory/warehouse_create/
 *   vendorService               inventory/vendor_create/, vendor_search/
 *   customFieldService          inventory/company_dynamic_fields/
 *   inventoryProductService     inventory/product/ and the product reports
 *   transferNoteService         inventory/transfer_notes/
 *   inventoryAdjustmentService  inventory/update_inventory/, inventory_adjustments/
 *   forecastService             inventory/forecastRules/, forecast/
 *   inventoryBookingService     inventory booking and the stock summary
 *
 * Nothing in these files shows a message. The shared axios setup (see
 * Services/Global/apiService) has already turned a failure into a plain Error
 * carrying the backend's own text, so the screen that made the call writes
 * one `catch` and shows `error.message`.
 *
 * ------------------------------------------------------------------
 * MASTER DETAILS - ONE URL, AND THE READ IS A **POST**
 * ------------------------------------------------------------------
 *   POST  inventory/company_master_details/   read     { comp_name, email }
 *   POST  inventory/company_master_details/   create   the whole record
 *   PUT   inventory/company_master_details/   change   { company_master_id, ...record }
 *
 * The warehouses have their own URL - see warehouseService.
 *
 * Reading and creating are the same method on the same URL; only the body
 * tells them apart - a body with just the company and the email is a query,
 * a full one is a new record. That is why they are two named functions here,
 * as with the ledgers: no screen should have to remember which shape means
 * what. Changing a record follows the project's convention for these
 * endpoints (see ledgerService) - a PUT naming the row it changes.
 *
 * A record looks like this:
 *
 *   { "company_master_id": 4, "user": "...", "company": "...",
 *     "industry_type": "Automobile", "business_type": "Manufacturer",
 *     "fifo_lifo": "FIFO", "pdf_format": "1", "is_negative": true,
 *     "barcode": false, "sku": true, "dead_stock": 10,
 *     "expiry_alert_days": 5, "sku_pattern": [...], ... }
 */

import {
  COMPANY_FEATURE_SINGLE_WAREHOUSE,
  PREMIUM_MODULE_INVENTORY_MANAGEMENT,
} from '@/Constants/inventory'
import { api } from '@/Services/Global/apiService'

const MASTER_DETAILS_URL = 'inventory/company_master_details/'

/* ------------------------------------------------------------------ */
/* Master Details                                                     */
/* ------------------------------------------------------------------ */

/** A company's master record's identifier - the one field that proves it exists. */
export const getMasterDetailsId = (record) => record?.company_master_id ?? null

/**
 * The master record inside a reply, or null when the reply holds none.
 *
 * The read answers with the record itself today. Being wrapped in
 * `{ data: {...} }` or sent as a one-item list later is the sort of change
 * that arrives without warning, so those are accepted too. Whatever the
 * shape, only an object carrying `company_master_id` counts as a record -
 * an empty object, an empty list or a `{ msg: "..." }` all mean "there is
 * nothing saved yet".
 */
export const toMasterDetails = (response) => {
  const candidates = [response, response?.data, response?.results]

  for (const candidate of candidates) {
    const record = Array.isArray(candidate) ? candidate[0] : candidate
    if (record && typeof record === 'object' && getMasterDetailsId(record) != null) return record
  }

  return null
}

/**
 * The company's master record, or null when it has none yet.
 *
 * A POST, not a GET - the backend takes the company name and the user's
 * email in the body. Both are passed in by the caller, which reads them from
 * the active company and the session, so neither is ever written down here.
 *
 * A 404 is read as "no record" rather than as a failure: it is how a REST
 * view usually says a lookup found nothing, and the screen shows the Add form
 * either way. Any other failure is thrown for the screen to show.
 */
export const getMasterDetails = async ({ compName, email }) => {
  try {
    return toMasterDetails(await api.post(MASTER_DETAILS_URL, { company_name: compName, email }))
  } catch (failure) {
    if (failure.status === 404) return null
    throw failure
  }
}

/** Saves a company's first master record. `payload` is the whole form. */
export const createMasterDetails = (payload) => api.post(MASTER_DETAILS_URL, payload)

/**
 * Changes a company's master record. `payload` carries `company_master_id`,
 * which tells the backend which row it is.
 */
export const updateMasterDetails = (payload) => api.put(MASTER_DETAILS_URL, payload)

/* ------------------------------------------------------------------ */
/* Inventory Management - who has it                                  */
/* ------------------------------------------------------------------ */

/**
 * Whether a company's plan includes Inventory Management: its
 * `premium_modules` (from tally/user-companies-list/, so already in the
 * store with the rest of the company) lists "Inventory Management", spelt
 * exactly so. A company without the list, or without that entry, does not.
 *
 * `company` is the active company's record - see useActiveCompany.
 *
 * This is only half of the question "does this user get the full inventory
 * screens?" - the other half is who the user is. Screens ask
 * Hooks/useInventoryAccess, which answers both.
 */
export const hasInventoryManagement = (company) =>
  Array.isArray(company?.premium_modules) &&
  company.premium_modules.includes(PREMIUM_MODULE_INVENTORY_MANAGEMENT)

/**
 * Whether a company's plan holds it to ONE warehouse: its `features` (from
 * tally/user-companies-list/ too, on the same record) lists
 * "Single Warehouse", spelt exactly so. A company without the list, or
 * without that entry, may have as many as it likes.
 *
 * `company` is the active company's record - see useActiveCompany. Two
 * screens ask: the Warehouse tab, which then lets only one be created, and
 * the Product form, which then puts all of a product's stock in that one.
 */
export const hasSingleWarehouseLimit = (company) =>
  Array.isArray(company?.features) && company.features.includes(COMPANY_FEATURE_SINGLE_WAREHOUSE)

/* ------------------------------------------------------------------ */
/* SKU management                                                     */
/* ------------------------------------------------------------------ */

/**
 * Whether the company has SKU management switched on: the `sku` setting of
 * its Master Details ("Enable SKU" on that tab). A company with no Master
 * Details yet has not switched it on.
 *
 * `masterDetails` is the record as the backend sent it (see
 * useMasterDetails). Only ask once it has actually been read - while it is
 * loading, or when reading it failed, there is no answer and none should be
 * assumed.
 */
export const isSkuManagementEnabled = (masterDetails) => masterDetails?.sku === true

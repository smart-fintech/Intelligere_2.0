/**
 * The Inventory Details settings of the company the user is working in.
 *
 * Every inventory URL in the project is written here and nowhere else, so a
 * screen calls a named function and never an endpoint:
 *
 *   import { getMasterDetails, createMasterDetails } from '@/Services/inventoryService'
 *
 * Nothing in this file shows a message. The shared axios setup (see
 * Services/authService) has already turned a failure into a plain Error
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
 * The warehouses have their own URL - see "Warehouses" below.
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

import { api } from '@/Services/authService'

const MASTER_DETAILS_URL = 'inventory/company_master_details/'
const SAMPLE_INVOICE_URL = 'invoice/SampleInvoice/'

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
/* Warehouses                                                         */
/* ------------------------------------------------------------------ */

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
 */
const WAREHOUSE_URL = 'inventory/warehouse_create/'

/** A warehouse's identifier - its row key, and what update and delete name. */
export const getWarehouseId = (warehouse) => warehouse?.warehouse_obj_id ?? null

/**
 * A bare array today; `{ data: [...] }` or `{ results: [...] }` are accepted
 * too, and anything else is an empty list rather than a crash in a `.map()`.
 */
const toList = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.results)) return response.results
  return []
}

/**
 * The warehouses of one company. The id comes from the caller, which reads
 * it from the active company in the store - never from a form. Without one
 * there is nothing to ask for.
 */
export const getWarehouses = async (companyId) => {
  if (!companyId) return []

  return toList(await api.post(WAREHOUSE_URL, { company_id: companyId }))
}

/** Adds a warehouse. `payload` is the form plus the active company's `company_id`. */
export const createWarehouse = (payload) => api.post(WAREHOUSE_URL, payload)

/** Changes a warehouse. `payload` is the form plus its `warehouse_obj_id`. */
export const updateWarehouse = (payload) => api.put(WAREHOUSE_URL, payload)

/**
 * Removes a warehouse - only its id goes up. A DELETE with a body has to be
 * put under `data` for axios to send it, hence the wrapper here.
 */
export const deleteWarehouse = (warehouseId) =>
  api.delete(WAREHOUSE_URL, { data: { warehouse_obj_id: warehouseId } })

/* ------------------------------------------------------------------ */
/* Sample invoices - the formats the Invoice Format field offers       */
/* ------------------------------------------------------------------ */

/**
 *   GET  invoice/SampleInvoice/
 *
 *   { "images": [url, ...], "pdfs": [...], "format_notes": [...], "msg": "" }
 *
 * Only `images` is used: each image IS an invoice format. `pdfs` and
 * `format_notes` are not shown anywhere, so they are not kept.
 *
 * The list is the same for every company and every user, so it is fetched
 * ONCE per visit to the app and the answer kept here: opening the form again,
 * switching company or entering edit mode costs no second request. A failed
 * request is not kept, so Retry really asks again.
 */
let sampleInvoicesRequest = null

export const getSampleInvoices = () => {
  if (!sampleInvoicesRequest) {
    sampleInvoicesRequest = api
      .get(SAMPLE_INVOICE_URL)
      .then((response) => ({ images: Array.isArray(response?.images) ? response.images : [] }))
      .catch((failure) => {
        sampleInvoicesRequest = null
        throw failure
      })
  }

  return sampleInvoicesRequest
}

/**
 * The invoice formats the user picks from, as `{ value, src }`.
 *
 * `pdf_format` is the image's position in `images` plus one - images[0] is
 * format "1". The number is taken BEFORE an unusable entry is dropped, so a
 * blank in the list never shifts the formats after it. Values are strings,
 * the way the record holds them, so a saved value and a picked one compare
 * equal; the form sends the number.
 */
export const toInvoiceFormats = (samples) =>
  (samples?.images ?? [])
    .map((src, index) => ({ value: String(index + 1), src }))
    .filter(({ src }) => typeof src === 'string' && src.trim())

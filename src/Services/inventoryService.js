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

import { BUSINESS_TYPE_MANUFACTURER, productFieldPlacement } from '@/Constants/inventory'
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
/* Vendors                                                            */
/* ------------------------------------------------------------------ */

/*
 * ONE URL, THREE JOBS - AND THE LIST IS A **POST**, as with the warehouses:
 *
 *   POST  inventory/vendor_create/   list them    { company_id }
 *   POST  inventory/vendor_create/   add one      the vendor
 *   PUT   inventory/vendor_create/   change one   the vendor plus its identifier
 *
 * and a second URL looks for a vendor that is already on record:
 *
 *   POST  inventory/vendor_search/   { gst_no?, pan_no?, email? }
 *
 * A vendor looks like this. Two of its parts belong to a company and are
 * filed under that company's `company_id`; the rest is the vendor's own:
 *
 *   { "company_details": { "256": { "ledger_name": "Samir sales",
 *                                   "company_name": "Bhavi", ...,
 *                                   "is_verified": false, "is_deleted": false } },
 *     "rating":          { "256": { "Price Competitiveness": 3.5, ...,
 *                                   "Overall Rating": 7.5 } },
 *     "address": "...", "contact": "...", "whatsapp": "...", "email": "...",
 *     "country": "India", "state": "Gujarat", "city": "Ahmedabad",
 *     "gst_no": "...", "pan_no": "...", ... }
 *
 * A save sends the same shape back, with only `ledger_name` under
 * `company_details` - the other properties there are the backend's to fill -
 * and the nine ratings together with "Overall Rating", which the Vendor form
 * works out as their average (overallVendorRating in Constants/inventory).
 * A reply carries more than this (machinery, certifications, documents ...);
 * those belong to other screens and are neither shown nor sent from here.
 *
 * Saving answers { msg }. The search answers
 * { status, msg, data: { vendor_id, address, country, state, city, contact,
 * whatsapp, email, gst_no } } - `status: false` and an empty `data` when
 * nothing matched.
 *
 * THERE IS NO DELETE HERE YET. A vendor carries an `is_deleted` flag per
 * company, but how one is set has not been confirmed, and a guessed method
 * or body could remove the wrong thing; it is added as one function below
 * once the contract is known.
 */
const VENDOR_URL = 'inventory/vendor_create/'
const VENDOR_SEARCH_URL = 'inventory/vendor_search/'

/**
 * A vendor's identifier, as the one property the update needs - under the
 * name the backend gave it.
 *
 * The search names it `vendor_id`; a row of the list may carry it as
 * `vendor_id` or as a plain `id`. Whichever arrived is what goes back, so
 * the name is never chosen here. Null when the row has neither.
 */
export const vendorIdentifier = (vendor) => {
  if (vendor?.vendor_id != null) return { vendor_id: vendor.vendor_id }
  if (vendor?.id != null) return { id: vendor.id }
  return null
}

/** A vendor's identifier as a plain value - its row key. */
export const getVendorId = (vendor) => vendor?.vendor_id ?? vendor?.id ?? null

/**
 * The part of a vendor that belongs to one company: its ledger there, and
 * whether that company has verified or deleted it. Null when the vendor has
 * nothing filed under that company.
 */
export const vendorCompanyDetails = (vendor, companyId) => vendor?.company_details?.[companyId] ?? null

/** The scores one company has given a vendor, or null when it has given none. */
export const vendorRating = (vendor, companyId) => vendor?.rating?.[companyId] ?? null

/**
 * The vendors of one company. The id comes from the caller, which reads it
 * from the active company in the store - never from a form. Without one
 * there is nothing to ask for.
 */
export const getVendors = async (companyId) => {
  if (!companyId) return []

  return toList(await api.post(VENDOR_URL, { company_id: companyId }))
}

/** Adds a vendor. `payload` is the vendor, with its company parts under the active `company_id`. */
export const createVendor = (payload) => api.post(VENDOR_URL, payload)

/** Changes a vendor. `payload` is the vendor plus its identifier (see vendorIdentifier). */
export const updateVendor = (payload) => api.put(VENDOR_URL, payload)

/**
 * Looks for a vendor already on record. `criteria` holds only what the user
 * filled in - one or more of `gst_no`, `pan_no`, `email` - and an empty one
 * is never sent: checking that is the form's job.
 */
export const searchVendor = (criteria) => api.post(VENDOR_SEARCH_URL, criteria)

/* ------------------------------------------------------------------ */
/* Customised Fields                                                  */
/* ------------------------------------------------------------------ */

/*
 * ONE URL, ONE METHOD - the body alone says which job it is:
 *
 *   POST  inventory/company_dynamic_fields/   list them    { company_name }
 *   POST  inventory/company_dynamic_fields/   add one      { company_name, custom_fields: { ...field } }
 *   POST  inventory/company_dynamic_fields/   change one   { company_name, custom_fields: { ...the WHOLE field } }
 *
 * `custom_fields` is ONE field, not a list. A change sends the field
 * complete - every property it came with, edited or not - so nothing the
 * form does not show is lost on the way back.
 *
 * The list answers with a bare array of:
 *
 *   { "sr_no": 2, "field_name": "Category", "field_type": "dropdown",
 *     "field_size": "2", "field_order": 2, "options": ["Raw Material", ...],
 *     "option_type": "single", "is_required": true, "hide_field": false,
 *     "customizedReport": true, "invoice_description": false,
 *     "sku_field": true, "sku_no": 1 }          <- the last two only on some
 *
 * The property names are the backend's own, mixed casing included
 * (`customizedReport`), and are never renamed here or in the form.
 *
 * THERE IS NO DELETE HERE YET. How this endpoint removes a field has not
 * been confirmed, and a guessed method or body could remove the wrong thing;
 * it is added as one function below once the contract is known.
 */
const CUSTOM_FIELDS_URL = 'inventory/company_dynamic_fields/'

/**
 * The customised fields of one company. The name comes from the caller,
 * which reads it from the active company in the store - never from a form.
 * Without one there is nothing to ask for.
 */
export const getCustomFields = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(CUSTOM_FIELDS_URL, { company_name: companyName }))
}

/**
 * Adds a field, or changes one - the same call either way. `field` is the
 * complete field as the backend names its properties.
 */
export const saveCustomField = (companyName, field) =>
  api.post(CUSTOM_FIELDS_URL, { company_name: companyName, custom_fields: field })

/* ------------------------------------------------------------------ */
/* Products                                                           */
/* ------------------------------------------------------------------ */

/*
 *   POST  inventory/product/   create a product   (the body: buildProductPayload)
 *
 * which answers
 *
 *   { "msg": "Product saved successfully", "product_id": 1,
 *     "sku_code": "PRI-COT-COT-140-001", "sku_details": { ... } }
 *
 * THERE IS NO LIST, UPDATE OR DELETE HERE YET. How this endpoint lists a
 * company's products - its method, what it is asked with and what a row
 * looks like - has not been confirmed, and neither has changing or removing
 * one; each is added as one function below once its contract is known.
 *
 * ONE QUESTION decides what a company's Product form is:
 *
 *   isSkuManagementEnabled(masterDetails)   has it switched SKUs on?
 *
 * With SKUs the form has a SKU Details section, an entry per SKU; without,
 * it is a single product. A field marked `sku_field` says which fields the
 * SKU details are; it never switches them on by itself. Nothing about the
 * form depends on the company's plan (`premium_modules`): every company
 * can say where its stock is kept.
 */
const PRODUCT_URL = 'inventory/product/'

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

/**
 * THE BODY OF A PRODUCT - AND THE ONE PLACE IT IS BUILT.
 *
 *   { "company_name": "ABC Industries",               <- the active company
 *     "product_name": "Printed Cotton Fabric",        <- the "Product Name" field
 *     "group": "primary",                             <- "Group"
 *     "gst_rate": "5",                                <- "GST Rate"
 *     "HSN Code": "01", "Per Unit": "NOS",            <- every other field, at
 *     "Category": "Raw Material",                        the top level, under
 *     "Lot / Roll Number": "L-7", ...                    its own field_name
 *     "product_details": [
 *       { "sku_details": { "Fabric Type": "Cotton", "Color": "Navy Blue", ... },
 *         "warehouse": [ { "id": "42", "warehouse_quantity": "300",
 *                          "level": "1", "shelf": "sh-1", "rack_no": "A-1" } ],
 *         "product_quantity": "300",                  <- "Quantity"
 *         "expiry_date": null,                        <- "Expiry Date"
 *         "Unit Rate": "120",
 *         "semi_finished": [],
 *         "raw_reference": [] },
 *       { ...the next SKU entry: its own sku_details, warehouse, quantity,
 *            expiry date and rate... } ],
 *     "vendor": [ { "id": 531, "name": "Selected Vendor Name" } ] }
 *
 * WHICH FIELD GOES WHERE is PRODUCT_FIELD_PLACEMENT in Constants/inventory:
 * a few fields are renamed or belong inside a product_details entry, and
 * every other one follows the rule - top level, own name. Nothing is dropped
 * for not being in the example above.
 *
 * `product_details` HAS ONE ENTRY PER SKU, and each entry is that SKU's
 * alone: its `sku_details` (the SKU fields under their own names, in SKU
 * order - the reply names them the same way), its own stock in `warehouse`,
 * and its own quantity, expiry date and rate. The entries are never merged,
 * and no SKU field is ever sent at the top level.
 *
 * A product without SKUs is a single entry with an empty `sku_details`. Its
 * quantity, rate and expiry date are then normal fields, filled in once -
 * they arrive in `fields` and are written into that one entry.
 *
 * `semi_finished` and `raw_reference` are always [] for now, in every entry:
 * the fields that would fill them pick from the company's own products,
 * which needs the product list - a later stage.
 *
 * The structural keys win over a field that happens to share a name with
 * one, and the fixed keys are always present - "" (null for the expiry
 * date) when the company has no such field.
 *
 * What is handed in is already typed, sorted and split between the product
 * and its entries (see collectProductValues in Modules/Dashboard/productForm):
 *
 *   companyName   the active company's name - from the store, never typed
 *   fields    [{ name, value }]  the fields filled in once, in form order
 *   details   [{ sku: [{ name, value }],      one per entry, in the order
 *                fields: [{ name, value }],   on screen
 *                warehouses: [{ id, warehouse_quantity, level, shelf, rack_no }] }]
 *   vendors   [{ id, name }]
 *
 * This function only names things: each field is put under the key
 * PRODUCT_FIELD_PLACEMENT gives it, or under its own name.
 *
 * `company_name` says whose product it is, the same way the Master Details
 * and Customised Fields calls name their company. It is a structural key
 * like the others: a field that happened to be called "company_name" could
 * not replace it.
 */
export const buildProductPayload = ({ companyName, fields = [], details = [], vendors = [] }) => {
  const product = {}
  // A per-SKU field filled in once - a product without SKUs - belongs to
  // every entry there is, which is then the only one.
  const shared = {}

  fields.forEach(({ name, value }) => {
    const placement = productFieldPlacement(name)

    if (!placement) product[name] = value
    else if (placement.in === 'detail') shared[placement.key] = value
    else product[placement.key] = value
  })

  // A product is always at least one entry, SKUs or not.
  const entries = details.length > 0 ? details : [{ sku: [], fields: [], warehouses: [] }]

  return {
    product_name: '',
    group: '',
    gst_rate: '',
    ...product,
    company_name: companyName,
    product_details: entries.map((detail) => ({
      // Under their own names, whatever the placement table says of them: a
      // SKU field called "Quantity" would still be a SKU attribute.
      sku_details: Object.fromEntries(detail.sku.map(({ name, value }) => [name, value])),
      warehouse: detail.warehouses,
      product_quantity: '',
      expiry_date: null,
      ...shared,
      ...Object.fromEntries(
        detail.fields.map(({ name, value }) => [productFieldPlacement(name)?.key ?? name, value]),
      ),
      semi_finished: [],
      raw_reference: [],
    })),
    vendor: vendors,
  }
}

/**
 * Creates a product.
 *
 * `payload` is the body from buildProductPayload. `files` is what the File
 * fields hold, as { field_name: File } - empty for most products, and then
 * the body goes up as plain JSON like every other call.
 *
 * With a file there is no JSON body to put it in, so the same body goes up
 * as multipart instead: each top-level property as a part (an object as its
 * JSON text), and each file as a part under its field's name. PROVISIONAL:
 * how this endpoint takes a file has not been confirmed - only the JSON body
 * above has.
 *
 * The Content-Type is named for that one call, as for the ledger CSV import:
 * the shared axios instance sends JSON by default, and would otherwise turn
 * the FormData, files and all, into a JSON body.
 */
export const createProduct = (payload, files = {}) => {
  const attached = Object.entries(files)
  if (attached.length === 0) return api.post(PRODUCT_URL, payload)

  const body = new FormData()

  Object.entries(payload).forEach(([name, value]) => {
    body.append(name, value !== null && typeof value === 'object' ? JSON.stringify(value) : (value ?? ''))
  })
  attached.forEach(([name, file]) => body.append(name, file))

  return api.post(PRODUCT_URL, body, { headers: { 'Content-Type': 'multipart/form-data' } })
}

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

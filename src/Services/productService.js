/**
 * THE SIMPLE PRODUCT - a company WITHOUT Inventory Management.
 *
 * (With Inventory Management a product is the SKU-based one, built from the
 * company's Customised Fields - that is Services/inventoryService. Which of
 * the two a user gets is Hooks/useInventoryAccess. Nothing is shared between
 * them but the vendor list.)
 *
 * Every simple-product URL and WebSocket message in the project is written
 * here and nowhere else. Nothing in this file shows a message: the shared
 * axios setup (Services/authService) has already turned a failure into a
 * plain Error carrying the backend's own text.
 *
 * ------------------------------------------------------------------
 * THE LIST IS ONE CALL, WHICHEVER ERP - AND IT IS A **POST**
 * ------------------------------------------------------------------
 *   POST  inventory/intelligere_product_create/   list them   { company }
 *
 * A body with only the company's name is a query, as with the ledgers.
 *
 * ------------------------------------------------------------------
 * SAVING IS WHERE THE TWO ERPs PART - and they share nothing
 * ------------------------------------------------------------------
 *   Intelligere   the same URL, over HTTP
 *     POST  inventory/intelligere_product_create/   add one      the product
 *     PUT   inventory/intelligere_product_create/   change one   { id, ...the product }
 *
 *   Tally         the app's shared WebSocket, as the ledgers are saved
 *     tally_product_fetch    Sync Now - bring the company's products over
 *     tally_product_create   add one      data: [ product ]
 *     tally_product_alter    change one   data: { ...product, stockitem_guid }
 *
 * Their field names differ too (`hsn` / `hsn_code`, `unit` / `per_unit`,
 * `rate` / "Unit Rate" ...), so each ERP has its own field list below and its
 * own builder; neither is ever fed the other's keys.
 *
 * ------------------------------------------------------------------
 * THE TWO DROPDOWNS OF THE FORM - the same for both ERPs
 * ------------------------------------------------------------------
 *   POST  inventory/product_group_list/   list the groups   { company_name }
 *   POST  inventory/product_group_list/   add a group       { company_name, group_name }
 *   GET   inventory/product_units/        the units         -> ["NOS", "KGS", ...]
 *
 * THERE IS NO DELETE HERE YET, for either ERP: how a simple product is
 * removed has not been confirmed, and a guessed method or body could remove
 * the wrong thing. It is added as one function below once the contract is
 * known - and a Delete button on the list with it.
 *
 * NOR A CSV IMPORT: no product import endpoint, Tally bulk message or blank
 * format has been supplied, so the Product CSV Upload card is drawn but
 * connected to nothing (see ProductCsvUpload).
 */

import { getEmail } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

const PRODUCT_URL = 'inventory/intelligere_product_create/'
const PRODUCT_GROUP_URL = 'inventory/product_group_list/'
const PRODUCT_UNITS_URL = 'inventory/product_units/'

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

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
 * The products of one company. The name comes from the caller, which reads
 * it from the active company in the store - never from a form. Without one
 * there is nothing to ask for.
 */
export const getBasicProducts = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(PRODUCT_URL, { company: companyName }))
}

/** The first of some properties a row actually has - null when it has none of them. */
const pick = (row, names) => {
  for (const name of names) {
    if (row?.[name] !== undefined && row[name] !== null) return row[name]
  }
  return null
}

/**
 * ONE ROW OF THE LIST, under the names the screens use.
 *
 * The two ERPs do not agree on what a product's properties are called, and
 * the list has not been seen to say which of the two it speaks - so each
 * value is looked for under every name it goes by, and the screens read the
 * one neutral name on the left:
 *
 *   id            id                       what an Intelligere edit names
 *   guid          stockitem_guid           what a Tally edit names
 *   name          product_name
 *   group         group | group_name
 *   hsn           hsn_code | hsn
 *   unit          per_unit | unit
 *   quantity      quantity
 *   rate          "Unit Rate" | unit_rate | rate
 *   sellingPrice  selling_price
 *   gstRate       gst_rate
 *   category      category
 *   vendors       vendor      [{ id, name }]
 *
 * `source` is the row exactly as the backend sent it. If the list turns out
 * to use another name for something, this is the one place to add it.
 */
export const readBasicProduct = (row) => ({
  source: row,
  id: pick(row, ['id', 'product_id']),
  guid: pick(row, ['stockitem_guid']),
  name: pick(row, ['product_name']),
  group: pick(row, ['group', 'group_name']),
  hsn: pick(row, ['hsn_code', 'hsn']),
  unit: pick(row, ['per_unit', 'unit']),
  quantity: pick(row, ['quantity']),
  rate: pick(row, ['Unit Rate', 'unit_rate', 'rate']),
  sellingPrice: pick(row, ['selling_price']),
  gstRate: pick(row, ['gst_rate']),
  category: pick(row, ['category']),
  vendors: Array.isArray(row?.vendor) ? row.vendor : [],
})

/* ------------------------------------------------------------------ */
/* Groups and units - what the form's two dropdowns offer              */
/* ------------------------------------------------------------------ */

/**
 * The product groups of one company:
 *
 *   [{ "id": 1, "group_name": "Primary", "created_by": "...", "stockgroup_guid": null }]
 *
 * A POST, with the company's name in the body. A product names its group by
 * `group_name` - that is what the dropdown shows and what a save sends.
 */
export const getProductGroups = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(PRODUCT_GROUP_URL, { company_name: companyName }))
}

/**
 * Adds a product group to a company - the same URL, and the group's name in
 * the body is what makes it an add rather than a query. Answers
 * { "msg": "Product group created" }.
 */
export const createProductGroup = (companyName, groupName) =>
  api.post(PRODUCT_GROUP_URL, { company_name: companyName, group_name: groupName })

/**
 * The units a product can be counted in - a plain list of text, as the
 * backend names them ("NOS", "KGS", "N/A" ...):
 *
 *   GET  inventory/product_units/
 *
 * The same for every company and every user, so it is fetched ONCE per
 * visit to the app and the answer kept here. A failed request is not kept,
 * so Retry really asks again.
 */
let productUnitsRequest = null

export const getProductUnits = () => {
  if (!productUnitsRequest) {
    productUnitsRequest = api
      .get(PRODUCT_UNITS_URL)
      .then((response) => toList(response).filter((unit) => typeof unit === 'string' && unit.trim()))
      .catch((failure) => {
        productUnitsRequest = null
        throw failure
      })
  }

  return productUnitsRequest
}

/* ------------------------------------------------------------------ */
/* The fields of a simple product, per ERP                            */
/* ------------------------------------------------------------------ */

/**
 * What the Add / Edit Product form asks for, and what the list shows - in
 * this order. Each ERP has only the fields its own payload carries.
 *
 *   key        the property's name IN THAT ERP'S PAYLOAD - also the key its
 *              value is kept under while the form is open
 *   label      what it is called on screen
 *   from       where its value is in a row of the list (see readBasicProduct)
 *   required   the form will not save without it
 *   numeric    a number: only digits and one decimal point can be typed
 *   choices    chosen from a list rather than typed - which list:
 *                'groups'  the company's product groups (getProductGroups)
 *                'units'   the units (getProductUnits)
 *   gstRate    chosen from the GST slabs (Constants/gst), with the tax it
 *              splits into shown under it
 */
export const BASIC_PRODUCT_ERP = Object.freeze({ TALLY: 'tally', INTELLIGERE: 'intelligere' })

export const BASIC_PRODUCT_CHOICES = Object.freeze({ GROUPS: 'groups', UNITS: 'units' })

export const BASIC_PRODUCT_FIELDS = Object.freeze({
  [BASIC_PRODUCT_ERP.TALLY]: [
    { key: 'product_name', label: 'Product Name', from: 'name', required: true },
    { key: 'group_name', label: 'Group Name', from: 'group', choices: BASIC_PRODUCT_CHOICES.GROUPS },
    { key: 'hsn', label: 'HSN', from: 'hsn' },
    { key: 'quantity', label: 'Quantity', from: 'quantity', numeric: true },
    { key: 'unit', label: 'Unit', from: 'unit', choices: BASIC_PRODUCT_CHOICES.UNITS },
    { key: 'rate', label: 'Rate', from: 'rate', numeric: true },
    { key: 'gst_rate', label: 'GST Rate', from: 'gstRate', gstRate: true },
  ],
  [BASIC_PRODUCT_ERP.INTELLIGERE]: [
    { key: 'product_name', label: 'Product Name', from: 'name', required: true },
    { key: 'group', label: 'Group', from: 'group', choices: BASIC_PRODUCT_CHOICES.GROUPS },
    { key: 'hsn_code', label: 'HSN Code', from: 'hsn' },
    { key: 'per_unit', label: 'Per Unit', from: 'unit', choices: BASIC_PRODUCT_CHOICES.UNITS },
    { key: 'gst_rate', label: 'GST Rate', from: 'gstRate', gstRate: true },
    { key: 'category', label: 'Category', from: 'category' },
    { key: 'quantity', label: 'Quantity', from: 'quantity', numeric: true },
    { key: 'selling_price', label: 'Selling Price', from: 'sellingPrice', numeric: true },
    { key: 'Unit Rate', label: 'Unit Rate', from: 'rate', numeric: true },
  ],
})

/** A form's values as the text the backend takes them as: trimmed, never null. */
const fieldValues = (erp, form) =>
  Object.fromEntries(BASIC_PRODUCT_FIELDS[erp].map(({ key }) => [key, String(form?.[key] ?? '').trim()]))

/* ------------------------------------------------------------------ */
/* Intelligere - over HTTP                                            */
/* ------------------------------------------------------------------ */

/**
 * The body of an Intelligere product:
 *
 *   { "company": "MAAN ENTERPRISE 1", "product_name": "abc", "group": "primary",
 *     "hsn_code": "01", "per_unit": "NOS", "gst_rate": "5", "category": "",
 *     "quantity": "95.0", "selling_price": "90", "Unit Rate": "10",
 *     "vendor": [ { "id": 531, "name": "Selected Vendor Name" } ] }
 *
 * Every value is text, as typed. `vendor` is the chosen vendors as
 * `{ id, name }` - the same shape the full product sends - and [] when none
 * was chosen; a product does not need one.
 */
export const buildIntelligereProductPayload = (companyName, form, vendors = []) => ({
  company: companyName,
  ...fieldValues(BASIC_PRODUCT_ERP.INTELLIGERE, form),
  vendor: vendors,
})

/** Adds a product. `payload` is buildIntelligereProductPayload's. */
export const createIntelligereProduct = (payload) => api.post(PRODUCT_URL, payload)

/**
 * Changes a product. The backend identifies it by `id` - the product's own,
 * from the list - and never by its name, which is one of the things that can
 * be changed. `payload` is the same body a create sends.
 */
export const updateIntelligereProduct = (id, payload) => api.put(PRODUCT_URL, { id, ...payload })

/**
 * Whether a reply to "add this product" is the backend declining because
 * the company already has one of that name:
 *
 *   { "msg": "This product already exists" }
 *
 * It arrives as an ordinary reply, not as an error, and looks exactly like
 * the success ({ "msg": "Product created successfully" }) but for its words
 * - so the words are what is read. Nothing was created; the screen says so
 * and keeps the form open.
 */
export const isProductAlreadyExists = (response) => /already exists/i.test(String(response?.msg ?? ''))

/* ------------------------------------------------------------------ */
/* Tally - over the WebSocket                                         */
/* ------------------------------------------------------------------ */

/**
 * The module names the Tally product messages use in both directions: sent
 * as `module_name`, and answered as `return_module_name` - the same
 * convention as the ledger messages (see ledgerService).
 */
export const TALLY_PRODUCT_FETCH_MODULE = 'tally_product_fetch'
export const TALLY_PRODUCT_CREATE_MODULE = 'tally_product_create'
export const TALLY_PRODUCT_ALTER_MODULE = 'tally_product_alter'

/**
 * The Sync Now payload:
 *
 *   { "payload": { "module_name": "tally_product_fetch",
 *                  "company_name": "<active company>",
 *                  "source": "all products fetch" } }
 */
export const buildFetchProductsMessage = (companyName) => ({
  payload: {
    module_name: TALLY_PRODUCT_FETCH_MODULE,
    company_name: companyName,
    source: 'all products fetch',
  },
})

/** The signed-in user, as every Tally save names them - from storage, never typed. */
const createdBy = () => getEmail() || ''

/**
 * Adds a product in Tally. `data` is a LIST, of the one product:
 *
 *   { "payload": { "module_name": "tally_product_create",
 *                  "company_name": "<active company>",
 *                  "data": [ { "product_name": "mobile12", "group_name": "New Group",
 *                              "hsn": "8521", "quantity": "10.0", "unit": "N/A",
 *                              "rate": "726", "gst_rate": "18",
 *                              "created_by": "<signed-in user>" } ] } }
 */
export const buildTallyProductCreateMessage = (companyName, form) => ({
  payload: {
    module_name: TALLY_PRODUCT_CREATE_MODULE,
    company_name: companyName,
    data: [{ ...fieldValues(BASIC_PRODUCT_ERP.TALLY, form), created_by: createdBy() }],
  },
})

/**
 * Changes a product in Tally. Not the create with another name: `data` is
 * the product ITSELF, not a list, and carries `stockitem_guid` - Tally's own
 * identifier for the stock item, exactly as the list gave it:
 *
 *   { "payload": { "module_name": "tally_product_alter",
 *                  "company_name": "<active company>",
 *                  "data": { ...the same seven fields...,
 *                            "stockitem_guid": "<the product's own>",
 *                            "created_by": "<signed-in user>" } } }
 */
export const buildTallyProductAlterMessage = (companyName, form, stockitemGuid) => ({
  payload: {
    module_name: TALLY_PRODUCT_ALTER_MODULE,
    company_name: companyName,
    data: {
      ...fieldValues(BASIC_PRODUCT_ERP.TALLY, form),
      stockitem_guid: stockitemGuid,
      created_by: createdBy(),
    },
  },
})

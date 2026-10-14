/**
 * THE SIMPLE PRODUCT - a company WITHOUT Inventory Management.
 *
 * (With Inventory Management a product is the SKU-based one, built from the
 * company's Customised Fields - that is Services/inventoryService. Which of
 * the two a user gets is Hooks/useInventoryAccess. Nothing is shared between
 * them but the vendor list.)
 *
 * Every simple-product URL and WebSocket message in the project is written
 * here and nowhere else - but one. Nothing in this file shows a message: the
 * shared axios setup (Services/authService) has already turned a failure
 * into a plain Error carrying the backend's own text.
 *
 * ------------------------------------------------------------------
 * THE LIST IS NOT HERE - it is the same call for every user
 * ------------------------------------------------------------------
 *   POST  inventory/product/   { company_name }
 *
 * getProducts in Services/inventoryService, read through Hooks/useProducts
 * and drawn by the shared ProductTable: one list of a company's products,
 * whoever is looking. What IS here is how a product of it is handed to the
 * simple product form for editing (toBasicProduct, below).
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
 *   POST  inventory/product_units/        list the units    { company_name }
 *                                                           -> ["NOS", "KGS", ...]
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

/** The first of some properties an object actually has - null when it has none of them. */
const pick = (object, names) => {
  for (const name of names) {
    if (object?.[name] !== undefined && object[name] !== null) return object[name]
  }
  return null
}

/**
 * A PRODUCT OF THE LIST, AS THE SIMPLE PRODUCT FORM TAKES IT.
 *
 * The list is the same for every user and is read in one place
 * (readProducts in Modules/Dashboard/productList): a product, its SKUs, and
 * each SKU's entries. The simple form edits a product with ONE SKU and one
 * entry, under a handful of flat names - this is the step between the two:
 *
 *   key           the row's key, to tint the row open in the form
 *   id            the SKU's `product_id`        what an Intelligere edit names
 *   guid          `stockitem_guid`              what a Tally edit names
 *   name, group, hsn, unit, gstRate, category   the product's own
 *   quantity      the product's total quantity
 *   rate          its entry's "Unit Rate"
 *   sellingPrice  its SKU's `selling_price`
 *   vendors       its SKU's `vendor`            [{ id, name }]
 *
 * A simple product has one SKU, so "its SKU" is the first - and for a
 * product that turns out to have more, the first is still the one the form
 * opens on. `stockitem_guid` is looked for on the entry, the SKU and the
 * product, since the reply has not been seen to carry one: without it a
 * Tally product cannot be edited, and the form says so.
 */
export const toBasicProduct = (product) => {
  const [variant] = product.variants
  const [detail] = variant?.details ?? []

  return {
    key: product.key,
    product_id: variant?.productId ?? null,
    guid: pick(detail?.source, ['stockitem_guid']) ?? pick(variant?.source, ['stockitem_guid']) ?? pick(product.source, ['stockitem_guid']),
    name: product.name,
    group: product.group,
    hsn: product.hsn,
    unit: product.unit,
    quantity: product.quantity,
    rate: detail?.unitRate ?? null,
    sellingPrice: variant?.sellingPrice ?? null,
    gstRate: product.gstRate,
    category: product.category,
    vendors: variant?.vendors ?? [],
  }
}

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
 * The units one company's products can be counted in - a plain list of
 * text, as the backend names them ("NOS", "KGS", "N/A" ...):
 *
 *   POST  inventory/product_units/   { company_name }
 *
 * A POST, with the company's name in the body, like the groups above: the
 * units are a company's own, so they are asked for per company and never
 * kept from one company for the next. Without a company there is nothing
 * to ask for.
 */
export const getProductUnits = async (companyName) => {
  if (!companyName) return []

  const units = toList(await api.post(PRODUCT_UNITS_URL, { company_name: companyName }))
  return units.filter((unit) => typeof unit === 'string' && unit.trim())
}

/* ------------------------------------------------------------------ */
/* The fields of a simple product, per ERP                            */
/* ------------------------------------------------------------------ */

/**
 * What the Add / Edit Product form asks for - in this order. Each ERP has only the fields its own payload carries.
 *
 *   key        the property's name IN THAT ERP'S PAYLOAD - also the key its
 *              value is kept under while the form is open
 *   label      what it is called on screen
 *   from       where its value is in a product handed to the form (see toBasicProduct)
 *   required   the form will not save without it
 *   numeric    a number: only digits and one decimal point can be typed
 *   choices    chosen from a list rather than typed - which list:
 *                'groups'  the company's product groups (getProductGroups)
 *                'units'   the units (getProductUnits)
 *   hsn        chosen from the HSN list, or typed (HsnSelector)
 *   gstRate    chosen from the GST slabs (Constants/gst), with the tax it
 *              splits into shown under it
 */
export const BASIC_PRODUCT_ERP = Object.freeze({ TALLY: 'tally', INTELLIGERE: 'intelligere' })

export const BASIC_PRODUCT_CHOICES = Object.freeze({ GROUPS: 'groups', UNITS: 'units' })

export const BASIC_PRODUCT_FIELDS = Object.freeze({
  [BASIC_PRODUCT_ERP.TALLY]: [
    { key: 'product_name', label: 'Product Name', from: 'name', required: true },
    { key: 'group_name', label: 'Group Name', from: 'group', choices: BASIC_PRODUCT_CHOICES.GROUPS },
    { key: 'hsn', label: 'HSN', from: 'hsn', hsn: true },
    { key: 'quantity', label: 'Quantity', from: 'quantity', numeric: true },
    { key: 'unit', label: 'Unit', from: 'unit', choices: BASIC_PRODUCT_CHOICES.UNITS },
    { key: 'rate', label: 'Rate', from: 'rate', numeric: true },
    { key: 'gst_rate', label: 'GST Rate', from: 'gstRate', gstRate: true },
  ],
  [BASIC_PRODUCT_ERP.INTELLIGERE]: [
    { key: 'product_name', label: 'Product Name', from: 'name', required: true },
    { key: 'group', label: 'Group', from: 'group', choices: BASIC_PRODUCT_CHOICES.GROUPS },
    { key: 'hsn_code', label: 'HSN Code', from: 'hsn', hsn: true },
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
export const updateIntelligereProduct = (id, payload) => api.put(PRODUCT_URL, { product_id: id, ...payload })

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
/* Importing products from a CSV - the same two endings as ledgers     */
/* ------------------------------------------------------------------ */

const PRODUCT_CSV_IMPORT_URL = 'inventory/product_csv_import/'

/**
 * The blank CSV the user fills in, beside the ledger one in Assets/format
 * and downloaded the same way - its contents come through the bundle (`?raw`)
 * and are written out under the name below (see LEDGER_CSV_FORMAT_FILE in
 * ledgerService for why).
 *
 *   Product Name, Group, HSN Code, Quantity, Unit, Rate, GST Rate, Description
 */
export const PRODUCT_CSV_FORMAT_FILE = 'Product Detail format.csv'
export { default as PRODUCT_CSV_FORMAT_CONTENT } from '@/Assets/format/ProductFormat.csv?raw'

/**
 * Sends the filled-in CSV up.
 *
 *   POST inventory/product_csv_import/   multipart: file, company_id, user_erp_type
 *
 * ONE ENDPOINT, TWO ANSWERS - the ERP the caller declares decides which:
 *
 *   intelligere   the products are created there and then:
 *                 { "msg": "2 product created successfully" }
 *   tally         nothing is created yet: the reply is the parsed rows,
 *                 [{ product_name, group_name, hsn, quantity, unit, rate,
 *                    gst_rate, description }], which the screen sends on to
 *                 Tally whole (buildTallyProductImportMessage).
 *
 * `erpType` is 'tally' or 'intelligere', read by the screen from the profile
 * in the store. Multipart is named for this one call, as for the ledger
 * import: the shared axios instance would otherwise send the FormData as JSON.
 */
export const importProductCsv = ({ companyId, erpType, file }) => {
  const body = new FormData()

  body.append('file', file)
  body.append('company_id', companyId)
  body.append('user_erp_type', erpType)

  return api.post(PRODUCT_CSV_IMPORT_URL, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

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
export const TALLY_STOCK_GROUP_CREATE_MODULE = 'product_group_create'

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
 * Adds a STOCK GROUP in Tally - the header's "Add Stock Group Creation":
 *
 *   { "payload": { "module_name": "product_group_create",
 *                  "company_name": "<active company>",
 *                  "data": { "Name": "<new group>",
 *                            "Under": "<the group it sits under>",
 *                            "created_by": "<signed-in user's email>" } } }
 *
 * `Under` is a group's `group_name`, as the group list gives it. The reply
 * comes back under `return_module_name: "product_group_create"`.
 */
export const buildTallyStockGroupCreateMessage = ({ companyName, name, under }) => ({
  payload: {
    module_name: TALLY_STOCK_GROUP_CREATE_MODULE,
    company_name: companyName,
    data: {
      Name: String(name ?? '').trim(),
      Under: String(under ?? '').trim(),
      created_by: createdBy(),
    },
  },
})

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
 * A CSV import's rows, on to Tally - the import's second half. The reply of
 * importProductCsv goes as `data` WHOLE: every row, exactly as the backend
 * parsed it, in one message under the same module as a single create:
 *
 *   { "payload": { "module_name": "tally_product_create",
 *                  "company_name": "<active company>",
 *                  "data": [ ...the reply... ] } }
 */
export const buildTallyProductImportMessage = (companyName, rows) => ({
  payload: {
    module_name: TALLY_PRODUCT_CREATE_MODULE,
    company_name: companyName,
    data: rows,
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

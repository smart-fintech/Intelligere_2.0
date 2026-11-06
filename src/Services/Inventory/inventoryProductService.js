/**
 * Inventory products: the one product list every screen reads (getProducts),
 * the Inventory tab's other views, the opening-stock template, and creating
 * and editing a product with Inventory Management.
 *
 * Whether a company has switched SKUs on is a Master Details question:
 * isSkuManagementEnabled, in Services/Inventory/inventoryService.
 */

import { perSkuFieldRank } from '@/Constants/inventory'
import { MULTIPART, toList } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'
import { changesProducts, markProductsChanged } from '@/Services/Product/productCache'

/* ------------------------------------------------------------------ */
/* Products - the list, for every user                                */
/* ------------------------------------------------------------------ */

const PRODUCT_URL = 'inventory/product/'

/**
 * THE PRODUCTS OF ONE COMPANY - the ONE call every product list makes.
 *
 *   POST  inventory/product/   { company_name }
 *
 * A POST, with the company's name in the body: a body with only the company
 * is a query, as with the ledgers (a body with a product in it is a create -
 * see createProduct below). The same call whoever is asking - Tally or
 * Intelligere, MSME or Accounting Professional, with Inventory Management
 * or without - and it returns every product of the company, those with SKUs
 * and those without. Screens read it through Hooks/useProducts.
 *
 * The name comes from the caller, which reads it from the active company in
 * the store - never from a form. Without one there is nothing to ask for.
 *
 * WHAT A ROW LOOKS LIKE HAS NOT BEEN SUPPLIED YET. So this hands the rows
 * back exactly as they came, and nothing here names a property of one. The
 * list is taken to be an array - bare, or under `data` / `results` (toList);
 * when the real reply is known, a different wrapper is unwrapped HERE, and
 * the properties of a row are named where each list reads them.
 */
export const getProducts = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(PRODUCT_URL, { company_name: companyName }))
}

/* ------------------------------------------------------------------ */
/* The Inventory tab's two other views                                 */
/* ------------------------------------------------------------------ */

/**
 * THE CUSTOM REPORT - one row per product, its fields under the company's
 * own names, and its stock:
 *
 *   POST inventory/ProductCustomizedReport/   { company_name }
 *
 *   [{ "id": 30029, "Product Name": "shirt", "Category": "Semi-Finished",
 *      "Quantity": "200", "Unit Rate": "900", ...whatever fields the company has,
 *      "warehouse": [{ "id": "12", "name": "WAREHOUSING 1", "level": "LE-1",
 *                      "shelf": "SH-2", "rack_no": "Ra-3", "warehouse_quantity": "200" }] }]
 */
const CUSTOM_REPORT_URL = 'inventory/ProductCustomizedReport/'

export const getProductCustomReport = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(CUSTOM_REPORT_URL, { company_name: companyName }))
}

/**
 * THE EXPIRED PRODUCTS - the product list's own shape (see readProducts in
 * Modules/Dashboard/productList), one record per expired stock, its SKU
 * carrying `expiry_product_id` beside its `product_id`:
 *
 *   POST inventory/expired_products/   { company_name }
 *
 * Read-only on screen: an expired record is not edited or removed through
 * the product's own id.
 */
const EXPIRED_PRODUCTS_URL = 'inventory/expired_products/'

export const getExpiredProducts = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(EXPIRED_PRODUCTS_URL, { company_name: companyName }))
}

/* ------------------------------------------------------------------ */
/* Opening stock - an Excel template, filled in and sent back          */
/* ------------------------------------------------------------------ */

/**
 * ONE URL, TWO REQUESTS - the body decides which:
 *
 *   POST inventory/inventory_excel/   JSON { company_name }
 *        -> { "data": "http://.../media/inventory_files/<company>_inventory_template.xlsx" }
 *        the company's own template, to download (getOpeningStockTemplate)
 *
 *   POST inventory/inventory_excel/   multipart: company_name, filed
 *        -> { "msg": "1 warehouse(s) and 3 product(s) uploaded successfully." }
 *        the filled-in template (uploadOpeningStock). The file goes under
 *        `filed` - the backend's own name for it, not `file`.
 */
const OPENING_STOCK_URL = 'inventory/inventory_excel/'

/** The template's link - `data` of the reply, or '' when there is none. */
export const getOpeningStockTemplate = async (companyName) => {
  if (!companyName) return ''

  const response = await api.post(OPENING_STOCK_URL, { company_name: companyName })
  return typeof response?.data === 'string' ? response.data.trim() : ''
}

/**
 * Sends the filled-in template. Multipart is named for this one call, as for every upload.
 *
 * An import confirmed by the backend's `msg` adds products and changes
 * their stock, so the shared product list is read again AT ONCE for every
 * screen showing it (markProductsChanged's `refetchActive`) - the ones not
 * on screen read it when next shown. Any other success only marks it
 * stale, as before; a failure is thrown, unchanged, and refreshes nothing.
 */
export const uploadOpeningStock = async (companyName, file) => {
  const body = new FormData()

  body.append('company_name', companyName)
  body.append('filed', file)

  const reply = await api.post(OPENING_STOCK_URL, body, { headers: { 'Content-Type': 'multipart/form-data' } })
  markProductsChanged({ refetchActive: Boolean(reply?.msg) })
  return reply
}

/* ------------------------------------------------------------------ */
/* Products - with Inventory Management                               */
/* ------------------------------------------------------------------ */

/*
 * (A user without Inventory Management has a simpler product, saved through
 * its own endpoint with its own payloads - see Services/Product/productService. Its
 * LIST is the same call as everyone's: getProducts, above.)
 *
 *   POST  inventory/product/   create a product   (the body: buildProductPayload)
 *
 * which answers
 *
 *   { "msg": "Product saved successfully", "product_id": 1,
 *     "sku_code": "PRI-COT-COT-140-001", "sku_details": { ... } }
 *
 * THERE IS NO UPDATE OR DELETE HERE YET. How this endpoint changes or
 * removes a product has not been confirmed; each is added as one function
 * below once its contract is known.
 *
 * ONE QUESTION decides what a company's Product form is:
 *
 *   isSkuManagementEnabled(masterDetails)   has it switched SKUs on?
 *
 * With SKUs the form has a SKU Details section, an entry per SKU; without,
 * it is a single product. A field marked `sku_field` says which fields the
 * SKU details are; it never switches them on by itself. Nothing INSIDE this
 * form depends on the company's plan: whether a user reaches the form at all
 * is decided before it, by useInventoryAccess.
 */

/** No references at all - a product whose form has no raw-material or semi-finished field. */
const NO_REFERENCES = { raw: [], semiFinished: [] }

/**
 * THE BODY OF A PRODUCT - AND THE ONE PLACE IT IS BUILT.
 *
 *   { "company_name": "ABC Industries",               <- the active company
 *     "Product Name": "Printed Cotton Fabric",        <- every field of the
 *     "Group": "primary",                                product, under its
 *     "GST Rate": "5",                                   OWN field_name
 *     "HSN Code": "01", "Per Unit": "NOS",
 *     "Category": "Raw Material", ...
 *     "product_details": [
 *       { "sku_details": { "Fabric Type": "Cotton", "Color": "Navy Blue", ... },
 *         "warehouse": [ { "id": "42", "warehouse_quantity": "300",
 *                          "level": "1", "shelf": "sh-1", "rack_no": "A-1" } ],
 *         "Quantity": "300",                          <- the per-SKU fields,
 *         "Expiry Date": null,                           also under their
 *         "Unit Rate": "120",                            own names
 *         "semi_finished_reference": [],
 *         "raw_reference": [] },
 *       { ...the next SKU entry: its own sku_details, warehouse, quantity,
 *            expiry date and rate... } ],
 *     "vendor": [ { "id": 531, "name": "Selected Vendor Name" } ] }
 *
 * NO FIELD IS RENAMED. A field's key is its `field_name`, exactly as the
 * company's Customised Fields call it - there is no `product_name`, `group`
 * or `product_quantity` of ours, and no key that is sent when the company
 * has no such field. The keys a product carries are the company's fields,
 * whatever those are.
 *
 * The only keys that are not field names are the structure itself:
 * `company_name`, `product_details`, and inside an entry `sku_details`,
 * `warehouse`, `raw_reference` and `semi_finished_reference`, then `vendor`. They win
 * over a field that happens to share a name with one.
 *
 * `product_details` HAS ONE ENTRY PER SKU, and each entry is that SKU's
 * alone: its `sku_details` (the SKU fields, in SKU order - the reply names
 * them the same way), its own stock in `warehouse`, and its own per-SKU
 * fields (PRODUCT_PER_SKU_FIELDS in Constants/inventory - the quantity, the
 * expiry date, the rate). The entries are never merged, and no SKU field is
 * ever sent at the top level.
 *
 * A product without SKUs is a single entry with an empty `sku_details`. Its
 * per-SKU fields are then normal fields, filled in once - they arrive in
 * `fields` like the rest, and are written into that one entry rather than
 * at the top level, so a product's quantity is always found in the same
 * place whether it has SKUs or not.
 *
 * `raw_reference` and `semi_finished_reference` are the references the company's
 * raw-material and semi-finished fields hold (see buildProductReference
 * for one). A field filled in once for the product puts its references in
 * EVERY entry - the same rule as a per-SKU field filled in once; a field
 * inside a SKU entry puts them in that entry alone. With no such field
 * both stay [].
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
 *   references   { raw: [...], semiFinished: [...] } - the product's own;
 *             a detail's own are in its `references`, the same shape
 *
 * `company_name` says whose product it is, the same way the Master Details
 * and Customised Fields calls name their company.
 */
const named = (list) => Object.fromEntries(list.map(({ name, value }) => [name, value]))

export const buildProductPayload = ({ companyName, fields = [], details = [], vendors = [], references = NO_REFERENCES }) => {
  // A per-SKU field filled in once - a product without SKUs - belongs to
  // every entry there is, which is then the only one.
  const ofProduct = fields.filter(({ name }) => perSkuFieldRank(name) === -1)
  const ofEveryEntry = fields.filter(({ name }) => perSkuFieldRank(name) !== -1)

  // A product is always at least one entry, SKUs or not.
  const entries = details.length > 0 ? details : [{ sku: [], fields: [], warehouses: [] }]

  return {
    ...named(ofProduct),
    company_name: companyName,
    product_details: entries.map((detail) => ({
      ...named(ofEveryEntry),
      ...named(detail.fields),
      sku_details: named(detail.sku),
      warehouse: detail.warehouses,
      // The references filled in once for the product belong to every
      // entry, as a per-SKU field filled in once does; a SKU entry's own
      // follow them.
      raw_reference: [...references.raw, ...(detail.references?.raw ?? [])],
      semi_finished_reference: [...references.semiFinished, ...(detail.references?.semiFinished ?? [])],
    })),
    vendor: vendors,
  }
}

/**
 * ONE RAW-MATERIAL OR SEMI-FINISHED REFERENCE, as a `product_details`
 * entry carries it in `raw_reference` or `semi_finished_reference`:
 *
 *   { "id": 227, "qty": "1", "wastage": "3",
 *     "sku_code": "KNI-KNI-185-GRE-010",
 *     "sku_details": { "Size": "M", "Color": "Grey", ... },
 *     "Product Name": "Knitted Cotton Fabric" }
 *
 *   id            the referenced SKU's `product_id`, exactly as the
 *                 product list gave it
 *   qty, wastage  as typed, trimmed - text, as this endpoint takes its
 *                 quantities
 *   sku_code      the SKU's code ('' for a SKU without one)
 *   sku_details    what the SKU is made of ({} for one with no details)
 *   Product Name  the referenced product's name
 *
 * Built when the user presses OK, and kept in the form as it is here.
 */
export const buildProductReference = ({ id, productName, skuCode, skuDetails, qty, wastage }) => ({
  id,
  qty: String(qty ?? '').trim(),
  wastage: String(wastage ?? '').trim(),
  sku_code: skuCode ?? '',
  sku_details: skuDetails ?? {},
  'Product Name': productName ?? '',
})

/**
 * Creates a product.
 *
 * `payload` is the body from buildProductPayload. `files` is what the File
 * fields hold, as { field_name: File } - empty for most products.
 *
 * ALWAYS MULTIPART, with a file or without: each top-level property of the
 * payload is a part - an object or a list as its JSON text
 * (`product_details`, `vendor`), nothing at all as '' - and each file is a
 * part under its field's name. The payload itself is unchanged; only how it
 * travels is.
 *
 * The Content-Type is named for this one call, as for the ledger CSV import:
 * the shared axios instance sends JSON by default, and with that header
 * axios would turn the FormData, files and all, into a JSON body. Naming
 * multipart stops that, and axios then leaves the header to the browser,
 * which writes it with the boundary.
 */
/** The product body as multipart - see createProduct. Shared by create and update. */
const productFormData = (payload, files = {}) => {
  const body = new FormData()

  Object.entries(payload).forEach(([name, value]) => {
    body.append(name, value !== null && typeof value === 'object' ? JSON.stringify(value) : (value ?? ''))
  })

  Object.entries(files).forEach(([name, file]) => {
    if (file != null) body.append(name, file)
  })

  return body
}

export const createProduct = (payload, files = {}) => {
  // OLD implementation - JSON without a file, multipart only with one.
  // Retained for reference.
  // const attached = Object.entries(files)
  // if (attached.length === 0) return api.post(PRODUCT_URL, payload)
  //
  // const body = new FormData()
  //
  // Object.entries(payload).forEach(([name, value]) => {
  //   body.append(name, value !== null && typeof value === 'object' ? JSON.stringify(value) : (value ?? ''))
  // })
  // attached.forEach(([name, file]) => body.append(name, file))
  //
  // return api.post(PRODUCT_URL, body, { headers: { 'Content-Type': 'multipart/form-data' } })

  // NEW implementation - always FormData.
  return changesProducts(api.post(PRODUCT_URL, productFormData(payload, files), MULTIPART))
}

/* ------------------------------------------------------------------ */
/* Editing a product - one SKU at a time                               */
/* ------------------------------------------------------------------ */

/**
 *   PUT  inventory/product/   the same body as a create, for ONE SKU, with
 *                             that SKU's `product_id` at the top
 *
 * Every SKU of a product is its own record, named by the `product_id` its
 * `sku_variants` entry carries - so an edit is of one SKU: the product's
 * fields, and that SKU's one `product_details` entry. The body is built
 * exactly as a create's (buildProductPayload), and sent the same way
 * (multipart, see createProduct).
 *
 * PAST VERSIONS. The entry also carries `past_version`, next to
 * `raw_reference` and `semi_finished_reference`:
 *
 *   "raw_reference": [ ...the references now ],
 *   "semi_finished_reference": [ ... ],
 *   "past_version": {
 *     "version1": { "raw_reference": [...], "semi_finished_reference": [...] },
 *     "version2": { ... } }
 *
 * The history the SKU already has is sent back whole - never changed, never
 * dropped. When the user starts a new version (Add Version, on a Finished or
 * Semi-Finished product) BOTH reference lists, as the form held them at that
 * moment, are added to it together under the next key (nextPastVersionKey),
 * and the lists the user then builds become the current references. Only
 * on Save - nothing is sent before.
 *
 * WHICH RECORD. The entry is the one the edit was opened on, and carries
 * that record's own `sr_no` (`srNo`, from the product list) so the backend
 * updates it - and only it: the SKU's other records are not sent, so
 * theirs stay as they are. With no `sr_no` saved, none is sent.
 */
export const buildProductUpdatePayload = ({ productId, pastVersion = {}, srNo = null, ...product }) => {
  const payload = buildProductPayload(product)

  return {
    product_id: productId,
    ...payload,
    product_details: payload.product_details.map((detail, index) => ({
      ...(index === 0 && srNo !== null ? { sr_no: srNo } : {}),
      ...detail,
      past_version: pastVersion,
    })),
  }
}

/**
 * The key the next past version is saved under: `version<n>`, one past
 * the highest number the history already has - `version1` for a SKU
 * with none. The history's own spelling is kept: one written
 * `version_1, version_2` goes on with `version_3`. Older keys are never
 * touched.
 */
export const nextPastVersionKey = (pastVersion) => {
  const found = Object.keys(pastVersion ?? {})
    .map((key) => /^version(_?)(\d+)$/i.exec(key))
    .filter(Boolean)

  const next = found.length > 0 ? Math.max(...found.map((match) => Number(match[2]))) + 1 : 1
  const separator = found.length > 0 && found.every((match) => match[1] === '_') ? '_' : ''

  return `version${separator}${next}`
}

/** One past version: both reference lists as they were - an empty one as []. */
export const pastVersionOf = (references) => ({
  raw_reference: references?.raw ?? [],
  semi_finished_reference: references?.semiFinished ?? [],
})

/** Saves an edited SKU - see buildProductUpdatePayload. */
export const updateProduct = (payload, files = {}) =>
  changesProducts(api.put(PRODUCT_URL, productFormData(payload, files), MULTIPART))

/**
 * READING THE PRODUCT LIST - with no screen attached.
 *
 * `POST inventory/product/` (getProducts) answers with one object per
 * product, and inside it one per SKU:
 *
 *   { "Product Name": "Cotton knitted fabric", "total_qty": "36", "total_amount": "4320",
 *     "Group": "Primary", "HSN Code": "0101", "Per Unit": "MTR",
 *     "GST Rate": "12", "Category": "Raw Material",
 *     "sku_variants": [
 *       { "product_id": 2401, "sku_code": "COT-COT-GOO-2-007", "stockitem_guid": "",
 *         "total_qty": "36", "total_amount": "4320", "Selling Rate": "120",
 *         "Width": "", "Manufacturing Date": "", ...      <- the SKU's own fields
 *         "product_details": [
 *           { "sr_no": 1, "deleted": false, "Quantity": "12", "Unit Rate": "120",
 *             "created_at": "12-Oct-26 12:39:56 PM",
 *             "sku_details": { "Size": "4x9", "Color": "Pink", ... },
 *             "warehouse": [ { "id": "8", "name": "nirmal warehouse", "level": "3",
 *                              "shelf": "4", "rack_no": "3", "warehouse_quantity": "12" } ] } ],
 *         "vendor": [ { "id": 3, "name": "..." } ],
 *         "raw_reference": [], "semi_finished_reference": [], "past_version": {},
 *         "photo": "" } ] }
 *
 * The product's own fields - and a SKU's "Selling Rate", an entry's
 * "Quantity" - are named as the company's Customised Fields name them,
 * and are read under exactly those keys (PRODUCT_FIELD), nothing else.
 *
 * The same shape for every user. A company with Inventory Management has
 * products with several SKUs, each with `sku_details`, several warehouses
 * and its own references; one without has a single SKU with no code, no
 * details and a warehouse entry that may hold a quantity and nothing else.
 * Nothing here needs to know which it is looking at: every property is read
 * as "what is there", and what is not there is simply empty.
 *
 * THIS FILE IS THE ONE PLACE THE REPLY'S PROPERTIES ARE NAMED. The table,
 * the opened row, the details dialog and the filters all read what
 * readProducts hands them - so a property the backend renames is corrected
 * here and nowhere else.
 *
 *   readProducts(rows, warehouseNames)   the rows, under the names the screens use
 *   productFilterOptions(products)       what each filter can offer
 *   filterProducts(products, filters)    the products the filters leave
 *   isProductCategory(product, category) whether a product is of a category
 *   hasMaterialReferences(product)       whether its category has raw and
 *                                        semi-finished references at all
 *   productEditSource(product, variant, detail)  what one SKU entry was saved with, for Edit
 *   sharedSkuValues(product)             what all its SKUs have the same of
 *   savedValue(objects, fieldName)       a form field's saved value in them
 *   otherFields(object, known)           whatever else an object carries
 *   skuStockFields(variant)              its Quantity, Expiry Date, Unit Rate
 *   fieldLabel(key), displayValue(value) how a property and its value read
 *
 * DELETED: a `product_details` entry (or a SKU) marked `deleted: true` is
 * one the backend has kept but taken out of use, so it is left out
 * everywhere - not counted, not shown, not matched by a filter.
 *
 * NOTHING THE BACKEND SENDS IS DROPPED FOR NOT BEING NAMED HERE. Each
 * object keeps `source`, itself as it came, and `otherFields` lists every
 * property a screen has not already shown - so a field added to the reply
 * tomorrow appears in the details dialog with no change to this file.
 */

import { PRODUCT_PER_SKU_FIELDS, perSkuFieldRank } from '@/Constants/inventory'
import { toInputDate } from '@/Utils/date'

/* ------------------------------------------------------------------ */
/* Small readers                                                      */
/* ------------------------------------------------------------------ */

/** A value as trimmed text - '' for nothing at all. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** A value as a number, or null when it is empty or not one ("4", 4, "4.50" -> a number). */
const numberOf = (value) => {
  const text = textOf(value)
  if (!text) return null

  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const listOf = (value) => (Array.isArray(value) ? value.filter((entry) => entry !== null && entry !== undefined) : [])

/** The first of some properties an object actually has - undefined when it has none of them. */
const pick = (object, names) => {
  for (const name of names) {
    if (object?.[name] !== undefined && object[name] !== null) return object[name]
  }
  return undefined
}

/**
 * The first of some properties that holds a value - for an entry's expiry
 * date, which replies have carried both as `expiry_date` and as the field
 * "Expiry Date". Unlike pick, an empty text does not count, so
 * `expiry_date: null` gives way to `Expiry Date: "2030-10-15"`. A 0 does count.
 */
const firstFilled = (object, names) => pick(object, names.filter((name) => textOf(object?.[name]) !== ''))

/* ------------------------------------------------------------------ */
/* How a property and its value read                                  */
/* ------------------------------------------------------------------ */

/**
 * A property's name as a label. A name the company wrote itself - one with
 * a capital or a space, "Unit Rate", "GSM / Count" - is shown as written;
 * one of the backend's own is taken out of snake_case:
 *
 *   fieldLabel('Unit Rate')         -> 'Unit Rate'
 *   fieldLabel('product_quantity')  -> 'Product Quantity'
 *   fieldLabel('hsn_code')          -> 'HSN Code'
 */
const ACRONYMS = { hsn: 'HSN', gst: 'GST', sku: 'SKU', id: 'ID', qty: 'Quantity', sr: 'Sr', no: 'No.' }

export const fieldLabel = (key) => {
  const name = String(key ?? '')
  if (/[A-Z\s]/.test(name)) return name

  return name
    .split('_')
    .filter(Boolean)
    .map((word) => ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Any value as text a person can read: nothing is "--", a yes/no is Yes or
 * No, a list is its items, and an object is its own "name: value" pairs -
 * never "[object Object]" and never raw JSON.
 */
export const displayValue = (value) => {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    const items = value.map(displayValue).filter((item) => item !== '--')
    return items.length > 0 ? items.join(', ') : '--'
  }

  if (isPlainObject(value)) {
    const pairs = Object.entries(value).map(([key, inner]) => `${fieldLabel(key)}: ${displayValue(inner)}`)
    return pairs.length > 0 ? pairs.join(', ') : '--'
  }

  return textOf(value) || '--'
}

/**
 * A SKU's `sku_details` as the SKU tooltip shows them (SkuDetailsTooltip):
 * [{ name, value }], the value as text, a detail with no value left out.
 * Only `sku_details` - a variant as readVariant gives it.
 */
export const skuDetailPairs = (variant) =>
  (variant?.skuDetails ?? [])
    .map(([name, value]) => ({ name, value: displayValue(value) }))
    .filter(({ value }) => value !== '--')

/**
 * Whatever else an object carries: `[{ key, label, value }]` for every
 * property not in `known`. This is what keeps a field nobody listed from
 * being lost - a screen shows the properties it knows, then these.
 */
export const otherFields = (object, known = []) => {
  if (!isPlainObject(object)) return []

  // By its keys, not Object.entries: every product, SKU, entry and warehouse
  // of the list comes through here, nearly always for nothing - and a pair
  // made for each of their properties is most of the reading time.
  const others = []
  for (const key of Object.keys(object)) {
    if (!known.includes(key)) others.push({ key, label: fieldLabel(key), value: object[key] })
  }
  return others
}

/* ------------------------------------------------------------------ */
/* Reading a product                                                  */
/* ------------------------------------------------------------------ */

/**
 * The properties each reader below shows itself, or keeps off screen (ids,
 * GUIDs, flags, files) - everything else is "other": a field of the
 * company's own, shown as it came.
 */
const WAREHOUSE_KEYS = ['id', 'warehouse_id', 'name', 'warehouse_name', 'warehouse_quantity', 'level', 'shelf', 'rack_no']

/**
 * THE PRODUCT'S OWN FIELDS, under the keys the product API sends them -
 * which are also the `field_name`s of the company's Customised Fields for
 * them. So a form field is matched to its saved value by its name,
 * exactly, and a screen that needs one of these fields names it by its
 * key here - never by guessing from a name.
 */
export const PRODUCT_FIELD = Object.freeze({
  NAME: 'Product Name',
  GROUP: 'Group',
  HSN: 'HSN Code',
  UNIT: 'Per Unit',
  GST_RATE: 'GST Rate',
  CATEGORY: 'Category',
})

const DETAIL_KEYS = [
  'Unit Rate',
  'Quantity',
  'expiry_date',
  'Expiry Date',
  'created_at',
  'sr_no',
  'warehouse',
  'deleted',
  'past_version',
  // Read into the SKU when the SKU itself does not carry them - see readVariant.
  'sku_details',
  'raw_reference',
  'semi_finished_reference',
  'semi_finished',
]
const VARIANT_KEYS = [
  'product_id',
  'sku_code',
  'sku_details',
  'total_qty',
  'total_amount',
  'Selling Rate',
  'product_details',
  'vendor',
  'raw_reference',
  'semi_finished_reference',
  'past_version',
  'deleted',
  'stockitem_guid',
  'expiry_product_id',
  'photo',
]
const PRODUCT_KEYS = [...Object.values(PRODUCT_FIELD), 'total_qty', 'total_amount', 'sku_variants']

/**
 * One warehouse allocation. The reply may give the warehouse a name, only
 * its id (the id is all a save sends), or neither - a company without
 * Inventory Management has just a quantity. `names` is the id -> name of the
 * company's warehouses, when the page has it, to put a name to a bare id.
 *
 * `label` is what the warehouse is called on screen and in the filter: its
 * name, else "Warehouse <id>", else '' - an allocation that names no
 * warehouse at all.
 */
const readWarehouse = (warehouse, names) => {
  const id = pick(warehouse, ['id', 'warehouse_id']) ?? null
  const name = textOf(pick(warehouse, ['warehouse_name', 'name'])) || textOf(names?.[String(id)])

  return {
    source: warehouse,
    id,
    name,
    label: name || (id !== null && textOf(id) ? `Warehouse ${id}` : ''),
    quantity: warehouse.warehouse_quantity,
    level: warehouse.level,
    shelf: warehouse.shelf,
    rackNo: warehouse.rack_no,
    others: otherFields(warehouse, WAREHOUSE_KEYS),
  }
}

/**
 * One `product_details` entry: a rate, a quantity, an expiry date, when it
 * was added, and where the stock is. The reply may send the quantity and
 * the expiry date under either of two names - each is read once.
 */
const readDetail = (detail, names) => ({
  source: detail,
  srNo: detail.sr_no ?? null,
  unitRate: detail['Unit Rate'],
  quantity: detail.Quantity,
  // '' and null both mean "no expiry date".
  expiryDate: textOf(firstFilled(detail, ['expiry_date', 'Expiry Date'])) || null,
  createdAt: textOf(detail.created_at),
  warehouses: listOf(detail.warehouse).filter(isPlainObject).map((warehouse) => readWarehouse(warehouse, names)),
  others: otherFields(detail, DETAIL_KEYS),
})

/** A non-empty object, or null. */
const filledObject = (value) => (isPlainObject(value) && Object.keys(value).length > 0 ? value : null)

/**
 * One SKU of a product.
 *
 * A product is SAVED with its SKU details and references inside each
 * `product_details` entry (see buildProductPayload), and LISTED with them
 * on the SKU - so both are looked for: the SKU's own first, then its
 * entries' (not a deleted one's). Either way the screens, and a reference
 * to this SKU, get what it is really made of rather than nothing.
 */
const readVariant = (variant, names) => {
  const entries = listOf(variant.product_details).filter((detail) => isPlainObject(detail) && detail.deleted !== true)

  const skuDetails =
    filledObject(variant.sku_details) ?? entries.map((detail) => filledObject(detail.sku_details)).find(Boolean) ?? {}

  /** A list the SKU carries - or, when it carries none, its entries' together. */
  const ownOrEntries = (...keys) => {
    const own = keys.map((key) => listOf(variant[key])).find((list) => list.length > 0)
    return own ?? entries.flatMap((detail) => keys.map((key) => listOf(detail[key])).find((list) => list.length > 0) ?? [])
  }

  return {
    source: variant,
    productId: variant.product_id ?? null,
    skuCode: textOf(variant.sku_code),
    // [[name, value]] - the company's own SKU fields, whatever they are.
    skuDetails: Object.entries(skuDetails),
    totalQty: variant.total_qty,
    totalAmount: variant.total_amount,
    details: entries.map((detail) => readDetail(detail, names)),
    vendors: listOf(variant.vendor),
    rawReferences: ownOrEntries('raw_reference'),
    semiFinishedReferences: ownOrEntries('semi_finished_reference', 'semi_finished'),
    // Its earlier references - { version1: { raw_reference, semi_finished_reference } }.
    pastVersions: Object.entries(
      filledObject(variant.past_version) ?? entries.map((detail) => filledObject(detail.past_version)).find(Boolean) ?? {},
    )
      .filter(([, version]) => isPlainObject(version))
      .map(([key, version]) => ({
        key,
        label: key.replace(/^version_?(\d+)$/i, 'Version $1'),
        raw: listOf(version.raw_reference),
        semiFinished: listOf(version.semi_finished_reference),
      })),
    // The SKU's own fields beside its sku_details (Width, Manufacturing
    // Date...) - whatever the company has, none of them named here.
    others: otherFields(variant, VARIANT_KEYS),
  }
}

/**
 * THE SELLING RATE SHOWN FOR A PRODUCT, in its one row of the table.
 *
 * It is the "Selling Rate" the API sends, exactly that key - on each SKU
 * (`sku_variants[]`), or on the product row itself for a product sent with
 * none. Never a "Unit Rate": that is one `product_details` entry's own, and
 * is shown on that entry's line in the opened row.
 *
 * A product can have several SKUs at several selling rates, and no one of
 * them is "the" rate - so none is picked:
 *
 *   every Selling Rate the product has
 *     all the same        that rate                     "30000"
 *     different           the lowest to the highest      "120 - 135"
 *   none (or none a number)   nothing ("--")
 *
 * `sortValue` is the lowest of them, so sorting the column by rate orders
 * products by where their rates begin.
 */
const tidy = (number) => String(Number(number.toFixed(4)))

const SELLING_RATE = 'Selling Rate'

const readRate = (row, variants) => {
  const ofSkus = variants.map((variant) => numberOf(variant.source[SELLING_RATE])).filter((rate) => rate !== null)
  const own = numberOf(row[SELLING_RATE])
  const numbers = ofSkus.length > 0 ? ofSkus : own !== null ? [own] : []

  if (numbers.length === 0) return { text: '', sortValue: null }

  const lowest = Math.min(...numbers)
  const highest = Math.max(...numbers)

  return { text: lowest === highest ? tidy(lowest) : `${tidy(lowest)} - ${tidy(highest)}`, sortValue: lowest }
}

/** The values some SKUs have for one thing, each once, in the order met. */
const distinct = (values) => [...new Set(values.map(textOf).filter(Boolean))]

/**
 * The rows of the list, under the names the screens use.
 *
 *   key           the row's own key: its first SKU's `product_id`, else its
 *                 place in the list
 *   name, hsn, group, unit, gstRate, category     the product's own
 *   quantity, totalAmount                         total_qty, total_amount
 *   rate, rateSort                                its Selling Rate - see readRate
 *   variants      its SKUs - see readVariant
 *   others        every other property the product carries
 *   source        the product exactly as the backend sent it
 *
 * `warehouseNames` is optional: { "<warehouse id>": "name" }.
 *
 * ONE READ PER REPLY. The shared cache (useProducts) hands every screen
 * the same rows array until the list changes, so what is read from it is
 * kept against that array: the table, Add Existing Product and each
 * material reference picker of the form share one read, rather than each
 * going through every product again and keeping a copy of its own. A new
 * reply is a new array, so nothing outdated is reused, and the read goes
 * when the reply does (a WeakMap on it) - one with the last
 * `warehouseNames` given, and one without. Neither the reply nor what is
 * read from it is ever changed, by this or by any screen.
 */
const reads = new WeakMap()

export const readProducts = (rows, warehouseNames = null) => {
  if (!Array.isArray(rows)) return readRows(rows, warehouseNames)

  const kept = reads.get(rows) ?? {}
  const slot = warehouseNames ? 'named' : 'plain'
  if (kept[slot]?.names === warehouseNames) return kept[slot].products

  const products = readRows(rows, warehouseNames)
  reads.set(rows, { ...kept, [slot]: { names: warehouseNames, products } })
  return products
}

const readRows = (rows, warehouseNames) => {
  // A row's key is its first SKU's id - and a list can name the same SKU
  // twice (the expired products: one record per expiry), so a key already
  // taken is made unique with the row's place.
  const taken = new Set()

  return listOf(rows)
    .filter(isPlainObject)
    .map((row, index) => {
      const variants = listOf(row.sku_variants)
        .filter((variant) => isPlainObject(variant) && variant.deleted !== true)
        .map((variant) => readVariant(variant, warehouseNames))
      const rate = readRate(row, variants)

      const first = variants.find((variant) => variant.productId !== null)?.productId ?? `row-${index}`
      const key = taken.has(first) ? `${first}-${index}` : first
      taken.add(key)

      return {
        source: row,
        key,
        name: textOf(row[PRODUCT_FIELD.NAME]),
        hsn: textOf(row[PRODUCT_FIELD.HSN]),
        group: textOf(row[PRODUCT_FIELD.GROUP]),
        unit: textOf(row[PRODUCT_FIELD.UNIT]),
        quantity: row.total_qty,
        totalAmount: row.total_amount,
        gstRate: textOf(row[PRODUCT_FIELD.GST_RATE]),
        category: textOf(row[PRODUCT_FIELD.CATEGORY]),
        rate: rate.text,
        rateSort: rate.sortValue,
        variants,
        others: otherFields(row, PRODUCT_KEYS),
      }
    })
}

/**
 * THE CATEGORIES A PRODUCT CAN BE OF, as they are compared: without
 * capitals, and with any run of spaces, hyphens or underscores read as one
 * space - so "Semi-Finished", " semi finished " and "SEMI_FINISHED" are
 * one category. The product's own `category` is never changed; only the
 * comparison is forgiving.
 */
export const PRODUCT_CATEGORY = Object.freeze({
  FINISHED: 'finished',
  SEMI_FINISHED: 'semi finished',
  RAW_MATERIAL: 'raw material',
})

const categoryKey = (value) => textOf(value).toLowerCase().replace(/[\s_-]+/g, ' ')

/**
 * WHICH REFERENCES A CATEGORY HAS - what it is made from:
 *
 *   Raw Material    neither
 *   Semi-Finished   raw materials only
 *   Finished        raw materials and semi-finished goods
 *   anything else   neither
 *
 * `category` is the text itself (a form's Category value, say), compared
 * the forgiving way above.
 */
export const referencesOfCategory = (category) => {
  const key = categoryKey(category)

  return {
    raw: key === PRODUCT_CATEGORY.FINISHED || key === PRODUCT_CATEGORY.SEMI_FINISHED,
    semiFinished: key === PRODUCT_CATEGORY.FINISHED,
  }
}

/** Whether a product (as readProducts gives it) is of one of PRODUCT_CATEGORY. */
export const isProductCategory = (product, category) => categoryKey(product?.category) === category

/**
 * WHETHER A PRODUCT HAS RAW AND SEMI-FINISHED REFERENCES AT ALL - which is
 * its category's to say, not its data's:
 *
 *   Finished                      made from raw and semi-finished goods: yes
 *   Semi-Finished, Raw Material   no
 *   anything else, or none        no - only a Finished product is known to
 *
 * The category is compared as isProductCategory compares it; the product
 * keeps it exactly as it was sent.
 */
export const hasMaterialReferences = (product) => isProductCategory(product, PRODUCT_CATEGORY.FINISHED)

/* ------------------------------------------------------------------ */
/* Edit - a SKU's saved values, for the Product form                   */
/* ------------------------------------------------------------------ */

/**
 * WHAT ONE SKU WAS SAVED WITH, for the Product form to start from - an
 * edit, or Add Existing Product. Without a `variant` it is the product's
 * own values alone, with no SKU, stock, vendor or reference.
 * A product is edited one SKU at a time: each SKU is its own record, named
 * by its `product_id` (see updateProduct in Services/inventoryService).
 *
 * ONE ENTRY OF IT. A SKU can hold several `product_details` entries, each
 * its own record by its `sr_no` (with its own `created_at`). `detail` is the
 * one to start from - one of variant.details, as readVariant gives them -
 * and without it the SKU's first. Everything an entry keeps is read from
 * THAT entry alone - its Quantity, Unit Rate, warehouses, `sr_no`, and its
 * SKU details and references when the SKU does not carry them itself - so
 * one record is never filled with another's values.
 *
 *   product, variant, entry   the product row, the SKU and that (not
 *               deleted) `product_details` entry, as the backend sent them -
 *               what savedValue looks a field up in
 *   sku         its SKU details { name: value }
 *   warehouses  that entry's stock, as the form's lines take it (text)
 *   vendors     its `vendor` list - [{ id, name }]
 *   references  { raw, semiFinished } - its current references
 *   pastVersion its `past_version` - { version_1: {...}, ... } - or {}
 *   srNo        that entry's own `sr_no`, or null - sent back with it on
 *               Save, so the backend updates THAT record
 */
const textOrEmpty = (value) => (value === null || value === undefined ? '' : String(value))

/** A reference with its SKU attributes under `sku_details` only. */
const withSkuDetailsKey = (reference) => {
  if (!isPlainObject(reference) || !('sku_detail' in reference)) return reference

  const { sku_detail: older, ...rest } = reference
  return { ...rest, sku_details: filledObject(rest.sku_details) ?? (isPlainObject(older) ? older : {}) }
}

/** A list the SKU carries itself, else the one its chosen entry carries - the first of `keys` either has. */
const ownOrEntry = (variant, entry, keys) =>
  [variant?.source, entry].map((object) => keys.map((key) => listOf(object?.[key])).find((list) => list.length > 0)).find(Boolean) ?? []

export const productEditSource = (product, variant = null, detail = variant?.details[0] ?? null) => {
  // No SKU (none chosen yet, or none at all): the product's own values only.
  const entry = detail?.source ?? {}

  return {
    product: product.source,
    variant: variant?.source ?? {},
    entry,
    // The SKU's own sku_details, else this entry's - never another entry's.
    sku: variant ? (filledObject(variant.source.sku_details) ?? filledObject(entry.sku_details) ?? Object.fromEntries(variant.skuDetails)) : {},
    warehouses: listOf(entry.warehouse)
      .filter(isPlainObject)
      .map((warehouse) => ({
        warehouse: textOrEmpty(pick(warehouse, ['id', 'warehouse_id'])),
        warehouse_quantity: textOrEmpty(warehouse.warehouse_quantity),
        level: textOrEmpty(warehouse.level),
        shelf: textOrEmpty(warehouse.shelf),
        rack_no: textOrEmpty(warehouse.rack_no),
      })),
    vendors: variant?.vendors ?? [],
    // A reference saved before its SKU attributes were named `sku_details`
    // (they were `sku_detail`) is read under the one name, so an edit
    // shows them and sends them back under `sku_details` alone. The
    // history in `past_version` is never rewritten.
    references: variant
      ? {
        raw: ownOrEntry(variant, entry, ['raw_reference']).map(withSkuDetailsKey),
        semiFinished: ownOrEntry(variant, entry, ['semi_finished_reference', 'semi_finished']).map(withSkuDetailsKey),
      }
      : { raw: [], semiFinished: [] },
    pastVersion: filledObject(variant?.source?.past_version) ?? filledObject(entry.past_version) ?? {},
    srNo: entry.sr_no ?? null,
  }
}

/**
 * WHAT EVERY SKU OF A PRODUCT HAS THE SAME OF - the plain values (text, a
 * number, yes/no) its SKUs all carry, each the same in all of them: a
 * product's "Selling Rate" is kept on each SKU, not on the product, so a
 * product chosen before one of its SKUs is still known by it when its SKUs
 * agree. A value the SKUs differ on, or one some have and some do not, is
 * not there. { name: value }.
 */
export const sharedSkuValues = (product) => {
  const sources = (product?.variants ?? []).map((variant) => variant.source).filter(isPlainObject)
  if (sources.length === 0) return {}

  return Object.fromEntries(
    Object.entries(sources[0]).filter(
      ([key, value]) => isScalar(value) && textOf(value) !== '' && sources.every((source) => isScalar(source[key]) && textOf(source[key]) === textOf(value)),
    ),
  )
}

/** Whether a column of the custom report, by its name, is an expiry date ("Expiry Date", expiry_date). */
export const isExpiryDateField = (fieldName) => String(fieldName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'expirydate'

const isScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value)

/**
 * A FORM FIELD'S SAVED VALUE: the first of `objects` (in the order given)
 * that has it under the field's own name, exactly. A Customised Field is
 * saved, and listed, under its `field_name` - "Product Name", "HSN Code",
 * "Quantity" - so that is the one key to look under.
 *
 * Only a plain value counts (text, a number, yes/no) - never a list or an
 * object. undefined when none of them has one.
 */
export const savedValue = (objects, fieldName) =>
  objects.find((object) => isPlainObject(object) && isScalar(object[fieldName]))?.[fieldName]

/**
 * A SKU's per-SKU stock fields - PRODUCT_PER_SKU_FIELDS: Quantity, Expiry
 * Date, Unit Rate, always in that order - as [{ name, value }]. The value is
 * the SKU's own sku_details one when it has the field, else its first
 * entry's (the record Edit opens); undefined when neither has it.
 */
export const skuStockFields = (variant) => {
  const entry = variant.details[0]
  // The entry's, by the same place in PRODUCT_PER_SKU_FIELDS.
  const fromEntry = [entry?.quantity, entry?.expiryDate, entry?.unitRate]

  return PRODUCT_PER_SKU_FIELDS.map((name, rank) => {
    const own = variant.skuDetails.find(([key]) => perSkuFieldRank(key) === rank)
    return own ? { name: own[0], value: own[1] } : { name, value: fromEntry[rank] }
  })
}

/** Every warehouse allocation of a SKU, across its entries. */
export const variantWarehouses = (variant) => variant.details.flatMap((detail) => detail.warehouses)

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

/**
 * THE FILTERS, as `{ [field]: value }` - the shape the table's filter row
 * works in. A field is one of:
 *
 *   PRODUCT_FILTER.SKU_CODE      a SKU's code
 *   PRODUCT_FILTER.WAREHOUSE     a warehouse, by its label
 *   PRODUCT_FILTER.EXPIRY_FROM   } an expiry date range, YYYY-MM-DD - either
 *   PRODUCT_FILTER.EXPIRY_TO     } end may be left open
 *   skuAttributeFilter(name)     one of the company's SKU fields - "Color",
 *                                "Size", whatever they are - and a value of it
 *
 * A product is its SKUs, so the filters are answered per SKU: a product
 * stays when ONE of its SKUs passes EVERY filter that is set. "Color: Red"
 * with "Size: 50m" finds the products that have a red 50m SKU - not those
 * with a red one and, separately, a 50m one.
 *
 * THE EXPIRY DATES are each SKU's `product_details[].expiry_date` - never the
 * product's own - so a SKU passes when one of its entries expires within the
 * range. An entry with no expiry date is never in a range.
 */
export const PRODUCT_FILTER = Object.freeze({
  SKU_CODE: 'sku_code',
  WAREHOUSE: 'warehouse',
  EXPIRY_FROM: 'expiry_from',
  EXPIRY_TO: 'expiry_to',
})

const ATTRIBUTE_PREFIX = 'sku:'

/** The filter field of one SKU attribute. */
export const skuAttributeFilter = (name) => `${ATTRIBUTE_PREFIX}${name}`

/**
 * Whether a date falls in a range: `from` and `to` are YYYY-MM-DD, either
 * '' for an open end. The date is read the project's way (Utils/date), so
 * "2026-10-10" and "10-10-2026" are one day; one that cannot be read is in
 * no range.
 */
export const isWithinDates = (value, from, to) => {
  const date = toInputDate(value)
  if (!date) return false

  return (!from || date >= from) && (!to || date <= to)
}

/** Whether one SKU passes every filter that is set - `range` is the expiry range, or null. */
const variantMatches = (variant, filters, range) => {
  if (range && !variant.details.some((detail) => isWithinDates(detail.expiryDate, range.from, range.to))) return false

  return Object.entries(filters).every(([field, value]) => {
    if (field === PRODUCT_FILTER.SKU_CODE) return variant.skuCode === value
    if (field === PRODUCT_FILTER.WAREHOUSE) return variantWarehouses(variant).some((warehouse) => warehouse.label === value)

    if (field.startsWith(ATTRIBUTE_PREFIX)) {
      const name = field.slice(ATTRIBUTE_PREFIX.length)
      return variant.skuDetails.some(([key, held]) => key === name && textOf(held) === value)
    }

    return true
  })
}

/**
 * The products the filters leave - a new list, in the same order. Neither
 * the products nor the reply they were read from are touched, and nothing
 * is asked of the backend: this is the rows already loaded, narrowed.
 */
export const filterProducts = (products, filters) => {
  const { [PRODUCT_FILTER.EXPIRY_FROM]: from = '', [PRODUCT_FILTER.EXPIRY_TO]: to = '', ...rest } = filters ?? {}

  const active = Object.fromEntries(Object.entries(rest).filter(([, value]) => value))
  const range = from || to ? { from, to } : null
  if (Object.keys(active).length === 0 && !range) return products

  return products.filter((product) => product.variants.some((variant) => variantMatches(variant, active, range)))
}

/**
 * "2" before "10", as localeCompare(other, undefined, { numeric: true }) orders
 * them - the same order, from one collator made once: localeCompare with
 * options sets up a collator on EVERY comparison, which over tens of
 * thousands of SKU codes is most of a second.
 */
const naturalOrder = new Intl.Collator(undefined, { numeric: true }).compare

/**
 * WHAT EACH FILTER CAN OFFER, worked out from the products themselves - so
 * a filter only ever offers a value that is really there, and a company
 * with different SKU fields gets different filters.
 *
 *   fields    { [field]: label }      the filters there are, in order: SKU
 *             Code and Warehouse (when any product has one), then one per
 *             SKU attribute found
 *   options   { [field]: [value] }    the choices of each, sorted
 *   hints     { [field]: { [value]: [{ name, value }] } }   for SKU Code:
 *             that SKU's sku_details (skuDetailPairs) - shown in the SKU
 *             tooltip when the option is hovered
 *   attributeFields   the fields that are SKU attributes - the ones a page
 *             tucks behind "More Filters"
 *   hasExpiry  some SKU has an expiry date - the expiry range is worth
 *             offering
 */
export const productFilterOptions = (products) => {
  const variants = products.flatMap((product) => product.variants)
  const sorted = (values) => distinct(values).sort(naturalOrder)

  const fields = {}
  const options = {}
  const hints = {}

  const skuCodes = sorted(variants.map((variant) => variant.skuCode))
  if (skuCodes.length > 0) {
    fields[PRODUCT_FILTER.SKU_CODE] = 'SKU Code'
    options[PRODUCT_FILTER.SKU_CODE] = skuCodes
    // Every code, with its SKU's details - a code two SKUs share takes the
    // first one's that has any.
    const byCode = {}
    variants.forEach((variant) => {
      if (variant.skuCode && !byCode[variant.skuCode]?.length) byCode[variant.skuCode] = skuDetailPairs(variant)
    })
    hints[PRODUCT_FILTER.SKU_CODE] = byCode
  }

  const warehouses = sorted(variants.flatMap((variant) => variantWarehouses(variant).map((warehouse) => warehouse.label)))
  if (warehouses.length > 0) {
    fields[PRODUCT_FILTER.WAREHOUSE] = 'Warehouse'
    options[PRODUCT_FILTER.WAREHOUSE] = warehouses
  }

  // The range is offered only when some SKU HAS an expiry date - a company
  // that keeps none has no use for it.
  const hasExpiry = variants.some((variant) => variant.details.some((detail) => detail.expiryDate))

  // The SKU attributes, in the order the SKUs carry them - every SKU's
  // values gathered under their attribute in ONE pass, not one pass over
  // every SKU per attribute.
  const valuesOf = new Map()
  variants.forEach((variant) =>
    variant.skuDetails.forEach(([name, value]) => {
      if (!valuesOf.has(name)) valuesOf.set(name, [])
      valuesOf.get(name).push(value)
    }),
  )

  const attributeFields = []
  distinct([...valuesOf.keys()]).forEach((name) => {
    const values = sorted(valuesOf.get(name) ?? [])
    if (values.length === 0) return

    const field = skuAttributeFilter(name)
    fields[field] = name
    options[field] = values
    attributeFields.push(field)
  })

  return { fields, options, hints, attributeFields, hasExpiry }
}

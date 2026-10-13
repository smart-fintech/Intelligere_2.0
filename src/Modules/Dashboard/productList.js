/**
 * READING THE PRODUCT LIST - with no screen attached.
 *
 * `POST inventory/product/` (getProducts) answers with one object per
 * product, and inside it one per SKU:
 *
 *   { "product_name": "Air Conditioner", "total_qty": "4", "total_amount": "120000",
 *     "group": "Primary", "hsn_code": "84151010", "per_unit": "NOS",
 *     "gst_rate": "28", "category": "",
 *     "sku_variants": [
 *       { "product_id": 1, "sku_code": "", "total_qty": "4", "total_amount": "120000",
 *         "sku_details": { "Fabric Type": "Cotton", ... },        <- with SKUs only
 *         "product_details": [
 *           { "sr_no": 1, "source": "tally", "deleted": false, "Unit Rate": "30000",
 *             "product_quantity": "4", "expiry_date": null,
 *             "warehouse": [ { "id": "42", "warehouse_quantity": "4",
 *                              "level": "1", "shelf": "sh-1", "rack_no": "A-1" } ] } ],
 *         "vendor": [], "raw_reference": [], "semi_finished_reference": [],
 *         "photo": "", "selling_price": "30000" } ] }
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
 *   productEditSource(product, variant)  what one SKU was saved with, for Edit
 *   savedValue(objects, fieldName)       a form field's saved value in them
 *   otherFields(object, known)           whatever else an object carries
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
 * Whatever else an object carries: `[{ key, label, value }]` for every
 * property not in `known`. This is what keeps a field nobody listed from
 * being lost - a screen shows the properties it knows, then these.
 */
export const otherFields = (object, known = []) =>
  isPlainObject(object)
    ? Object.entries(object)
        .filter(([key]) => !known.includes(key))
        .map(([key, value]) => ({ key, label: fieldLabel(key), value }))
    : []

/* ------------------------------------------------------------------ */
/* Reading a product                                                  */
/* ------------------------------------------------------------------ */

/** The properties each reader below shows itself - everything else is "other". */
const WAREHOUSE_KEYS = ['id', 'warehouse_id', 'name', 'warehouse_name', 'warehouse_quantity', 'level', 'shelf', 'rack_no']
const DETAIL_KEYS = [
  'Unit Rate',
  'product_quantity',
  'expiry_date',
  'warehouse',
  'deleted',
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
  'selling_price',
  'product_details',
  'vendor',
  'raw_reference',
  'semi_finished_reference',
  'deleted',
]
const PRODUCT_KEYS = [
  'product_name',
  'hsn_code',
  'group',
  'per_unit',
  'total_qty',
  'total_amount',
  'gst_rate',
  'category',
  'sku_variants',
]

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

/** One `product_details` entry: a rate, a quantity, an expiry date, and where the stock is. */
const readDetail = (detail, names) => ({
  source: detail,
  unitRate: detail['Unit Rate'],
  quantity: detail.product_quantity,
  // '' and null both mean "no expiry date".
  expiryDate: textOf(detail.expiry_date) || null,
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
    sellingPrice: variant.selling_price,
    details: entries.map((detail) => readDetail(detail, names)),
    vendors: listOf(variant.vendor),
    rawReferences: ownOrEntries('raw_reference'),
    semiFinishedReferences: ownOrEntries('semi_finished_reference', 'semi_finished'),
    others: otherFields(variant, VARIANT_KEYS),
  }
}

/**
 * THE RATE SHOWN FOR A PRODUCT, in its one row of the table.
 *
 * A product can have several SKUs at several rates, and no one of them is
 * "the" rate - so none is picked. The rule is the same for every product:
 *
 *   every Unit Rate the product has (across its SKUs and their entries)
 *     all the same        that rate                     "30000"
 *     different           the lowest to the highest      "120 - 135"
 *   no Unit Rate at all   the same rule on its SKUs' selling prices
 *   neither               nothing ("--")
 *
 * `sortValue` is the lowest of them, so sorting the column by rate orders
 * products by where their rates begin.
 */
const tidy = (number) => String(Number(number.toFixed(4)))

const readRate = (variants) => {
  const unitRates = variants.flatMap((variant) => variant.details.map((detail) => numberOf(detail.unitRate)))
  const sellingPrices = variants.map((variant) => numberOf(variant.sellingPrice))

  const rates = unitRates.filter((rate) => rate !== null)
  const numbers = rates.length > 0 ? rates : sellingPrices.filter((price) => price !== null)

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
 *   rate, rateSort                                see readRate
 *   sellingPrice                                  its SKUs' selling prices, each once
 *   variants      its SKUs - see readVariant
 *   others        every other property the product carries
 *   source        the product exactly as the backend sent it
 *
 * `warehouseNames` is optional: { "<warehouse id>": "name" }.
 */
export const readProducts = (rows, warehouseNames = null) => {
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
      const rate = readRate(variants)

      const first = variants.find((variant) => variant.productId !== null)?.productId ?? `row-${index}`
      const key = taken.has(first) ? `${first}-${index}` : first
      taken.add(key)

      return {
        source: row,
        key,
        name: textOf(row.product_name),
        hsn: textOf(row.hsn_code),
        group: textOf(row.group),
        unit: textOf(row.per_unit),
        quantity: row.total_qty,
        totalAmount: row.total_amount,
        gstRate: textOf(row.gst_rate),
        category: textOf(row.category),
        rate: rate.text,
        rateSort: rate.sortValue,
        sellingPrice: distinct(variants.map((variant) => variant.sellingPrice)).join(', '),
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
 *   product, variant, entry   the product row, the SKU and its (first, not
 *               deleted) `product_details` entry, as the backend sent them -
 *               what savedValue looks a field up in
 *   sku         its SKU details { name: value }
 *   warehouses  that entry's stock, as the form's lines take it (text)
 *   vendors     its `vendor` list - [{ id, name }]
 *   references  { raw, semiFinished } - its current references
 *   pastVersion its `past_version` - { version_1: {...}, ... } - or {}
 */
const textOrEmpty = (value) => (value === null || value === undefined ? '' : String(value))

/** A reference with its SKU attributes under `sku_details` only. */
const withSkuDetailsKey = (reference) => {
  if (!isPlainObject(reference) || !('sku_detail' in reference)) return reference

  const { sku_detail: older, ...rest } = reference
  return { ...rest, sku_details: filledObject(rest.sku_details) ?? (isPlainObject(older) ? older : {}) }
}

export const productEditSource = (product, variant = null) => {
  // No SKU (none chosen yet, or none at all): the product's own values only.
  const entry = variant?.details[0]?.source ?? {}

  return {
    product: product.source,
    variant: variant?.source ?? {},
    entry,
    sku: variant ? Object.fromEntries(variant.skuDetails) : {},
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
    references: {
      raw: (variant?.rawReferences ?? []).map(withSkuDetailsKey),
      semiFinished: (variant?.semiFinishedReferences ?? []).map(withSkuDetailsKey),
    },
    pastVersion: filledObject(variant?.source?.past_version) ?? filledObject(entry.past_version) ?? {},
  }
}

/** A name as compared loosely: no capitals, nothing but letters and digits ("HSN Code" = hsn_code). */
const looseKey = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The list's FIXED keys, by the loose name a form field may have for them
 * where the loose names differ - "Unit" is `per_unit`, a product's
 * "Quantity" its entry's `product_quantity`.
 */
const FIXED_KEYS = {
  unit: 'per_unit',
  quantity: 'product_quantity',
  itemname: 'product_name',
  hsn: 'hsn_code',
}

/** Whether a field, by its name, is an expiry date ("Expiry Date", expiry_date). */
export const isExpiryDateField = (fieldName) => looseKey(fieldName) === 'expirydate'

/** Whether a form field is the product's category - what decides its references. */
export const isCategoryField = (fieldName) => looseKey(fieldName) === 'category'

/** Whether a form field is the product's name - what an edit may not change. */
export const isProductNameField = (fieldName) => ['productname', 'itemname'].includes(looseKey(fieldName))

const isScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value)

/**
 * A FORM FIELD'S SAVED VALUE, looked up in `objects` in the order given:
 *
 *   1. under the field's own name, exactly - a Customised Field is saved,
 *      and listed, under its `field_name`
 *   2. under a fixed key of the list that is the same name loosely -
 *      "Product Name" is `product_name`, "HSN Code" `hsn_code`
 *   3. under the fixed key FIXED_KEYS gives the name
 *
 * Only a plain value counts (text, a number, yes/no) - never a list or an
 * object. undefined when none of them has one.
 */
export const savedValue = (objects, fieldName) => {
  const plain = objects.filter(isPlainObject)
  const wanted = looseKey(fieldName)

  const exact = plain.find((object) => isScalar(object[fieldName]))
  if (exact) return exact[fieldName]

  for (const object of plain) {
    const key = Object.keys(object).find((name) => looseKey(name) === wanted && isScalar(object[name]))
    if (key) return object[key]
  }

  const fixed = FIXED_KEYS[wanted]
  const holder = fixed ? plain.find((object) => isScalar(object[fixed])) : undefined
  return holder ? holder[fixed] : undefined
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
 * WHAT EACH FILTER CAN OFFER, worked out from the products themselves - so
 * a filter only ever offers a value that is really there, and a company
 * with different SKU fields gets different filters.
 *
 *   fields    { [field]: label }      the filters there are, in order: SKU
 *             Code and Warehouse (when any product has one), then one per
 *             SKU attribute found
 *   options   { [field]: [value] }    the choices of each, sorted
 *   hints     { [field]: { [value]: text } }   for SKU Code: what that SKU
 *             is made of, one "name: value" a line - shown when the option
 *             is hovered
 *   attributeFields   the fields that are SKU attributes - the ones a page
 *             tucks behind "More Filters"
 *   hasExpiry  some SKU has an expiry date - the expiry range is worth
 *             offering
 */
export const productFilterOptions = (products) => {
  const variants = products.flatMap((product) => product.variants)
  const sorted = (values) => distinct(values).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))

  const fields = {}
  const options = {}
  const hints = {}

  const skuCodes = sorted(variants.map((variant) => variant.skuCode))
  if (skuCodes.length > 0) {
    fields[PRODUCT_FILTER.SKU_CODE] = 'SKU Code'
    options[PRODUCT_FILTER.SKU_CODE] = skuCodes
    hints[PRODUCT_FILTER.SKU_CODE] = Object.fromEntries(
      variants
        .filter((variant) => variant.skuCode && variant.skuDetails.length > 0)
        .map((variant) => [
          variant.skuCode,
          variant.skuDetails.map(([name, value]) => `${name}: ${displayValue(value)}`).join('\n'),
        ]),
    )
  }

  const warehouses = sorted(variants.flatMap((variant) => variantWarehouses(variant).map((warehouse) => warehouse.label)))
  if (warehouses.length > 0) {
    fields[PRODUCT_FILTER.WAREHOUSE] = 'Warehouse'
    options[PRODUCT_FILTER.WAREHOUSE] = warehouses
  }

  // The range is offered only when some SKU HAS an expiry date - a company
  // that keeps none has no use for it.
  const hasExpiry = variants.some((variant) => variant.details.some((detail) => detail.expiryDate))

  // The SKU attributes, in the order the SKUs carry them.
  const attributeFields = []
  distinct(variants.flatMap((variant) => variant.skuDetails.map(([name]) => name))).forEach((name) => {
    const values = sorted(
      variants.flatMap((variant) => variant.skuDetails.filter(([key]) => key === name).map(([, value]) => value)),
    )
    if (values.length === 0) return

    const field = skuAttributeFilter(name)
    fields[field] = name
    options[field] = values
    attributeFields.push(field)
  })

  return { fields, options, hints, attributeFields, hasExpiry }
}

/**
 * The Inventory Details reference lists, written down in ONE place.
 *
 * There is no API for any of these yet, so they live here as constants
 * rather than being typed into a form. A form imports the list it needs and
 * never spells the values out itself. Each list is plain strings: the string
 * is both what the dropdown shows and EXACTLY what the backend receives, so
 * nothing is translated on the way out. To offer another choice, add it to
 * the list - no component changes.
 *
 * The navigation of the Inventory Details page is listed here as well, as
 * data, the same way Constants/dashboardModules describes the dashboard pages.
 */

import { ClipboardList, Package, Settings2, SlidersHorizontal, Truck, Warehouse } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* The navigation of the Inventory Details page                       */
/* ------------------------------------------------------------------ */

/**
 * TWO LEVELS: the SECTIONS across the top, and the TABS inside a section.
 *
 *   Product               (no tabs - one page)
 *   Inventory Master
 *     Master Details | Warehouse | Vendor | Customised Fields
 *
 * A section, and a tab, is:
 *   key    unique id - the React key, and its value in the address
 *          (?section=product, ?tab=warehouse). Never rename one that is in
 *          use: links people have saved carry it.
 *   label  the text shown
 *   icon   a lucide icon component
 *   ready  false while it only shows the Coming Soon placeholder. Flip it to
 *          true, and give it its page in INVENTORY_PAGES
 *          (Modules/Dashboard/Components/InventoryDetails), on the day it is
 *          built.
 *   tabs   sections only, optional - the tabs inside it. A section with
 *          tabs has no page of its own; opening it opens a tab.
 *
 * The order here IS the order on screen. A plain
 * /dashboard/inventory-details opens INVENTORY_DEFAULT_SECTION (below), and
 * a section opens on its first ready tab - so that is Inventory Master, on
 * Master Details.
 *
 * TO ADD A SECTION OR A TAB: add one entry here with `ready: false`. It
 * appears, with a Coming Soon page, with no other change.
 */
export const INVENTORY_SECTIONS = [
  {
    key: 'product',
    label: 'Product',
    icon: Package,
    ready: true,
  },
  {
    key: 'inventory-master',
    label: 'Inventory Master',
    icon: ClipboardList,
    ready: true,
    tabs: [
      { key: 'master-details', label: 'Master Details', icon: Settings2, ready: true },
      { key: 'warehouse', label: 'Warehouse', icon: Warehouse, ready: true },
      { key: 'vendor', label: 'Vendor', icon: Truck, ready: true },
      { key: 'customised-fields', label: 'Customised Fields', icon: SlidersHorizontal, ready: true },
    ],
  },
]

/**
 * The section a plain /dashboard/inventory-details opens on, by its key.
 *
 * Named rather than "the first ready one": Product comes first on screen,
 * and when it was built it would otherwise have taken over as the landing
 * page - and, as the default section is left out of the address, turned
 * every saved ?tab=warehouse link into a link to Product. Change it here, on
 * purpose, the day another section should open first.
 */
export const INVENTORY_DEFAULT_SECTION = 'inventory-master'

/* ------------------------------------------------------------------ */
/* Master Details                                                     */
/* ------------------------------------------------------------------ */

/** `industry_type` - the industry the company works in. */
export const INDUSTRY_TYPES = [
  'Automobile',
  'Chemical',
  'Electrical',
  'Engineering',
  'Food',
  'Metal',
  'Other',
  'Packaging',
  'Pharma',
  'Plastics',
  'Textile'
]

/**
 * `business_type` - whether the company makes its goods or trades them.
 * The values are exactly what the backend stores and sends back, so a rule
 * that depends on one compares against the name here rather than spelling
 * the word out again (see hasManufacturingPlantSetting in inventoryService).
 */
export const BUSINESS_TYPE_MANUFACTURER = 'Manufacturer'
export const BUSINESS_TYPE_TRADER = 'Trader'
export const BUSINESS_TYPES = [BUSINESS_TYPE_MANUFACTURER, BUSINESS_TYPE_TRADER]

/**
 * `fifo_lifo` - how stock is valued. Sent upper-case, as the backend stores
 * it ("FIFO"). FEFO (first expiry, first out) is for expiry-sensitive stock:
 * pharmacy, pharmaceuticals, medical products. Add a method here once the
 * backend accepts it.
 */
export const INVENTORY_VALUATION_METHODS = ['FIFO', 'LIFO', 'FEFO']

/**
 * `pdf_format` is a format NUMBER ("1"); this is how one is named on screen,
 * in the form and in the saved view alike.
 */
export const invoiceFormatLabel = (value) =>
  value === null || value === undefined || value === '' ? '' : `Format ${value}`

/* ------------------------------------------------------------------ */
/* Vendor                                                             */
/* ------------------------------------------------------------------ */

/**
 * What a vendor is rated on - one row of stars each in the Vendor form.
 *
 * Each name is EXACTLY the property the backend keeps the rating under,
 * spaces and ampersands included ("Service & Responsiveness") - it is the
 * label on screen and the key in the payload, so nothing is renamed on the
 * way out. To rate vendors on something else, add it here: the form, the
 * table's breakdown and the payload all follow.
 */
export const VENDOR_RATING_CRITERIA = [
  'Price Competitiveness',
  'On-Time Delivery',
  'Product Quality',
  'Service & Responsiveness',
  'Documentation Accuracy',
  'Order Fulfilment',
  'Consistency',
  'Payment & Commercial Compliance',
  'Innovation & Value Addition',
]

/** How many stars a rating has - one star is 1, all of them is this. */
export const VENDOR_RATING_MAX = 5

/** The property the overall rating is kept under, beside the nine ratings. */
export const VENDOR_OVERALL_RATING = 'Overall Rating'

/**
 * A vendor's overall rating: the plain average of its ratings, on the same
 * 0 - 5 scale, to one decimal place. No rating counts for more than another.
 *
 *   { 'Price Competitiveness': 4.5, 'On-Time Delivery': 4, ... }  ->  4
 *
 * Only a rating that has actually been given counts - one still at 0, missing
 * or not a number is left out rather than averaged in as a zero. With none
 * given there is nothing to average and the answer is null, never 0 or NaN.
 *
 * This is the ONE place the rule is written: the Vendor form shows what this
 * returns and sends the very same number, so the two cannot disagree.
 */
export const overallVendorRating = (ratings) => {
  const given = VENDOR_RATING_CRITERIA.map((name) => Number(ratings?.[name])).filter(
    (rating) => Number.isFinite(rating) && rating > 0,
  )
  if (given.length === 0) return null

  const average = given.reduce((total, rating) => total + rating, 0) / given.length
  return Math.round(average * 10) / 10
}

/* ------------------------------------------------------------------ */
/* Customised Fields                                                  */
/* ------------------------------------------------------------------ */

/**
 * `field_type` - what kind of value a customised field holds.
 *
 * `value` is EXACTLY what the backend stores and receives, odd casing and
 * all ("File", "long-text"); `label` is only how it reads on screen. These
 * are the types the API has been seen to return - add one here once the
 * backend accepts it, and it appears in the form, the table and the filter.
 */
export const CUSTOM_FIELD_TYPE_DROPDOWN = 'dropdown'

export const CUSTOM_FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: CUSTOM_FIELD_TYPE_DROPDOWN, label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'File', label: 'File' },
  { value: 'long-text', label: 'Long Text' },
  { value: 'custom', label: 'Custom' },
]

/**
 * How a `field_type` reads on screen. Matched without regard to case, so
 * "file" and "File" both read "File"; a type this list does not know is
 * shown as the backend sent it rather than hidden.
 */
export const customFieldTypeLabel = (value) => {
  const wanted = String(value ?? '').toLowerCase()
  return CUSTOM_FIELD_TYPES.find((type) => type.value.toLowerCase() === wanted)?.label ?? String(value ?? '')
}

/**
 * `field_size` - how wide the field is drawn where the fields are used.
 * Text, as the backend holds it ("4"). These are the sizes in use today.
 */
export const CUSTOM_FIELD_SIZES = ['1', '2', '4', '6']

/**
 * `option_type` - how many of a dropdown field's options can be chosen.
 * Only for `field_type: "dropdown"`; every other type sends "".
 */
export const CUSTOM_FIELD_OPTION_TYPES = [{ value: 'single', label: 'Single' }]

/* ------------------------------------------------------------------ */
/* Product                                                            */
/* ------------------------------------------------------------------ */

/**
 * How the Product form is cut into steps. The fields themselves, and their
 * order, are the company's Customised Fields - these only say how many go
 * where:
 *
 *   PRODUCT_MAIN_FIELD_COUNT   the first this-many fields, in field order,
 *                              are step 1 ("Main Details")
 *   PRODUCT_FIELDS_PER_STEP    every later step holds at most this many of
 *                              the fields that are left
 */
export const PRODUCT_MAIN_FIELD_COUNT = 7
export const PRODUCT_FIELDS_PER_STEP = 12

/**
 * The special kinds of product field. A customised field asks for one in
 * its `option_type` (with `field_type: "custom"`), or names it outright as
 * its `field_type`; the Product form checks both.
 *
 *   vendor_select    one of the company's vendors (Inventory Master > Vendor)
 *   raw_material     } chosen from the company's own products - which needs
 *   semi_finished    } the product list, a later stage of this module
 */
export const PRODUCT_FIELD_VENDOR_SELECT = 'vendor_select'
export const PRODUCT_FIELD_RAW_MATERIAL = 'raw_material'
export const PRODUCT_FIELD_SEMI_FINISHED = 'semi_finished'

/**
 * WHERE A PRODUCT FIELD GOES IN THE REQUEST - the exceptions.
 *
 * A product is sent to inventory/product/ as
 *
 *   { product_name, group, gst_rate, "<any other field>": ...,
 *     product_details: [{ sku_details, warehouse, product_quantity,
 *                         expiry_date, "Unit Rate",
 *                         semi_finished, raw_reference }, ...],
 *     vendor: [...] }
 *
 * THE RULE: a field goes at the top level under its own `field_name`
 * ("HSN Code", "Category", "Lot / Roll Number" ...). The ones below are the only
 * ones that do not, and this table is the ONLY place the Product form knows
 * a field by name:
 *
 *   field   the customised field's name, as the standard fields are called
 *   key     what the backend calls it
 *   in      'product'  the top level, renamed
 *           'detail'   inside the product_details entries
 *
 * 'detail' IS ALSO WHAT MAKES A FIELD PER-SKU. `product_details` has one
 * entry per SKU, so for a product with SKUs a 'detail' field is filled in
 * once in each SKU entry - each SKU has its own quantity, expiry date and
 * rate - and is not drawn anywhere else. THE ORDER OF THE 'detail' ROWS
 * BELOW IS THE ORDER THEY ARE DRAWN IN within a SKU entry, which is why
 * Unit Rate is last: it closes the entry. For a product without SKUs they
 * are normal fields, drawn once where the field order puts them.
 *
 * The name field is listed under both names it goes by - "Product Name" in
 * the configuration the backend sends today, "Item Name" in an older one.
 *
 * Matched without regard to case or outer spaces. A company that renames one
 * of these fields on the Customised Fields tab breaks the match - the value
 * would then go to the top level under its new name - so if that tab ever
 * needs to allow it, match on something steadier than the name here.
 *
 * (SKU fields are not in this table: when SKU management is on they go into
 * `sku_details`, whatever they are called. A vendor field fills `vendor`.)
 */
export const PRODUCT_FIELD_PLACEMENT = [
  { field: 'Product Name', key: 'product_name', in: 'product' },
  { field: 'Item Name', key: 'product_name', in: 'product' },
  { field: 'Group', key: 'group', in: 'product' },
  { field: 'GST Rate', key: 'gst_rate', in: 'product' },
  { field: 'Quantity', key: 'product_quantity', in: 'detail' },
  { field: 'Expiry Date', key: 'expiry_date', in: 'detail' },
  { field: 'Unit Rate', key: 'Unit Rate', in: 'detail' },
]

/** The backend's key for the quantity a product's warehouse stock is checked against. */
export const PRODUCT_QUANTITY_KEY = 'product_quantity'

/** A field's entry in PRODUCT_FIELD_PLACEMENT, or null when it follows the rule. */
export const productFieldPlacement = (fieldName) => {
  const wanted = String(fieldName ?? '').trim().toLowerCase()
  return PRODUCT_FIELD_PLACEMENT.find((entry) => entry.field.toLowerCase() === wanted) ?? null
}

/** A list of strings as the `{ value, label }` options SelectField takes. */
export const toOptions = (values) => values.map((value) => ({ value, label: value }))

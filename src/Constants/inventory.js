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
 * /dashboard/inventory-details opens the first READY section, and a section
 * opens on its first ready tab - so today that is Inventory Master, on
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
    ready: false,
  },
  {
    key: 'inventory-master',
    label: 'Inventory Master',
    icon: ClipboardList,
    ready: true,
    tabs: [
      { key: 'master-details', label: 'Master Details', icon: Settings2, ready: true },
      { key: 'warehouse', label: 'Warehouse', icon: Warehouse, ready: true },
      { key: 'vendor', label: 'Vendor', icon: Truck, ready: false },
      { key: 'customised-fields', label: 'Customised Fields', icon: SlidersHorizontal, ready: false },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Master Details                                                     */
/* ------------------------------------------------------------------ */

/** `industry_type` - the industry the company works in. */
export const INDUSTRY_TYPES = [
  'Automobile',
  'Manufacturing',
  'Textile',
  'Pharmaceuticals',
  'Chemicals',
  'Electronics',
  'Electrical',
  'Food & Beverage',
  'FMCG',
  'Retail',
  'Wholesale',
  'Construction',
  'Engineering',
  'Agriculture',
  'Healthcare',
  'Logistics',
  'Furniture',
  'Packaging',
  'Printing',
  'Hardware',
  'Software / IT',
  'Other',
]

/** `business_type` - whether the company makes its goods or trades them. */
export const BUSINESS_TYPES = ['Manufacturer', 'Trader']

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

/** A list of strings as the `{ value, label }` options SelectField takes. */
export const toOptions = (values) => values.map((value) => ({ value, label: value }))

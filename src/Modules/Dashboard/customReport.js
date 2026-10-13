/**
 * READING THE CUSTOM REPORT - with no screen attached.
 *
 * `POST inventory/ProductCustomizedReport/` (getProductCustomReport) answers
 * with one object per product, its fields under the company's own names and
 * its stock in `warehouse`:
 *
 *   { "id": 30029, "Product Name": "shirt", "Category": "Semi-Finished",
 *     "Quantity": "200", "Unit Rate": "900", "Fabric Type": "Garment", ...,
 *     "warehouse": [{ "id": "12", "name": "WAREHOUSING 1", "level": "LE-1",
 *                     "shelf": "SH-2", "rack_no": "Ra-3", "warehouse_quantity": "200" }] }
 *
 * NO COLUMN IS NAMED HERE. The columns are every plain field the rows carry
 * (text, numbers, yes/no), in the order they first appear, under their own
 * names - so a company with other fields gets other columns. `id` is the
 * row's identity, not a column; `warehouse` is the row's expansion; a list
 * or an object is not a column either.
 *
 * Two fields are recognised by NAME, because the screen does something with
 * them, and only when the rows really have them:
 *
 *   the product's name   ("Product Name", "Item Name" - isProductNameField)
 *                        what the search box looks through
 *   an expiry date       ("Expiry Date", expiry_date - isExpiryDateField)
 *                        the only thing an expiry range filter can read;
 *                        without it there is no such filter
 *
 *   readCustomReport(rows, warehouseNames)   columns, rows and those two keys
 *   filterCustomReport(rows, filters)        the rows the filters leave
 */

import { displayValue, fieldLabel, isExpiryDateField, isProductNameField, isWithinDates, otherFields } from './productList'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value)
const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** The keys that are the row's own, not columns. */
const NOT_COLUMNS = ['id', 'warehouse']

/** A warehouse entry's keys the expansion shows by name - everything else follows. */
const WAREHOUSE_KEYS = ['id', 'warehouse_id', 'name', 'warehouse_name', 'level', 'shelf', 'rack_no', 'warehouse_quantity']

/** One stock line of a row - named by the reply, or by the company's list, or by its id. */
const readWarehouse = (warehouse, names) => {
  const id = warehouse.id ?? warehouse.warehouse_id ?? null
  const name = textOf(warehouse.name ?? warehouse.warehouse_name) || textOf(names?.[String(id)])

  return {
    label: name || (textOf(id) ? `Warehouse ${id}` : ''),
    level: warehouse.level,
    shelf: warehouse.shelf,
    rackNo: warehouse.rack_no,
    quantity: warehouse.warehouse_quantity,
    others: otherFields(warehouse, WAREHOUSE_KEYS),
  }
}

/**
 * THE REPORT, ready to draw:
 *
 *   columns     [{ key, label }] - every plain field, first-seen order
 *   rows        [{ key, source, warehouses, ...{ [column]: text } }] - each
 *               column's value as text, under the column's own key, so the
 *               list view can sort and search it as it is
 *   nameKey     the product-name column, or null
 *   expiryKey   the expiry-date column, or null
 *
 * `warehouseNames` is optional: { "<warehouse id>": "name" }.
 */
export const readCustomReport = (rows, warehouseNames = null) => {
  const list = (Array.isArray(rows) ? rows : []).filter(isPlainObject)

  const keys = []
  list.forEach((row) =>
    Object.entries(row).forEach(([key, value]) => {
      if (NOT_COLUMNS.includes(key) || keys.includes(key)) return
      if (value === null || value === undefined || isScalar(value)) keys.push(key)
    }),
  )
  // A key that is a list or an object in any row is not a column after all.
  const columnKeys = keys.filter((key) => list.every((row) => row[key] === null || row[key] === undefined || isScalar(row[key])))

  const taken = new Set()

  return {
    columns: columnKeys.map((key) => ({ key, label: fieldLabel(key) })),
    rows: list.map((row, index) => {
      const own = row.id ?? `row-${index}`
      const key = taken.has(own) ? `${own}-${index}` : own
      taken.add(key)

      return {
        ...Object.fromEntries(columnKeys.map((column) => [column, displayValue(row[column]) === '--' ? '' : displayValue(row[column])])),
        key,
        source: row,
        warehouses: (Array.isArray(row.warehouse) ? row.warehouse : [])
          .filter(isPlainObject)
          .map((warehouse) => readWarehouse(warehouse, warehouseNames)),
      }
    }),
    nameKey: columnKeys.find(isProductNameField) ?? null,
    expiryKey: columnKeys.find(isExpiryDateField) ?? null,
  }
}

/** Every warehouse the rows have stock in, by label, sorted - what the Warehouse filter offers. */
export const reportWarehouses = (rows) =>
  [...new Set(rows.flatMap((row) => row.warehouses.map((warehouse) => warehouse.label)).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  )

/**
 * The rows the filters leave - a new list, in the same order:
 *
 *   warehouse   a row with stock in that warehouse
 *   from, to    a row whose `expiryKey` column falls in the range (YYYY-MM-DD,
 *               either end open) - only with an expiry column at all
 */
export const filterCustomReport = (rows, { warehouse = '', from = '', to = '', expiryKey = null } = {}) =>
  rows.filter((row) => {
    if (warehouse && !row.warehouses.some((entry) => entry.label === warehouse)) return false
    if (expiryKey && (from || to) && !isWithinDates(row.source[expiryKey], from, to)) return false
    return true
  })

/**
 * INVENTORY ADJUSTMENTS - everything read from, and sent to, the two
 * endpoints (see inventoryService), with no React in it:
 *
 *   readAdjustments(reply)            the history, as the page shows it
 *   matchesAdjustmentFilters(...)     the history's Action / Reuse / date filters
 *   readAdjustmentStock(reply)        a product search - its SKUs, their entries
 *                                     (sr_no) and the stock in each warehouse
 *   lineKeyOf(productId, warehouseId) the one key a SKU's removal from a warehouse has
 *   newAdjustmentForm() / checkAdjustmentForm(form)   the form, and what is wrong with it
 *   buildAdjustmentBody(form, ...)    the form as the save takes it
 *   readSaveSummary(reply, lines)     the save's `updated`, named by the lines it came from
 *
 * A REMOVAL IS ONE SKU FROM ONE WAREHOUSE - its `product_id` (sku_variants[].
 * product_id; a product without SKUs has one, with sku_code "") and the
 * warehouse's id. A SKU's entries can each hold stock in the same warehouse,
 * so what can be removed is their warehouse_quantity together; the backend
 * says which entries it took it from (`removed`: sr_no and quantity).
 *
 * Anything missing is empty, never an error.
 */

import { toInputDate } from '@/Utils/date'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

const listOf = (value) => (Array.isArray(value) ? value : [])

const numberOf = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** A bare array today; `{ data: [...] }` or `{ results: [...] }` are read too. */
const toList = (reply) => {
  if (Array.isArray(reply)) return reply
  if (Array.isArray(reply?.data)) return reply.data
  if (Array.isArray(reply?.results)) return reply.results
  return []
}

/** The one key a SKU's removal from a warehouse has - in the form, the history and the save's answer. */
export const lineKeyOf = (productId, warehouseId) => `${text(productId)}|${text(warehouseId)}`

/* ------------------------------------------------------------------ */
/* The history                                                        */
/* ------------------------------------------------------------------ */

const readHistoryLine = (master, removed) => (entry, warehouse, index) => {
  const productId = entry.product_id ?? null
  const warehouseId = text(warehouse.id)
  return {
    key: `${lineKeyOf(productId, warehouseId)}#${index}`,
    productId,
    name: text(warehouse.item_name) || text(master.product),
    skuCode: text(warehouse.sku_code),
    hsn: text(warehouse.hsn),
    unit: text(warehouse.unit),
    warehouseId,
    warehouseName: text(warehouse.name),
    removeQty: text(warehouse.remove_qty ?? warehouse.qty),
    shelf: text(warehouse.shelf),
    level: text(warehouse.level),
    rackNo: text(warehouse.rack_no),
    address: text(warehouse.warehouse_address),
    // Where the backend took it from - the entries (sr_no) of this SKU in this warehouse.
    removed: removed
      .filter((taken) => text(taken.product_id) === text(productId) && text(taken.warehouse_id) === warehouseId)
      .map((taken) => ({ srNo: text(taken.sr_no), quantity: text(taken.quantity) })),
  }
}

export const readAdjustments = (reply) =>
  toList(reply)
    .filter(isObject)
    .map((record, index) => {
      const adjustment = isObject(record.inventory_adjustments) ? record.inventory_adjustments : {}
      const master = isObject(adjustment.master) ? adjustment.master : {}
      const removed = listOf(adjustment.removed).filter(isObject)
      const readLine = readHistoryLine(master, removed)
      let place = 0
      const lines = listOf(adjustment.payload)
        .filter(isObject)
        .flatMap((entry) => listOf(entry.warehouse).filter(isObject).map((warehouse) => readLine(entry, warehouse, place++)))
      return {
        key: record.id ?? `adjustment#${index}`,
        id: record.id ?? null,
        action: text(master.action),
        product: text(master.product) || lines[0]?.name || '',
        skuCode: text(master.sku_code),
        skuDetails: isObject(master.sku_details) ? master.sku_details : {},
        reuse: master.reuse === true,
        reuseText: master.reuse === true ? 'Yes' : 'No',
        totalPrice: text(master.unit_rate),
        docNo: text(master.doc_no),
        docType: text(master.doc_type),
        voucherType: text(master.voucher_type),
        reason: text(master.reason),
        lines,
        removedQty: lines.reduce((total, line) => total + numberOf(line.removeQty), 0),
        createdAt: text(record.created_at),
        // For sorting and the date filter - YYYY-MM-DD.
        createdInput: toInputDate(text(record.created_at)),
      }
    })

/** The history's filters: '' for not set; dates as YYYY-MM-DD; reuse 'yes' / 'no'. */
export const NO_ADJUSTMENT_FILTERS = Object.freeze({ action: '', reuse: '', fromDate: '', toDate: '' })

/**
 * Whether an adjustment passes every filter set - the history endpoint takes
 * nothing to filter by, so they run on the records already loaded. Dates by
 * the day it was created: From Date alone is "on or after", To Date alone
 * "on or before". One with no readable date passes only while no date is set.
 */
export const matchesAdjustmentFilters = (adjustment, { action, reuse, fromDate, toDate }) => {
  if (action && adjustment.action !== action) return false
  if (reuse && adjustment.reuse !== (reuse === 'yes')) return false
  if ((fromDate || toDate) && !adjustment.createdInput) return false
  if (fromDate && adjustment.createdInput < fromDate) return false
  if (toDate && adjustment.createdInput > toDate) return false
  return true
}

/* ------------------------------------------------------------------ */
/* A product search                                                   */
/* ------------------------------------------------------------------ */

const readStockWarehouse = (warehouse) => ({
  id: text(warehouse.id),
  name: text(warehouse.name),
  shelf: text(warehouse.shelf),
  level: text(warehouse.level),
  rackNo: text(warehouse.rack_no),
  quantity: numberOf(warehouse.warehouse_quantity ?? warehouse.qty),
})

const readEntry = (entry) => ({
  srNo: text(entry.sr_no),
  quantity: text(entry.Quantity),
  unitRate: text(entry['Unit Rate']),
  expiryDate: text(entry['Expiry Date']),
  skuDetails: isObject(entry.sku_details) ? entry.sku_details : {},
  warehouses: listOf(entry.warehouse).filter(isObject).map(readStockWarehouse),
})

/**
 * Each warehouse the SKU is in, once - its entries' stock there together.
 * Its place on the shelf and its rate are the first entry's that holds it.
 */
const warehousesOf = (entries) => {
  const found = new Map()
  entries.forEach((entry) =>
    entry.warehouses.forEach((warehouse) => {
      if (!warehouse.id) return
      const known = found.get(warehouse.id)
      if (known) {
        known.available += warehouse.quantity
        known.srNos.push(entry.srNo)
      } else {
        found.set(warehouse.id, { ...warehouse, available: warehouse.quantity, unitRate: entry.unitRate, srNos: [entry.srNo] })
      }
    }),
  )
  return [...found.values()]
}

/**
 * The search's products: [{ key, name, hsn, unit, gstRate, totalQty, skus:
 * [{ productId, skuCode, skuDetails, totalQty, totalAmount, entries,
 * warehouses: [{ id, name, shelf, level, rackNo, available, unitRate }] }] }].
 * A SKU without a product_id cannot be named in a save, so it is left out.
 */
export const readAdjustmentStock = (reply) =>
  toList(reply)
    .filter(isObject)
    .map((product, index) => {
      const skus = listOf(product.sku_variants)
        .filter((variant) => isObject(variant) && variant.deleted !== true && variant.product_id !== undefined && variant.product_id !== null)
        .map((variant) => {
          const entries = listOf(variant.product_details).filter((entry) => isObject(entry) && entry.deleted !== true).map(readEntry)
          const own = isObject(variant.sku_details) && Object.keys(variant.sku_details).length > 0 ? variant.sku_details : null
          return {
            productId: variant.product_id,
            skuCode: text(variant.sku_code),
            skuDetails: own ?? entries.find((entry) => Object.keys(entry.skuDetails).length > 0)?.skuDetails ?? {},
            totalQty: text(variant.total_qty),
            totalAmount: text(variant.total_amount),
            entries,
            warehouses: warehousesOf(entries),
          }
        })
      return {
        key: `${text(product['Product Name']) || 'product'}#${index}`,
        name: text(product['Product Name']),
        hsn: text(product['HSN Code']),
        unit: text(product['Per Unit']),
        gstRate: text(product['GST Rate']),
        totalQty: text(product.total_qty),
        skus,
      }
    })

/* ------------------------------------------------------------------ */
/* The form                                                           */
/* ------------------------------------------------------------------ */

export const newAdjustmentForm = () => ({
  action: '',
  reuse: false,
  totalPrice: '',
  docNo: '',
  docType: '',
  voucherType: '',
  reason: '',
  // [{ key, productId, name, skuCode, skuDetails, hsn, unit, unitRate,
  //    warehouseId, warehouseName, shelf, level, rackNo, available, removeQty }]
  lines: [],
})

/**
 * Everything wrong with the form, by field ('lines.<key>' for a line's
 * quantity) - {} when it can be saved. A quantity must be above 0 and no
 * more than the warehouse holds.
 */
export const checkAdjustmentForm = (form, { product }) => {
  const found = {}
  if (!text(form.action)) found.action = 'Select the action'
  if (!text(product)) found.product = 'Select the product'
  if (form.reuse && text(form.totalPrice) && !(Number(form.totalPrice) >= 0)) found.totalPrice = 'Enter a valid total price'
  if (form.lines.length === 0) found.lines = 'Enter the quantity to remove from at least one warehouse'
  form.lines.forEach((line) => {
    const quantity = Number(line.removeQty)
    if (!text(line.removeQty) || !Number.isFinite(quantity) || quantity <= 0) found[`lines.${line.key}`] = 'Enter a quantity above 0'
    else if (quantity > line.available) found[`lines.${line.key}`] = `Only ${line.available} in this warehouse`
  })
  return found
}

/** A rate as a number where it is one - what the save has been sent. */
const rateOf = (value) => (text(value) && Number.isFinite(Number(value)) ? Number(value) : text(value))

/**
 * The form as POST inventory/update_inventory/ takes it: the lines grouped
 * by their SKU (product_id), one entry per warehouse - each once, as the
 * form keeps it - and the master. `product` / `skuCode` are what was
 * searched; `warehouseDetails(id)` the warehouse's own { address, email }.
 */
export const buildAdjustmentBody = (form, { companyName, product, skuCode, warehouseDetails }) => {
  const byProduct = new Map()
  form.lines.forEach((line) => {
    const details = warehouseDetails(line.warehouseId)
    const quantity = Number(line.removeQty)
    const group = byProduct.get(String(line.productId)) ?? { product_id: line.productId, warehouse: [] }
    group.warehouse.push({
      id: line.warehouseId,
      sku_code: line.skuCode,
      item_name: line.name,
      hsn: line.hsn,
      unit: line.unit,
      unit_rate: rateOf(line.unitRate),
      name: line.warehouseName,
      remove_qty: quantity,
      shelf: line.shelf,
      level: line.level,
      rack_no: line.rackNo,
      warehouse_address: details.address,
      email: details.email,
      qty: quantity,
    })
    byProduct.set(String(line.productId), group)
  })
  return {
    company_name: companyName,
    warehouse: [...byProduct.values()],
    master: {
      action: text(form.action),
      product: text(product),
      unit_rate: form.reuse ? text(form.totalPrice) : '',
      reuse: form.reuse,
      doc_no: text(form.docNo),
      doc_type: form.docType,
      voucher_type: form.voucherType,
      sku_code: text(skuCode),
      reason: text(form.reason),
    },
  }
}

/** The save's `updated` - one row per SKU and warehouse - named by the line it came from. */
export const readSaveSummary = (reply, lines) => {
  const byKey = new Map(lines.map((line) => [lineKeyOf(line.productId, line.warehouseId), line]))
  return listOf(reply?.updated)
    .filter(isObject)
    .map((row, index) => {
      const line = byKey.get(lineKeyOf(row.product_id, row.warehouse_id))
      return {
        key: `${lineKeyOf(row.product_id, row.warehouse_id)}#${index}`,
        name: line?.name ?? '',
        skuCode: text(row.sku_code) || line?.skuCode || '',
        warehouse: line?.warehouseName || text(row.warehouse_id),
        oldQty: text(row.old_qty),
        removedQty: text(row.removed_qty),
        newQty: text(row.new_qty),
      }
    })
}

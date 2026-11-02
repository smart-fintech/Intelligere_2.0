/**
 * INVENTORY ADJUSTMENTS - everything read from, and sent to, the two
 * endpoints (see inventoryService), with no React in it:
 *
 *   readAdjustments(reply)            the history, as the page shows it
 *   matchesAdjustmentFilters(...)     the history's Action / Reuse / date filters
 *   readStockRows(reply)              a product search, as the rows of its table - one
 *                                     per warehouse of each entry (sr_no) of each SKU
 *   removeQtyProblem(qty, available)  what is wrong with a Remove Qty - '' when nothing
 *   lineKeyOf(productId, warehouseId) what the history and a save's answer name a removal by
 *   newAdjustmentForm() / checkAdjustmentForm(form)   the form, and what is wrong with it
 *   buildAdjustmentBody(form, ...)    the form as the save takes it
 *   readSaveSummary(reply, lines)     the save's `updated`, named by the lines it came from
 *
 * ON SCREEN A ROW IS ONE WAREHOUSE OF ONE ENTRY - held to that record's own
 * warehouse_quantity, and never added to another's. IN THE SAVE A REMOVAL IS
 * ONE SKU FROM ONE WAREHOUSE - its `product_id` (sku_variants[].product_id; a
 * product without SKUs has one, with sku_code "") and the warehouse's id, with
 * no sr_no: rows of one SKU and warehouse go up as one entry, their quantities
 * together, and the backend says which entries it took them from (`removed`).
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

/** What a SKU's removal from a warehouse is named by - in the history and the save's answer. */
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

/** A list, or - when it is empty - one empty place, so a record with nothing under it still has its row. */
const orOneEmpty = (list) => (list.length > 0 ? list : [null])

const hasValues = (details) => isObject(details) && Object.values(details).some((value) => text(value) !== '')

/**
 * The search's table: every product, SKU, entry and warehouse, nothing added
 * up - [{ key, productKey, productId, name, skuCode, skuDetails, hsn, unit,
 * srNo, entryQuantity, expiryDate, createdAt, unitRate, warehouseId,
 * warehouseName, quantity, available, shelf, level, rackNo, address, canRemove }].
 *
 * `key` is the row's own, the same for the same record in a later search: its
 * product_id, sr_no and warehouse with its place in it (a warehouse can come
 * twice in an entry, on two racks). `canRemove` needs a product_id, a
 * warehouse and stock in it - what a save has to name. The reply is not changed.
 */
export const readStockRows = (reply) => {
  const seen = new Map()
  const uniqueKey = (key) => {
    const times = seen.get(key) ?? 0
    seen.set(key, times + 1)
    return times === 0 ? key : `${key}#${times}`
  }

  return toList(reply)
    .filter(isObject)
    .flatMap((product, productIndex) => {
      const name = text(product['Product Name'])
      const variants = listOf(product.sku_variants).filter((variant) => isObject(variant) && variant.deleted !== true)
      return orOneEmpty(variants).flatMap((variant) => {
        const productId = variant?.product_id ?? null
        const skuCode = text(variant?.sku_code)
        const entries = listOf(variant?.product_details).filter((entry) => isObject(entry) && entry.deleted !== true)
        return orOneEmpty(entries).flatMap((entry, entryIndex) => {
          const srNo = text(entry?.sr_no)
          const warehouses = listOf(entry?.warehouse).filter(isObject)
          return orOneEmpty(warehouses).map((warehouse) => {
            const warehouseId = text(warehouse?.id)
            const shelf = text(warehouse?.shelf)
            const level = text(warehouse?.level)
            const rackNo = text(warehouse?.rack_no)
            const quantity = text(warehouse?.warehouse_quantity)
            const available = numberOf(warehouse?.warehouse_quantity)
            const owner = productId ?? `${name}/${skuCode}`
            return {
              key: uniqueKey([owner, srNo || `entry-${entryIndex}`, warehouseId, shelf, level, rackNo].join('|')),
              productKey: `${name}#${productIndex}`,
              productId,
              name,
              skuCode,
              skuDetails: hasValues(entry?.sku_details) ? entry.sku_details : hasValues(variant?.sku_details) ? variant.sku_details : {},
              hsn: text(product['HSN Code']),
              unit: text(product['Per Unit']),
              srNo,
              entryQuantity: text(entry?.Quantity),
              expiryDate: text(entry?.['Expiry Date']),
              createdAt: text(entry?.created_at),
              unitRate: text(entry?.['Unit Rate']),
              warehouseId,
              warehouseName: text(warehouse?.name),
              quantity,
              available,
              shelf,
              level,
              rackNo,
              address: text(warehouse?.warehouse_address),
              canRemove: productId !== null && warehouseId !== '' && available > 0,
            }
          })
        })
      })
    })
}

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
  // The rows ticked (readStockRows), each with its removeQty.
  lines: [],
})

/** What is wrong with a Remove Qty against a row's stock - '' when nothing, and when it is empty (no removal). */
export const removeQtyProblem = (removeQty, available) => {
  if (text(removeQty) === '') return ''
  const quantity = Number(removeQty)
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Enter a quantity above 0'
  if (quantity > available) return `Only ${available} available`
  return ''
}

/**
 * Everything wrong with the form, by field ('lines.<key>' for a line's
 * quantity) - {} when it can be saved. A ticked row must have a quantity,
 * above 0 and no more than that row's warehouse_quantity.
 */
export const checkAdjustmentForm = (form, { product }) => {
  const found = {}
  if (!text(form.action)) found.action = 'Select the action'
  if (!text(product)) found.product = 'Select the product'
  if (form.reuse && text(form.totalPrice) && !(Number(form.totalPrice) >= 0)) found.totalPrice = 'Enter a valid total price'
  if (form.lines.length === 0) found.lines = 'Tick at least one row and enter its Remove Qty'
  form.lines.forEach((line) => {
    const problem = text(line.removeQty) === '' ? 'Enter a quantity above 0' : removeQtyProblem(line.removeQty, line.available)
    if (problem) found[`lines.${line.key}`] = problem
  })
  return found
}

/** A rate as a number where it is one - what the save has been sent. */
const rateOf = (value) => (text(value) && Number.isFinite(Number(value)) ? Number(value) : text(value))

/**
 * The form as POST inventory/update_inventory/ takes it: the lines grouped
 * by their SKU (product_id), one entry per warehouse - rows of the same SKU
 * and warehouse (two entries, two racks) as one, their quantities together,
 * the first's rate and place standing for them - and the master. `product` /
 * `skuCode` are what was searched; `warehouseDetails(id)` the warehouse's own
 * { address, email }.
 */
export const buildAdjustmentBody = (form, { companyName, product, skuCode, warehouseDetails }) => {
  const byProduct = new Map()
  form.lines.forEach((line) => {
    const details = warehouseDetails(line.warehouseId)
    const quantity = Number(line.removeQty)
    const group = byProduct.get(String(line.productId)) ?? { product_id: line.productId, warehouse: [] }
    byProduct.set(String(line.productId), group)
    const known = group.warehouse.find((entry) => entry.id === line.warehouseId)
    if (known) {
      known.remove_qty += quantity
      known.qty += quantity
      return
    }
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
      warehouse_address: line.address || details.address,
      email: details.email,
      qty: quantity,
    })
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

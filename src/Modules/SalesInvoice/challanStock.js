/**
 * A CHALLAN'S STOCK, TAKEN OUT OF THE WAREHOUSES - before a Challan with no
 * Prefill From is saved, for a company with Inventory Management
 * (inventory/SKUWarehouseSummaryAPI/ - Services/inventoryBookingService), with
 * no screen attached:
 *
 *   needsChallanStock({ documentType, inventory, editing, prefilled, savedStock })
 *       a NEW Challan, Inventory Management, nothing in Prefill From (neither a
 *       Sales Order - its booking is the order's - nor a Proforma); or a saved
 *       Challan being edited whose record has a skuWarehouseSummary (savedStock)
 *   buildStockSummaryRequest({ companyName, lines, productsByKey })
 *       -> { body, items }   the POST - each product line under the backend's
 *       names: SKU-managed `quantity`, otherwise `order_qty` with sku_code "";
 *       `items` each line's product and its SKU's product_id (what the body taken out names)
 *   readStockSummary(reply, items)
 *       -> [{ key, productId, productName, skuCode, skuDetails, orderQty, warehouses:
 *            [{ id, name, qty, booked, free, bookings: [{ soNo, qty, buyerName, date }] }] }]
 *       - [] when the reply has nothing to take ({ msg })
 *   readSavedStockSummary(value), withSavedStock(rows, saved)   editing - the
 *       saved skuWarehouseSummary, and the summary with it counted back in
 *   checkStockRemoval(rows, entered)   what is wrong - { cells, items }
 *   buildStockUpdateBody({ companyName, rows, entered })   what is taken out - the body once PUT
 *       to inventory/SKUWarehouseSummaryAPI/, now sent whole as the Challan's skuWarehouseSummary
 *
 * `entered`: { "<row>|<warehouse id>": "3", "<row>|<warehouse id>|<so no>": "5" } - as typed.
 *
 * THE RULES (the earlier Challan screen's): a product's stock comes out of a
 * warehouse's free stock (Qty - total booked) and/or out of the Sales Orders
 * booked there - never more than an order booked, never more than is free -
 * and everything taken adds up to the product's order quantity exactly.
 * `manage_qty` decides none of it.
 */

import { DOCUMENT_TYPE_CHALLAN } from '@/Constants/salesInvoice'
import { isServiceLine, isSkuManaged, lineVariant, textOf } from '@/Modules/SalesInvoice/salesInvoiceForm'

const numberOf = (value) => {
  const number = Number(value)
  return textOf(value) !== '' && Number.isFinite(number) ? number : null
}
const tidy = (value) => String(Number(value.toFixed(3)))
const listOf = (value) => (Array.isArray(value) ? value : [])
// The backend sends some keys with a space after them ("document_no ") - read either way.
const field = (object, name) => object?.[name] ?? object?.[`${name} `]

export const needsChallanStock = ({ documentType, inventory, editing, prefilled, savedStock = null }) =>
  documentType === DOCUMENT_TYPE_CHALLAN && Boolean(inventory) && (editing ? Boolean(savedStock) : !prefilled)

export const buildStockSummaryRequest = ({ companyName, lines, productsByKey }) => {
  const items = []
  const body = []
  lines
    .filter((line) => !isServiceLine(line) && line.productKey)
    .forEach((line) => {
      const product = productsByKey.get(line.productKey) ?? null
      const variant = lineVariant(product, line)
      if (!product || !variant) return
      const quantity = numberOf(line.quantity) ?? 0
      const managed = isSkuManaged(product)
      const skuCode = managed ? textOf(variant.skuCode) : ''
      items.push({ key: String(line.id), productId: variant.productId ?? null, productName: textOf(product.name), skuCode })
      body.push({
        company_name: textOf(companyName),
        product_name: textOf(product.name),
        hsn_code: textOf(line.hsn),
        ...(managed ? { quantity } : { order_qty: quantity }),
        sku_code: skuCode,
      })
    })
  return { body, items }
}

/** Its line - by SKU code when it has one, else by name; each line once. */
const lineOf = (row, items, taken) => {
  const code = textOf(row.sku_code)
  const name = textOf(row.Products ?? row.product_name).toLowerCase()
  return items.find((item) => !taken.has(item.key) && (code ? item.skuCode === code : !item.skuCode && item.productName.toLowerCase() === name)) ?? null
}

export const readStockSummary = (reply, items) => {
  // [[rows], ...] or [rows] - any other answer ({ msg }) has nothing to take.
  const rows = listOf(reply).flat().filter((row) => row && typeof row === 'object')
  const taken = new Set()
  return rows.map((row, index) => {
    const item = lineOf(row, items, taken)
    if (item) taken.add(item.key)
    return {
      key: item?.key ?? `row-${index}`,
      productId: item?.productId ?? null,
      productName: textOf(row.Products ?? row.product_name) || item?.productName || '',
      skuCode: textOf(row.sku_code),
      skuDetails: row.sku_details && typeof row.sku_details === 'object' ? row.sku_details : {},
      orderQty: numberOf(row.order_qty ?? row.quantity) ?? 0,
      warehouses: listOf(row.warehouse)
        .filter((warehouse) => warehouse && typeof warehouse === 'object')
        .map((warehouse) => {
          const qty = numberOf(warehouse.Qty) ?? 0
          const booked = numberOf(warehouse.total_booked_qty) ?? 0
          return {
            id: textOf(warehouse.id),
            name: textOf(warehouse.warehouse_name) || `Warehouse ${textOf(warehouse.id)}`,
            qty,
            booked,
            free: Math.max(0, qty - booked),
            bookings: listOf(warehouse.so_booked_qty)
              .filter((so) => so && typeof so === 'object')
              .map((so) => ({
                soNo: textOf(field(so, 'document_no') ?? field(so, 'so_no')),
                qty: numberOf(so.qty) ?? 0,
                buyerName: textOf(field(so, 'buyer_name')),
                date: textOf(field(so, 'document_date') ?? field(so, 'doc_date')),
              })),
          }
        }),
    }
  })
}

export const warehouseKey = (row, warehouse) => `${row.key}|${warehouse.id}`
export const bookingKey = (row, warehouse, booking) => `${row.key}|${warehouse.id}|${booking.soNo}`

/** A typed amount - 0 for nothing typed, null for something that is not a number. */
const typed = (entered, key) => (textOf(entered[key]) === '' ? 0 : numberOf(entered[key]))

/** Everything taken for a product, over its warehouses and their orders (anything not a number counts as nothing). */
export const totalRemoved = (row, entered) =>
  row.warehouses.reduce(
    (sum, warehouse) =>
      sum + Math.max(0, typed(entered, warehouseKey(row, warehouse)) ?? 0) + warehouse.bookings.reduce((inner, booking) => inner + Math.max(0, typed(entered, bookingKey(row, warehouse, booking)) ?? 0), 0),
    0,
  )

export const checkStockRemoval = (rows, entered) => {
  const cells = {}
  const itemErrors = {}
  rows.forEach((row) => {
    if (row.productId === null) {
      itemErrors[row.key] = 'Not in the product list - it cannot be taken out of stock.'
      return
    }
    if (row.warehouses.length === 0) {
      itemErrors[row.key] = 'No warehouse holds this product.'
      return
    }
    row.warehouses.forEach((warehouse) => {
      const key = warehouseKey(row, warehouse)
      const direct = typed(entered, key)
      if (direct === null) cells[key] = 'Numbers only'
      else if (direct < 0) cells[key] = 'Not below 0'
      else if (direct > warehouse.free + 1e-9) cells[key] = `Only ${tidy(warehouse.free)} free`
      warehouse.bookings.forEach((booking) => {
        const soKey = bookingKey(row, warehouse, booking)
        const value = typed(entered, soKey)
        if (value === null) cells[soKey] = 'Numbers only'
        else if (value < 0) cells[soKey] = 'Not below 0'
        else if (value > booking.qty + 1e-9) cells[soKey] = `Not more than its ${tidy(booking.qty)} booked`
      })
    })
    const total = totalRemoved(row, entered)
    if (Math.abs(total - row.orderQty) > 1e-9) itemErrors[row.key] = `Take out exactly ${tidy(row.orderQty)} - ${tidy(total)} so far`
  })
  return { cells, items: itemErrors }
}

export const hasStockProblems = (problems) => Object.keys(problems.cells).length > 0 || Object.keys(problems.items).length > 0

/** A saved Challan's skuWarehouseSummary (JSON text or the object) - null when it has none. */
export const readSavedStockSummary = (value) => {
  let summary = value
  if (typeof value === 'string') {
    if (!value.trim()) return null
    try {
      summary = JSON.parse(value)
    } catch {
      return null
    }
  }
  return summary && typeof summary === 'object' && Array.isArray(summary.product) ? summary : null
}

/**
 * EDITING A SAVED CHALLAN - the stock summary with what the Challan already took
 * out (its saved skuWarehouseSummary) counted as there again: each warehouse's
 * free stock and each order's booking get its remove_qty back (the summary no
 * longer has them), and `entered` starts with those quantities - so the same
 * allocation, or less of it, is always allowed. A warehouse or booking the
 * summary no longer lists comes back with just what the Challan took. Each
 * saved product goes to the first row of the same product_id.
 *
 *   withSavedStock(rows, saved) -> { rows, entered }
 */
export const withSavedStock = (rows, saved) => {
  const next = rows.map((row) => ({ ...row, warehouses: row.warehouses.map((warehouse) => ({ ...warehouse, bookings: warehouse.bookings.map((booking) => ({ ...booking })) })) }))
  const entered = {}
  const used = new Set()
  listOf(saved?.product).forEach((product) => {
    const row = next.find((candidate) => !used.has(candidate.key) && candidate.productId !== null && String(candidate.productId) === textOf(product?.document_id))
    if (!row) return
    used.add(row.key)
    listOf(product.warehouse).forEach((savedWarehouse) => {
      const id = textOf(savedWarehouse?.id)
      if (!id) return
      let warehouse = row.warehouses.find((candidate) => candidate.id === id)
      if (!warehouse) {
        warehouse = { id, name: `Warehouse ${id}`, qty: 0, booked: 0, free: 0, bookings: [] }
        row.warehouses.push(warehouse)
      }
      const direct = Math.max(0, numberOf(savedWarehouse.remove_qty) ?? 0)
      if (direct > 0) {
        warehouse.free += direct
        entered[warehouseKey(row, warehouse)] = tidy(direct)
      }
      listOf(savedWarehouse.so_booked_qty).forEach((savedBooking) => {
        const soNo = textOf(savedBooking?.so_no)
        const taken = Math.max(0, numberOf(savedBooking?.remove_qty) ?? 0)
        if (!soNo || taken <= 0) return
        let booking = warehouse.bookings.find((candidate) => candidate.soNo === soNo)
        if (!booking) {
          booking = { soNo, qty: 0, buyerName: '', date: '' }
          warehouse.bookings.push(booking)
        }
        booking.qty += taken
        entered[bookingKey(row, warehouse, booking)] = tidy(taken)
      })
    })
  })
  return { rows: next, entered }
}

/** The PUT - each product's warehouses it takes from, an order's booking only when something comes out of it. */
export const buildStockUpdateBody = ({ companyName, rows, entered }) => ({
  company_name: textOf(companyName),
  product: rows
    .map((row) => ({
      document_id: row.productId,
      warehouse: row.warehouses
        .map((warehouse) => {
          const bookings = warehouse.bookings
            .map((booking) => ({ so_no: booking.soNo, qty: booking.qty, remove_qty: typed(entered, bookingKey(row, warehouse, booking)) ?? 0 }))
            .filter((booking) => booking.remove_qty > 0)
          const direct = typed(entered, warehouseKey(row, warehouse)) ?? 0
          return { id: warehouse.id, remove_qty: direct, ...(bookings.length > 0 ? { so_booked_qty: bookings } : {}) }
        })
        .filter((warehouse) => warehouse.remove_qty > 0 || warehouse.so_booked_qty),
    }))
    .filter((product) => product.warehouse.length > 0),
})

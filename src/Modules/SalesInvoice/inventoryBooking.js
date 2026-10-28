/**
 * A SALES ORDER'S INVENTORY BOOKING - the stock its products are booked from,
 * once the order is saved (inventory/inventory_booking/), with no screen attached:
 *
 *   bookingItemsOf({ lines, productsByKey, warehouses })   each product line and the
 *       warehouses that hold its SKU: [{ key, productName, skuCode, orderQty,
 *       warehouses: [{ id, name, contact, available }] }]
 *   checkBooking(items, booked)       what is wrong - {} when it can be sent
 *   automaticBooking(items)           the booking itself, when there is nothing to choose
 *   buildBookingBody({ companyName, documentId, items, booked })   the request
 *
 * `booked` is what was typed: { [item key]: { [warehouse id]: "12" } }.
 *
 * THE RULE (as agreed): a product whose SKU is in a warehouse is booked for
 * its WHOLE order quantity - the warehouses' booked quantities add up to it,
 * never more, never less. A warehouse's booking is held to the order quantity,
 * not to its own stock: booking past its stock shows as a negative Remaining
 * (the shortfall). A product no warehouse holds has nothing to book.
 *
 * Where the stock is: the product list (inventory/product/) - each SKU's
 * entries' warehouse allocations, added up per warehouse; the company's
 * warehouse list (inventory/warehouse_create/) names a bare id and gives the
 * contact number.
 */

import { isServiceLine, lineVariant, textOf } from '@/Modules/SalesInvoice/salesInvoiceForm'

const numberOf = (value) => {
  const number = Number(value)
  return textOf(value) !== '' && Number.isFinite(number) ? number : null
}
const sum = (values) => values.reduce((total, value) => total + value, 0)
/** Whole quantities as "12", others as typed would be - "2.5". */
const quantityText = (value) => String(Number(value.toFixed(3)))

/**
 * @param lines          the order's lines (form.lines)
 * @param productsByKey  Map of the product list's products (readProducts)
 * @param warehouses     the company's warehouse records - [{ warehouse_obj_id, warehouse_name, contact }]
 */
export const bookingItemsOf = ({ lines, productsByKey, warehouses = [] }) => {
  const byId = new Map(warehouses.map((record) => [textOf(record.warehouse_obj_id ?? record.id), record]))
  return lines
    .filter((line) => !isServiceLine(line))
    .map((line) => {
      const product = productsByKey.get(line.productKey) ?? null
      const variant = lineVariant(product, line)
      // The SKU's stock, warehouse by warehouse, over all its entries.
      const stock = new Map()
      ;(variant?.details ?? []).forEach((detail) =>
        detail.warehouses.forEach((allocation) => {
          const id = textOf(allocation.id)
          if (!id) return
          const entry = stock.get(id) ?? { id, name: allocation.name, available: 0 }
          entry.available += numberOf(allocation.quantity) ?? 0
          if (!entry.name && allocation.name) entry.name = allocation.name
          stock.set(id, entry)
        }),
      )
      return {
        key: String(line.id),
        productName: textOf(product?.name),
        skuCode: textOf(variant?.skuCode),
        orderQty: numberOf(line.quantity) ?? 0,
        // Only where the SKU is - a warehouse with none of it is not one to book from.
        warehouses: [...stock.values()]
          .filter((entry) => entry.available > 0)
          .map((entry) => {
            const record = byId.get(entry.id)
            return {
              id: entry.id,
              name: entry.name || textOf(record?.warehouse_name) || `Warehouse ${entry.id}`,
              contact: textOf(record?.contact),
              available: entry.available,
            }
          }),
      }
    })
}

/** What one warehouse's booked text is, as a number - null for nothing typed. */
export const bookedOf = (booked, itemKey, warehouseId) => numberOf(booked?.[itemKey]?.[warehouseId])

/** How much a product has booked, over its warehouses (anything not a number counts as nothing). */
export const totalBooked = (item, booked) => sum(item.warehouses.map((warehouse) => Math.max(0, bookedOf(booked, item.key, warehouse.id) ?? 0)))

/**
 * What is wrong - { cells: { "<item>:<warehouse>": message }, items: { <item>: message } };
 * both empty when it can be sent.
 */
export const checkBooking = (items, booked) => {
  const cells = {}
  const itemErrors = {}
  items.forEach((item) => {
    if (item.warehouses.length === 0) return
    item.warehouses.forEach((warehouse) => {
      const raw = textOf(booked?.[item.key]?.[warehouse.id])
      if (raw === '') return
      const value = numberOf(raw)
      if (value === null) cells[`${item.key}:${warehouse.id}`] = 'Numbers only'
      else if (value < 0) cells[`${item.key}:${warehouse.id}`] = 'Not below 0'
      else if (value > item.orderQty) cells[`${item.key}:${warehouse.id}`] = `Not more than the order's ${quantityText(item.orderQty)}`
    })
    const total = totalBooked(item, booked)
    if (total > item.orderQty + 1e-9) itemErrors[item.key] = `${quantityText(total)} booked - more than the order's ${quantityText(item.orderQty)}`
    else if (total < item.orderQty - 1e-9) itemErrors[item.key] = `Book all ${quantityText(item.orderQty)} - ${quantityText(total)} booked so far`
  })
  return { cells, items: itemErrors }
}

export const hasBookingProblems = (problems) => Object.keys(problems.cells).length > 0 || Object.keys(problems.items).length > 0

/**
 * The booking there is nothing to choose in - every product held in one
 * warehouse at most, so each one held is booked whole from it - or null when
 * a product has warehouses to choose from, none is held anywhere, or the
 * booking does not check out (checkBooking). Same shape as `booked`.
 */
export const automaticBooking = (items) => {
  if (items.some((item) => item.warehouses.length > 1)) return null
  const held = items.filter((item) => item.warehouses.length === 1)
  if (held.length === 0) return null
  const booked = Object.fromEntries(held.map((item) => [item.key, { [item.warehouses[0].id]: quantityText(item.orderQty) }]))
  return hasBookingProblems(checkBooking(items, booked)) ? null : booked
}

/**
 * The booking request - each product that books anything, with the warehouses
 * it books from (only those with a quantity above 0), under the backend's names:
 *   { company_name, document_id, products: [{ "Product Name", sku_code, quantity, warehouse: [{ id, book_qty }] }] }
 */
export const buildBookingBody = ({ companyName, documentId, items, booked }) => ({
  company_name: textOf(companyName),
  document_id: documentId,
  products: items
    .map((item) => ({
      'Product Name': item.productName,
      sku_code: item.skuCode,
      quantity: quantityText(item.orderQty),
      warehouse: item.warehouses
        .map((warehouse) => ({ id: warehouse.id, value: bookedOf(booked, item.key, warehouse.id) }))
        .filter((entry) => entry.value !== null && entry.value > 0)
        .map((entry) => ({ id: entry.id, book_qty: quantityText(entry.value) })),
    }))
    .filter((product) => product.warehouse.length > 0),
})

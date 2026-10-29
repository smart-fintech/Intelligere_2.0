/**
 * A PURCHASE'S STOCK, BOOKED INTO WAREHOUSES - the product form (ProductFormModal's
 * `booking`) filled for one line of a saved Purchase Invoice or Inbound Challan,
 * with no screen attached:
 *
 *   prefillStockBooking(steps, { product, variant, quantity, rate })
 *       the form as Add Existing Product fills it for that product and SKU
 *       (prefillProductForm - the same fields, the same values), except:
 *         Quantity, Unit Rate   the purchase line's - the stock received
 *         warehouse lines       none of the product's saved ones: the warehouse
 *                               is always the user's to choose
 *       -> { values, skuValues, hasSkus }
 *
 *   stockBookingError({ allocations, quantity })
 *       what keeps the booking from being saved - every unit received in a
 *       warehouse: at least one line, and the lines adding up to the Quantity
 *       (each line's own checks - a warehouse chosen - are the form's usual
 *       ones). undefined when it can be saved.
 */

import { perSkuFieldRank } from '@/Constants/inventory'
import { allocatedQuantity, prefillProductForm, PRODUCT_GROUP, productFieldName, skuGroupOf, tidyQuantity } from './productForm'
import { productEditSource } from './productList'

// Their places in PRODUCT_PER_SKU_FIELDS - Quantity, Expiry Date, Unit Rate.
const QUANTITY_RANK = 0
const UNIT_RATE_RANK = 2

export const prefillStockBooking = (steps, { product, variant, quantity, rate }) => {
  const filled = prefillProductForm(steps, productEditSource(product, variant))
  const values = { ...filled.values }
  const skuValues = { ...filled.skuValues }
  const fromLine = { [QUANTITY_RANK]: quantity, [UNIT_RATE_RANK]: rate }

  steps.forEach((step) =>
    step.groups.forEach((group) => {
      const sku = group.key === PRODUCT_GROUP.SKU
      ;(sku ? group.detailFields : group.fields).forEach((field) => {
        const name = productFieldName(field)
        const value = fromLine[perSkuFieldRank(name)]
        if (value === undefined || String(value).trim() === '') return
        if (sku) skuValues[name] = String(value).trim()
        else values[name] = String(value).trim()
      })
    }),
  )

  return { values, skuValues, hasSkus: Boolean(skuGroupOf(steps)) }
}

export const stockBookingError = ({ allocations, quantity }) => {
  if (allocations.length === 0) return 'Add the warehouse this stock goes to.'
  if (!quantity.exists || quantity.value === null) return undefined
  const total = allocatedQuantity(allocations)
  if (Math.abs(total - quantity.value) > 1e-9) {
    return `Book all ${tidyQuantity(quantity.value)} into warehouses - ${tidyQuantity(total)} booked so far.`
  }
  return undefined
}

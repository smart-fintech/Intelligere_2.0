/**
 * A SKU'S `sku_details` - read from one entry of a product's `sku_variants`,
 * exactly as the product APIs send it (inventory/product/,
 * inventory/expired_products/ ...). No screen attached, no field named:
 *
 *   skuAttributes(variant)        [{ name, value }] - its sku_details, as text
 *   skuCodeLabel(variant, index)  how it is called in a list
 *
 * ONLY `sku_details` - never anything else the SKU record carries (its ids,
 * stock, rates, dates, warehouses ...). They are the SKU's own `sku_details`;
 * a SKU listed without them is read from the `sku_details` of its first live
 * `product_details` entry, which is where a product is SAVED with them - the
 * same dictionary, never another one.
 *
 * A detail with no value (null, '', only spaces) is left out; a yes/no is
 * Yes or No. Nothing here invents a detail or a value.
 */

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** A value as text - '' for nothing, or for anything that is not a plain value. */
const asText = (value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim()
  return ''
}

const filled = (object) => (isPlainObject(object) && Object.keys(object).length > 0 ? object : null)

export const skuAttributes = (variant) => {
  if (!isPlainObject(variant)) return []

  const entries = (Array.isArray(variant.product_details) ? variant.product_details : []).filter(
    (detail) => isPlainObject(detail) && detail.deleted !== true,
  )
  const details = filled(variant.sku_details) ?? entries.map((detail) => filled(detail.sku_details)).find(Boolean) ?? {}

  return Object.entries(details)
    .map(([name, value]) => ({ name, value: asText(value) }))
    .filter(({ value }) => value)
}

/** A SKU as a list names it: its code, or its place when it has none. */
export const skuCodeLabel = (variant, index) => asText(variant?.sku_code) || `SKU ${index + 1} (no code)`

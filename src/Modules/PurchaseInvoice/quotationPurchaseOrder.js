/**
 * RAISE A PO - a vendor's quotation (one vendor of inventory/compare_quotation/)
 * as a new Outbound Purchase Order, in the shape of a saved document, so the
 * workspace fills it in exactly as it does a Prefill From (formPrefilledFrom):
 *
 *   purchaseOrderFromQuotation({ documentNo, quotation }, { ledgers, products })
 *     -> { record, vendorName, ledgerFound, unmatched }
 *
 *   the seller       the ledger named as the quotation's vendor
 *                    (master_details.vendor_name, else vendor_details.name) -
 *                    none found, it is left to choose (`ledgerFound` false)
 *   Reference No.    "<SO number> / <quotation no.>"
 *   Reference Date   the quotation's date
 *   each line        the quoted product (Description) found in the product
 *                    list by name and SKU code; its quantity, HSN, unit and
 *                    GST; its rate the unit rate LESS the line's discount
 *                    (the order has no discount column); its description the
 *                    SKU's details ("Size:4x9 , Color:Red")
 *
 * Nothing else of the quotation is taken. A product not in the list leaves
 * its line without one, for the user to choose (`unmatched`).
 */

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

const sameText = (a, b) => text(a).toLowerCase() === text(b).toLowerCase()

const numberOf = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** The quoted rate less its discount %, to the paisa. */
const netRate = (item) => {
  const rate = numberOf(item.unit_rate)
  return String(Number((rate - rate * (numberOf(item.discount) / 100)).toFixed(2)))
}

/** A SKU's details as the order line's description - as the earlier screen wrote it. */
const descriptionOf = (skuDetails) =>
  Object.entries(skuDetails && typeof skuDetails === 'object' ? skuDetails : {})
    .filter(([key, value]) => !['Item Name', 'Quantity'].includes(key) && text(value) !== '')
    .map(([key, value]) => `${key}:${text(value)}`)
    .join(' , ')

export const purchaseOrderFromQuotation = ({ documentNo, quotation }, { ledgers, products }) => {
  const master = quotation?.master_details ?? {}
  const vendorName = text(master.vendor_name) || text(quotation?.vendor_details?.name)
  const ledger = vendorName ? ledgers.named.find((entry) => sameText(entry.name, vendorName)) : null
  const lines = Array.isArray(quotation?.product) ? quotation.product : []

  const record = {
    buyer_id: ledger?.id ?? '',
    invoice_master_details: {
      reference_no: [text(documentNo), text(master.quotation_no)].filter(Boolean).join(' / '),
      reference_date: text(master.quotation_date),
    },
    product_data: lines.map((item) => ({
      'Product Name': text(item.Description),
      sku_code: text(item.sku_code),
      hsn_sac_code: text(item.Hsn_code),
      igst: item.IGst_rate,
      cgst: item.CGst_rate,
      sgst: item.SGst_rate,
      Quantity: item.Qty,
      'Selling Rate': netRate(item),
      'Per Unit': text(item.Per),
      Description: descriptionOf(item.sku_details),
    })),
  }

  const unmatched = lines
    .map((item) => text(item.Description))
    .filter((name) => !products.some((product) => sameText(product.name, name)))
    .map((name) => name || 'a product with no name')

  return { record, vendorName, ledgerFound: Boolean(ledger), unmatched }
}

/**
 * LEDGER AND PRODUCT MAPPING (the Voucher view's Mapping) - the company's
 * ledgers and products to map, and the ones chosen sent on:
 *
 *   POST invoice/app-ledger-product/   { company_name, document_type }   ('Sales Invoice' | 'Purchase Invoice')
 *        -> { ledger: [{ ledger_obj_id, ledeger_name, ledeger_group_name, platform }],
 *             product: [{ product_id, product_name, group, hsn_code, per_unit, gst_rate,
 *                         selling_rate, category, product_ids }] }
 *   PUT  invoice/app-ledger-product/   { company_name, ledger: [ledger_obj_id...], product: [product_id...] }
 *        -> { msg: "Send To Tally Successfully" }
 *
 * The backend's own names are read as sent (`ledeger_name` included).
 */

import { api } from '@/Services/authService'

const APP_LEDGER_PRODUCT_URL = 'invoice/app-ledger-product/'

/** The two document types the mapping is asked for. */
export const MAPPING_DOCUMENT_TYPES = Object.freeze(['Sales Invoice', 'Purchase Invoice'])

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const hasId = (value) => value !== null && value !== undefined && text(value) !== ''

/**
 * The reply as two lists - each row kept by its own id (a row without one
 * cannot be mapped and is left out):
 *   ledgers   [{ id: ledger_obj_id, name, group, platform }]
 *   products  [{ id: product_id, name, group, hsn, unit, gstRate, sellingRate, category }]
 * A reply that is only a `msg` (company_name is required, Company not found) is that message, thrown.
 */
export const readAppLedgerProducts = (reply) => {
  const data = reply && typeof reply === 'object' && !Array.isArray(reply) ? reply : {}
  if (!Array.isArray(data.ledger) && !Array.isArray(data.product) && text(data.msg)) throw new Error(text(data.msg))
  const rows = (list) => (Array.isArray(list) ? list.filter((row) => row && typeof row === 'object') : [])
  return {
    ledgers: rows(data.ledger)
      .filter((row) => hasId(row.ledger_obj_id))
      .map((row) => ({ id: row.ledger_obj_id, name: text(row.ledeger_name), group: text(row.ledeger_group_name), platform: text(row.platform) })),
    products: rows(data.product)
      .filter((row) => hasId(row.product_id))
      .map((row) => ({
        id: row.product_id,
        name: text(row.product_name),
        group: text(row.group),
        hsn: text(row.hsn_code),
        unit: text(row.per_unit),
        gstRate: text(row.gst_rate),
        sellingRate: text(row.selling_rate),
        category: text(row.category),
      })),
  }
}

export const getAppLedgerProducts = ({ companyName, documentType }) =>
  api.post(APP_LEDGER_PRODUCT_URL, { company_name: text(companyName), document_type: documentType }).then(readAppLedgerProducts)

export const buildAppMappingBody = ({ companyName, ledgerIds, productIds }) => ({
  company_name: text(companyName),
  ledger: [...ledgerIds],
  product: [...productIds],
})

/** Sends the chosen ledgers and products on - a reply saying it failed (success: false) is thrown. */
export const saveAppMapping = (selection) =>
  api.put(APP_LEDGER_PRODUCT_URL, buildAppMappingBody(selection)).then((reply) => {
    if (reply && typeof reply === 'object' && reply.success === false) throw new Error(text(reply.msg) || 'The mapping was not saved.')
    return reply
  })

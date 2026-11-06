/**
 * Inventory Adjustments - stock removed from a warehouse, and the history of
 * what was removed.
 */

import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { api } from '@/Services/Global/apiService'
import { changesProducts } from '@/Services/Product/productCache'

/*
 * TWO URLS - AND THE HISTORY IS A **POST** ON THE SAME URL AS THE SAVE:
 *
 *   POST  inventory/update_inventory/       the history   { company_name }
 *         -> [{ id, company, inventory_adjustments: { master, payload, removed }, created_at }]
 *   POST  inventory/inventory_adjustments/  a product's stock   { company_name, product_name, sku_code }
 *         -> [{ "Product Name", ..., sku_variants: [{ product_id, sku_code,
 *              product_details: [{ sr_no, Quantity, "Unit Rate", "Expiry Date", sku_details,
 *              warehouse: [{ id, name, level, shelf, rack_no, warehouse_quantity }] }] }] }]
 *   POST  inventory/update_inventory/       remove stock  { company_name, warehouse: [{ product_id,
 *                                           warehouse: [{ id, sku_code, ..., remove_qty, qty }] }], master }
 *         -> { msg, inventory_master_id, updated: [{ product_id, sku_code, warehouse_id,
 *              old_qty, removed_qty, new_qty }], created_at }
 *
 * (see inventoryAdjustments). A save removes stock, so one that succeeded
 * reads the history again - at once where it is on screen - and marks the
 * product list stale.
 */
const UPDATE_INVENTORY_URL = 'inventory/update_inventory/'
const ADJUSTMENT_STOCK_URL = 'inventory/inventory_adjustments/'

/** The company's adjustments so far. */
export const getInventoryAdjustments = ({ companyName }) => api.post(UPDATE_INVENTORY_URL, { company_name: companyName })

/** A product's SKUs and the stock each holds, per warehouse - `skuCode` '' for all of them. */
export const getAdjustmentStock = ({ companyName, productName, skuCode }) =>
  api.post(ADJUSTMENT_STOCK_URL, { company_name: companyName, product_name: productName, sku_code: skuCode })

export const saveInventoryAdjustment = (body) =>
  changesProducts(api.post(UPDATE_INVENTORY_URL, body)).then((reply) => {
    invalidateQueries(QUERY.INVENTORY_ADJUSTMENTS, { refetchActive: true })
    return reply
  })

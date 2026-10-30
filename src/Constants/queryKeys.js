/**
 * The resources kept in the shared data cache (Library/queryCache) - the
 * first part of every cache key. The rest of a key is whose it is: the
 * company's name or id, exactly as the endpoint is asked with.
 *
 *   PRODUCTS            POST inventory/product/          [PRODUCTS, companyName]
 *   PRODUCT_GROUPS      POST inventory/product_group_list/ [PRODUCT_GROUPS, companyName]
 *   PRODUCT_UNITS       POST inventory/product_units/    [PRODUCT_UNITS, companyName]
 *   DOCUMENT_MAPPINGS   POST invoice/document-mapping/   [DOCUMENT_MAPPINGS, companyId, documentType] -
 *                       'Sales Invoice' or 'Purchase Invoice', each its own mappings
 *   TALLY_VOUCHERS      POST invoice/tally-vouchers/     [TALLY_VOUCHERS, companyId] - one
 *                       answer per company, shared by Sales and Purchase Invoice
 *   TALLY_VOUCHER_TYPES POST tally/voucher-list/        [TALLY_VOUCHER_TYPES, companyName] - the
 *                       company's voucher types, for every voucher of both modules
 *   APP_LEDGER_PRODUCTS POST invoice/app-ledger-product/  [APP_LEDGER_PRODUCTS, companyName, documentType] -
 *                       the ledgers and products the Voucher view's Mapping lists
 *   WAREHOUSES          POST inventory/warehouse_create/  [WAREHOUSES, companyId] - the list, read
 *                       again after a warehouse is created, changed or deleted (useWarehouses)
 *   QUOTATION_REQUESTS  POST inventory/AllRequestSO/      [QUOTATION_REQUESTS, companyName] - read
 *                       once a session, and again after a quotation is uploaded (useQuotationRequests)
 *   TRANSFER_NOTES      POST inventory/transfer_notes/    [TRANSFER_NOTES, companyName, warehouseId] - read
 *                       again after a note is created, changed or deleted (useTransferNotes)
 *   INVENTORY_ADJUSTMENTS POST inventory/update_inventory/ [INVENTORY_ADJUSTMENTS, companyName] - the
 *                       history, read again after an adjustment is saved (useInventoryAdjustments)
 *
 * How long an answer is used before it is asked for again, even with no
 * change seen here: what another user, another tab or Tally may have
 * changed meanwhile shows up within this long.
 */
export const QUERY = Object.freeze({
  PRODUCTS: 'products',
  PRODUCT_GROUPS: 'productGroups',
  PRODUCT_UNITS: 'productUnits',
  DOCUMENT_MAPPINGS: 'documentMappings',
  TALLY_VOUCHERS: 'tallyVouchers',
  TALLY_VOUCHER_TYPES: 'tallyVoucherTypes',
  APP_LEDGER_PRODUCTS: 'appLedgerProducts',
  WAREHOUSES: 'warehouses',
  QUOTATION_REQUESTS: 'quotationRequests',
  TRANSFER_NOTES: 'transferNotes',
  INVENTORY_ADJUSTMENTS: 'inventoryAdjustments',
})

export const MASTER_DATA_STALE_MS = 5 * 60 * 1000

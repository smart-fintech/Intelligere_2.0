/**
 * The resources kept in the shared data cache (Library/queryCache) - the
 * first part of every cache key. The rest of a key is whose it is: the
 * company's name or id, exactly as the endpoint is asked with.
 *
 *   PRODUCTS            POST inventory/product/          [PRODUCTS, companyName]
 *   PRODUCT_GROUPS      POST inventory/product_group_list/ [PRODUCT_GROUPS, companyName]
 *   PRODUCT_UNITS       POST inventory/product_units/    [PRODUCT_UNITS, companyName]
 *   DOCUMENT_MAPPINGS   POST invoice/document-mapping/   [DOCUMENT_MAPPINGS, companyId]
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
})

export const MASTER_DATA_STALE_MS = 5 * 60 * 1000

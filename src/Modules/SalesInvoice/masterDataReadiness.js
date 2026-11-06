/**
 * Does the company have the ledgers and products a document is made from?
 *
 * A company just created in Intelligere, or just fetched from Tally or
 * another ERP, may have neither yet. Then the Buyer (Seller, on a purchase)
 * list is empty and no product line can be added, and the form gave no
 * reason. This says what is missing, so the workspace can say so up front
 * (MasterDataNotice).
 *
 * It only READS the lists the workspace already holds (useInvoiceReferenceData
 * - the ledger slice and the shared product cache), so it asks the backend
 * nothing. A list still loading, or one that failed, is NOT "missing": the
 * answer waits for it, and a failure keeps its own Retry where the list is
 * used (Buyer / Products steps).
 *
 *   ledgers   { status: 'idle' | 'loading' | 'succeeded' | 'failed', options }
 *   products  { status: 'idle' | 'loading' | 'ready' | 'failed', list }
 *   productsRequired   the document type takes product lines only (Challan);
 *             a type that also takes services can be made without products,
 *             so a missing product list then only warns
 *
 * -> { missing: [] | ['ledgers'] | ['products'] | ['ledgers', 'products'],
 *      blocking,   true when the document cannot be made without them
 *      message }
 *
 * Ledgers are always needed: every document's party (the buyer on a sale,
 * the seller on a purchase) is one of the company's ledgers, and service
 * lines are ledgers too.
 */

export const MASTER_DATA_MESSAGE = Object.freeze({
  LEDGERS: 'No ledgers are available for this company. Please create or sync ledgers before proceeding.',
  PRODUCTS: 'No products are available for this company. Please create or sync products before proceeding.',
  PRODUCTS_OPTIONAL:
    'No products are available for this company. Please create or sync products before adding product lines - service lines can still be added.',
  BOTH: 'No ledgers or products are available for this company. A document needs both - its party is a ledger and its lines are products. Please create or sync ledgers and products before proceeding.',
})

const NOTHING_MISSING = Object.freeze({ missing: [], blocking: false, message: '' })

export const masterDataReadiness = ({ ledgers, products, productsRequired = true }) => {
  const noLedgers = ledgers?.status === 'succeeded' && (ledgers.options?.length ?? 0) === 0
  const noProducts = products?.status === 'ready' && (products.list?.length ?? 0) === 0

  if (noLedgers && noProducts) return { missing: ['ledgers', 'products'], blocking: true, message: MASTER_DATA_MESSAGE.BOTH }
  if (noLedgers) return { missing: ['ledgers'], blocking: true, message: MASTER_DATA_MESSAGE.LEDGERS }
  if (noProducts) {
    return productsRequired
      ? { missing: ['products'], blocking: true, message: MASTER_DATA_MESSAGE.PRODUCTS }
      : { missing: ['products'], blocking: false, message: MASTER_DATA_MESSAGE.PRODUCTS_OPTIONAL }
  }
  return NOTHING_MISSING
}

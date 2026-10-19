/**
 * The active company's products, for whichever screen shows them - the two
 * Product pages and the Sales Invoice form:
 *
 *   const products = useProducts()
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      the products exactly as the backend sent them. While a reload
 *             is on its way, and after one that failed, these are still the
 *             rows from before - a list on screen is never emptied by a
 *             Refresh. Empty until the first answer is in.
 *   error     the message when the request failed
 *   reload()  asks again - Refresh, Retry, and after a save or a sync.
 *
 * ONE CALL FOR EVERYONE: getProducts in Services/inventoryService - POST
 * inventory/product/ with the company's name. Tally or Intelligere, MSME or
 * Accounting Professional, with Inventory Management or without, the list
 * is fetched the same way, here, and holds the company's products with SKUs
 * and without alike. What differs between the screens is only how each
 * reads a row.
 *
 * ONE COPY FOR EVERYONE: the answer is kept in the shared cache
 * (Library/queryCache), per company. Moving between the Product pages and
 * Sales Invoice reuses it instead of downloading the list again; it is
 * fetched again when:
 *   - the company changes (another key - an older company's products are
 *     never handed out: until THIS company's answer is in, `rows` is empty
 *     and `status` is 'loading')
 *   - reload() is called (Refresh, Retry, after a save, a sync, an import)
 *   - a product, its stock or an invoice was saved anywhere (the services
 *     mark the products stale - see markProductsChanged)
 *   - it is older than MASTER_DATA_STALE_MS, for what changed elsewhere
 * A failed request is announced once, here, in the backend's own words (see
 * authService), and is not kept: the next screen to ask tries again.
 */

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { getProducts } from '@/Services/inventoryService'

/** What a company whose list is not in shows - one array, so memos built on it hold. */
const NO_ROWS = []

/** One request, one message - however many screens are waiting for it. */
const loadProducts = (companyName) =>
  getProducts(companyName).catch((failure) => {
    toast.error(failure.message)
    throw failure
  })

export default function useProducts() {
  const { activeCompanyName: companyName } = useActiveCompany()

  const query = useQuery({
    key: companyName ? [QUERY.PRODUCTS, companyName] : null,
    fetch: () => loadProducts(companyName),
    staleTime: MASTER_DATA_STALE_MS,
  })

  return {
    status: !companyName ? 'idle' : query.status,
    rows: query.data ?? NO_ROWS,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

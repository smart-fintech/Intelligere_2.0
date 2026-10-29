/**
 * A company's warehouses - THE one copy of the list every screen reads:
 *
 *   const list = useWarehouses()                     the active company's, at once
 *   const list = useWarehouses(isOpen)               only once `enabled` is true -
 *                                                    'idle', and nothing fetched, before
 *   const list = useWarehouses(true, companyId)      another company's (Create Sub User)
 *
 *   status       'idle' | 'loading' | 'ready' | 'failed'
 *   warehouses   the records as the backend sent them (getWarehouses)
 *   error        the message when the request failed
 *   reload()     asks again now - Refresh and Retry
 *
 * Kept in the shared cache (Library/queryCache) under [WAREHOUSES, companyId]:
 * the Warehouse tab, the Product form's dropdowns, the Sub User screens and
 * the Sales Order booking all share one answer per company, and asking while
 * it is fresh, or while it is on its way, sends nothing. A company's list is
 * never handed out for another - until THIS company's answer is in, there is
 * none.
 *
 * Read again only when a warehouse has been created, changed or deleted -
 * inventoryService's save and delete say so (invalidateQueries), once, for
 * every screen showing a list - or once MASTER_DATA_STALE_MS has passed.
 */

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useQuery } from '@/Library/queryCache'
import { getWarehouses } from '@/Services/inventoryService'

const NO_WAREHOUSES = []

export default function useWarehouses(enabled = true, forCompanyId) {
  const { activeCompanyId } = useActiveCompany()
  const companyId = forCompanyId ?? activeCompanyId

  const query = useQuery({
    // As text: one company's list is one entry, whether its id came as 5 or "5".
    key: companyId ? [QUERY.WAREHOUSES, String(companyId)] : null,
    fetch: () => getWarehouses(companyId),
    staleTime: MASTER_DATA_STALE_MS,
    enabled,
  })

  return {
    status: !enabled || !companyId ? 'idle' : query.status,
    warehouses: query.data ?? NO_WAREHOUSES,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

/**
 * The active company's inventory adjustments so far:
 *
 *   const adjustments = useInventoryAdjustments()
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      readAdjustments(...) of the reply
 *   error     the message when the request failed
 *   reload()  asks again now - Refresh and Retry
 *
 * Kept in the shared cache (Library/queryCache) under [INVENTORY_ADJUSTMENTS,
 * companyName]: asked when the tab first needs it, or for another company -
 * one company's history is never shown for another - and reused otherwise. A
 * saved adjustment reads it again (inventoryService); what others saved
 * shows within MASTER_DATA_STALE_MS, or on Refresh.
 */

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useQuery } from '@/Library/queryCache'
import { readAdjustments } from '@/Modules/Dashboard/inventoryAdjustments'
import { getInventoryAdjustments } from '@/Services/inventoryService'

const NO_ADJUSTMENTS = []

export default function useInventoryAdjustments() {
  const { activeCompanyName: companyName } = useActiveCompany()

  const query = useQuery({
    key: companyName ? [QUERY.INVENTORY_ADJUSTMENTS, companyName] : null,
    fetch: () => getInventoryAdjustments({ companyName }).then(readAdjustments),
    staleTime: MASTER_DATA_STALE_MS,
  })

  return {
    status: !companyName ? 'idle' : query.status,
    rows: query.data ?? NO_ADJUSTMENTS,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

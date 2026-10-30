/**
 * The active company's transfer notes - one warehouse's, or all of them:
 *
 *   const notes = useTransferNotes(warehouseId)    '' / null for all warehouses
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      readTransferNotes(...) of the reply
 *   error     the message when the request failed
 *   reload()  asks again now - Refresh and Retry
 *
 * Kept in the shared cache (Library/queryCache) under [TRANSFER_NOTES,
 * companyName, warehouseId]: asked when the page first needs it, or for
 * another company or warehouse - one company's (or warehouse's) notes are
 * never shown for another - and reused otherwise. A note created, changed or
 * deleted reads the notes again (inventoryService), once for every list on
 * screen; what others changed shows within MASTER_DATA_STALE_MS, or on Refresh.
 */

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useQuery } from '@/Library/queryCache'
import { readTransferNotes } from '@/Modules/Dashboard/transferNotes'
import { getTransferNotes } from '@/Services/inventoryService'

const NO_NOTES = []

export default function useTransferNotes(warehouseId) {
  const { activeCompanyName: companyName } = useActiveCompany()
  const warehouse = warehouseId ? String(warehouseId) : ''

  const query = useQuery({
    key: companyName ? [QUERY.TRANSFER_NOTES, companyName, warehouse] : null,
    // Read once, as it arrives - every screen then shares the same rows.
    fetch: () => getTransferNotes({ companyName, warehouseId: warehouse }).then(readTransferNotes),
    staleTime: MASTER_DATA_STALE_MS,
  })

  return {
    status: !companyName ? 'idle' : query.status,
    rows: query.data ?? NO_NOTES,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

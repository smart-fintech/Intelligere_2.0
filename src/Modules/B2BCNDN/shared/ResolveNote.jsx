import { AlertCircle, Loader2 } from 'lucide-react'

import { RESOLVE_STATE } from '@/Modules/B2BCNDN/shared/useResolveTracking'

/**
 * One line under an entry's party once the user has tried to put it right
 * (useResolveTracking): "Checking..." while that is checked, and - if it
 * still cannot go - what is still wrong, on tomato. Nothing otherwise.
 *
 *   state          RESOLVE_STATE, or null
 *   stillMissing   the party ledger still not in Tally, or ''
 */
export default function ResolveNote({ state, stillMissing }) {
  if (state === RESOLVE_STATE.PENDING) {
    return (
      <div role="status" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-400">
        <Loader2 className="size-3 animate-spin" />
        Checking the ledgers...
      </div>
    )
  }
  if (state === RESOLVE_STATE.INVALID) {
    return (
      <div className="mt-1 inline-flex items-start gap-1 rounded-sm bg-[#FF6347] px-1.5 py-0.5 text-[11px] font-medium text-white">
        <AlertCircle className="mt-px size-3 shrink-0" />
        {stillMissing
          ? `${stillMissing} is still not a ledger of the company - refresh once Tally has it`
          : 'Still cannot be sent - see what is wrong in this row'}
      </div>
    )
  }
  return null
}

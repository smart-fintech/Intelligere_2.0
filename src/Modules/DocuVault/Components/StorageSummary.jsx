import { HardDrive } from 'lucide-react'

import { cn } from '@/Library/utils'
import { isStorageFull, showStorage } from '@/Modules/DocuVault/docuVault'

/**
 * The line every view of the module opens with: the Owner's storage, shared
 * across all their companies. The figures and the status are the API's: nothing
 * is worked out or capped here.
 */
export default function StorageSummary({ used, status }) {
  const full = isStorageFull(status)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-sm">
      <HardDrive className="size-4 shrink-0 text-brand" />
      <span className="font-medium text-brand">Storage</span>
      {used ? <span className="tabular-nums">{showStorage(used)} used</span> : null}
      <span
        className={cn(
          'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
          full
            ? 'bg-destructive/10 text-destructive'
            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
        )}
      >
        {full ? 'Full' : 'Available'}
      </span>
    </div>
  )
}

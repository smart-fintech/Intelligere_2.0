import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * "Ledgers with duplicate GST number" - the upload's similar_ledger_GSTNO.:
 * GSTINs the company has on more than one ledger. Their entries cannot be
 * matched to a ledger until one of the ledgers is put right in Tally (or a
 * party mapping names the one to use). Folded until opened.
 *
 *   similar   [{ gstin, names }] (readSimilarLedgers)
 */
export default function SimilarLedgersNotice({ similar }) {
  const [open, setOpen] = useState(false)
  if (similar.length === 0) return null
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 text-left font-medium"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        {plural(similar.length, 'GST number is', 'GST numbers are')} on more than one ledger
        {open ? <ChevronDown className="ml-auto size-3.5" /> : <ChevronRight className="ml-auto size-3.5" />}
      </button>
      {open ? (
        <ul className="mt-2 space-y-1 pl-5">
          {similar.map((item) => (
            <li key={item.gstin} className="list-disc">
              <span className="font-medium">{item.gstin}</span>: {item.names.join(', ')}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

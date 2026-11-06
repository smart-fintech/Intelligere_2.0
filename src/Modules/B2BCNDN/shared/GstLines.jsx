import { AlertCircle } from 'lucide-react'

import { cn } from '@/Library/utils'
import { Amount } from '@/Modules/SalesEntries/shared/EntryCells'

/**
 * The GST lines of an entry, each "ledger ... amount" - a ledger that cannot
 * take its line (shared/gstValidation) on a TOMATO background, only that
 * ledger, with why under it. The rest of the cell reads as normal.
 *
 *   lines   [{ tax, amount, name, issue }] (gstLinesOf)
 *   rate    the entry's GST rate, shown above the lines
 *   extra   optional - beside the rate ("Local")
 */
export default function GstLines({ lines, rate, extra }) {
  return (
    <>
      <div className="mb-0.5 text-xs font-medium">
        {rate || 0}%{extra ? ` · ${extra}` : ''}
      </div>
      {lines.length === 0 ? (
        <span className="text-xs text-muted-foreground">No GST</span>
      ) : (
        <ul className="space-y-1 text-xs">
          {lines.map((line) => (
            <li key={line.tax}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn('min-w-0 truncate', line.issue && 'rounded-sm bg-[#FF6347] px-1 font-medium text-white')} title={line.issue ?? line.name}>
                  {line.name || `No ${line.tax} ledger`}
                </span>
                <Amount value={line.amount} className="shrink-0 text-muted-foreground" />
              </div>
              {line.issue ? (
                <div className="mt-0.5 flex items-start gap-1 text-[11px] text-[#c93b22] dark:text-[#ff8a73]">
                  <AlertCircle className="mt-px size-3 shrink-0" />
                  {line.issue}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

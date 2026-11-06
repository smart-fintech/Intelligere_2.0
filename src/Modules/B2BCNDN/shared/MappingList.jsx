import { ArrowRight, Trash2 } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { describeKey } from '@/Modules/B2BCNDN/shared/ledgerMapping'

/**
 * The saved keys of one kind (describeKey: purchase / party / tax / note),
 * each "what -> ledger" with Remove - under a mapping dialog's form.
 *
 *   mapping   useKeywordMapping (status, error, reload, saving, remove)
 *   flat      the flattened mapping (flattenMapping)
 *   kind      which keys this list shows
 *   title     the list's heading
 */
export default function MappingList({ mapping, flat, kind, title }) {
  const rows = Object.entries(flat)
    .map(([key, ledger]) => ({ key, ledger, ...describeKey(key) }))
    .filter((row) => row.kind === kind)
    .sort((a, b) => Number(a.legacy) - Number(b.legacy) || a.label.localeCompare(b.label, undefined, { numeric: true }))

  return (
    <div className="space-y-2">
      {mapping.status === 'failed' ? <InlineAlert action={<RetryButton onClick={mapping.reload} />}>{mapping.error}</InlineAlert> : null}
      <div className="rounded-md border border-border">
        <div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title} ({rows.length})
        </div>
        {mapping.status === 'loading' && rows.length === 0 ? (
          <div className="px-3">
            <ListSkeleton rows={3} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing mapped yet.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1" title={row.key}>
                  <span className="block truncate">{row.label}</span>
                  {row.legacy ? <span className="text-[11px] text-muted-foreground">Older mapping - used when no local / interstate one fits</span> : null}
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium text-brand" title={row.ledger}>
                  {row.ledger}
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  icon={Trash2}
                  aria-label={`Remove the mapping of ${row.label}`}
                  tooltip="Remove"
                  disabled={mapping.saving}
                  onClick={() => mapping.remove(row.key)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

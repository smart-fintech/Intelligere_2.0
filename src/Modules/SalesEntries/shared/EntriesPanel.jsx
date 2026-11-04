import { AlertCircle, ChevronLeft, ChevronRight, FileSpreadsheet, RefreshCw, Send } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * The "Entries" card every view shows its batch in - the parts that are the
 * same in all three:
 *
 *   Refresh                   reads this batch again
 *   not a Tally account       a note: entries can be uploaded and looked
 *                             over, Send is for a Tally ERP account
 *   sent but not marked       the alert with "Mark as sent" (useTallySendAndMark)
 *   the batch's states        loading (first time), failed, nothing uploaded,
 *                             every entry of this batch sent - else `children`
 *   batch navigation          Previous / Next batch, under the list
 *
 * Props: batch (useEntryBatches), tally (useTallySendAndMark), isTally, busy,
 * entryCount (entries of the batch, after the view's reading), meta, emptyHint.
 */

export function BatchNav({ batch, busy }) {
  const { info } = batch
  if (info.count <= 1) return null
  const waiting = busy || batch.status === 'loading'
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>
        Batch {info.number} of {info.count} · invoices {info.first}-{info.last} of {batch.total}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" icon={ChevronLeft} disabled={!info.hasPrevious || waiting} onClick={() => batch.goTo(info.previousStart)}>
          Previous batch
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!info.hasNext || waiting} onClick={() => batch.goTo(info.nextStart)}>
          Next batch
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export default function EntriesPanel({ batch, tally, isTally, busy, entryCount, meta, emptyHint, children }) {
  const firstLoad = batch.status === 'loading' && batch.rows.length === 0 && batch.total === 0

  const body = () => {
    if (firstLoad) return <ListSkeleton rows={6} />
    if (batch.status === 'failed' && batch.rows.length === 0) {
      return (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the sales entries" action={<RetryButton onClick={batch.reload} />}>
          {batch.error}
        </StateMessage>
      )
    }
    if (batch.total === 0) {
      return (
        <StateMessage icon={FileSpreadsheet} title="No sales entries yet">
          {emptyHint}
        </StateMessage>
      )
    }
    if (entryCount === 0) {
      return (
        <>
          <StateMessage icon={Send} title="Nothing left in this batch">
            Every entry of batch {batch.info.number} has been sent to Tally.
          </StateMessage>
          <BatchNav batch={batch} busy={busy} />
        </>
      )
    }
    return (
      <div className="space-y-3">
        {batch.status === 'failed' ? <InlineAlert action={<RetryButton onClick={batch.reload} />}>{batch.error}</InlineAlert> : null}
        {children}
        <BatchNav batch={batch} busy={busy} />
      </div>
    )
  }

  return (
    <Panel
      title="Entries"
      meta={meta}
      actions={
        <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={batch.status === 'loading' && !firstLoad} disabled={busy} onClick={batch.reload}>
          Refresh
        </Button>
      }
    >
      {!isTally ? (
        <p className="mb-3 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
          Sending to Tally is for a Tally ERP account. You can upload and review the entries here.
        </p>
      ) : null}
      {tally.unmarked.length > 0 ? (
        <InlineAlert
          action={
            <Button type="button" variant="outline" size="sm" loading={tally.marking} onClick={tally.retryMark}>
              Mark as sent
            </Button>
          }
        >
          {plural(tally.unmarked.length, 'entry is', 'entries are')} in Tally but not marked as sent here. Mark them now - do not send them again.
        </InlineAlert>
      ) : null}
      {body()}
    </Panel>
  )
}

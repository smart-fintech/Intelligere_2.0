import { AlertCircle, FileSpreadsheet, Send } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * The "Entries" card of B2B and CNDN - the frame Sales Entries' EntriesPanel
 * draws, for lists that are not paged by start_index:
 *
 *   not a Tally account   a note: entries can be uploaded and looked over,
 *                         Send is for a Tally ERP account
 *   sent but not marked   the alert with "Mark as sent" (useTallySendAndMark)
 *   the list's states     loading (first time), failed (with Retry), nothing
 *                         uploaded, every entry sent - else `children`
 *
 *   status      'loading' | 'ready' | 'failed'; error, onRetry
 *   hasAny      whether anything was uploaded at all; entryCount the entries left
 *   emptyTitle, emptyHint, doneHint   the words of those states
 *   meta, actions   beside the title; footer   under the list (the next batch)
 */
export default function EntriesCard({
  status,
  error,
  onRetry,
  tally,
  isTally,
  hasAny,
  entryCount,
  emptyTitle,
  emptyHint,
  doneHint,
  meta,
  actions,
  footer,
  children,
}) {
  const firstLoad = status === 'loading' && !hasAny

  const body = () => {
    if (firstLoad) return <ListSkeleton rows={6} />
    if (status === 'failed' && !hasAny) {
      return (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the entries" action={onRetry ? <RetryButton onClick={onRetry} /> : null}>
          {error}
        </StateMessage>
      )
    }
    if (!hasAny) {
      return (
        <StateMessage icon={FileSpreadsheet} title={emptyTitle}>
          {emptyHint}
        </StateMessage>
      )
    }
    if (entryCount === 0) {
      return (
        <>
          <StateMessage icon={Send} title="Nothing left to send">
            {doneHint}
          </StateMessage>
          {footer}
        </>
      )
    }
    return (
      <div className="space-y-3">
        {status === 'failed' ? <InlineAlert action={onRetry ? <RetryButton onClick={onRetry} /> : null}>{error}</InlineAlert> : null}
        {children}
        {footer}
      </div>
    )
  }

  return (
    <Panel title="Entries" meta={meta} actions={actions}>
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

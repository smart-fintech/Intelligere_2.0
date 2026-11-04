import { Send, Waypoints } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { Button } from '@/Components/ui/button'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * The right of the list's filter row: Keyword Mapping, how many are ticked,
 * and Send to Tally - with the "send anyway?" question of useGuardedSend.
 *
 *   isTally   Send is for a Tally account only; Mapping is for everyone
 *   tally     useTallySendAndMark;  guard  useGuardedSend
 */
export default function SendActions({ isTally, count, tally, guard, busy, onMapping }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" icon={Waypoints} disabled={busy} onClick={onMapping}>
        Keyword Mapping
      </Button>
      {isTally ? (
        <>
          <span className="text-xs text-muted-foreground">{plural(count, 'entry', 'entries')} selected</span>
          <Button type="button" size="sm" icon={Send} loading={tally.busy} disabled={count === 0 || busy} onClick={guard.send}>
            {tally.marking ? 'Marking as sent...' : tally.busy ? 'Sending...' : `Send ${count || ''} to Tally`}
          </Button>
        </>
      ) : null}
      <ConfirmDialog
        open={guard.confirming > 0}
        onOpenChange={guard.cancel}
        title="Send entries whose ledger is not in Tally?"
        description={`${plural(guard.confirming, 'selected entry has', 'selected entries have')} a party ledger the company does not have. Tally will refuse those vouchers, and then nothing of this send is marked as sent.`}
        confirmLabel="Send anyway"
        variant="default"
        onConfirm={guard.proceed}
      />
    </div>
  )
}

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useSelector } from 'react-redux'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { PR_VIEW, PR_VIEW_OPTIONS } from '@/Constants/payableReceivable'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { invalidateQueries, useQuery } from '@/Library/queryCache'
import OutstandingList from '@/Modules/PayableReceivable/Components/OutstandingList'
import LedgerExportScreen from '@/Modules/PayableReceivable/LedgerExport/LedgerExportScreen'
import { readLastSync } from '@/Modules/PayableReceivable/payableReceivable'
import useTallySync from '@/Modules/PayableReceivable/useTallySync'
import {
  TALLY_RECEIVABLE_PAYABLE_MODULE,
  buildReceivablePayableSyncMessage,
  getLastSync,
} from '@/Services/payableReceivableService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * The module's screen: the three radio buttons, and what they show.
 *
 *   Payable, Receivable   OutstandingList, the same component either way
 *   Ledger Export         LedgerExportScreen - first opened when chosen, then
 *                         kept mounted, so a sync running there is not lost
 *                         when the user looks at another list
 *
 * A Tally user also gets Last Sync (POST with only the company name) and Sync
 * Now, which asks the Tally agent to send both lists again. A sync replaces
 * what is held, so it asks first once there is data to lose. Its loader,
 * failures and timeout are useTallySync's. A user on another ERP has neither:
 * nothing there comes from Tally.
 */

const SYNC_MESSAGES = Object.freeze({
  done: 'Payables and receivables synced from Tally.',
  failed: 'Tally could not sync the payables and receivables.',
})

export default function PayableReceivableScreen({ companyName, companyId }) {
  const isTally = useSelector(selectIsTallyErp)
  const [view, setView] = useState(PR_VIEW.PAYABLE)
  const [confirmingSync, setConfirmingSync] = useState(false)
  const [ledgerExportOpened, setLedgerExportOpened] = useState(false)
  if (view === PR_VIEW.LEDGER_EXPORT && !ledgerExportOpened) setLedgerExportOpened(true)

  const lastSync = useQuery({
    key: [QUERY.RECEIVABLE_PAYABLE_SYNC, companyName],
    fetch: () => getLastSync(companyName).then(readLastSync),
    staleTime: MASTER_DATA_STALE_MS,
    enabled: isTally,
  })
  const syncedAt = lastSync.data?.lastSync ?? null

  const sync = useTallySync({
    moduleName: TALLY_RECEIVABLE_PAYABLE_MODULE,
    companyName,
    buildMessage: buildReceivablePayableSyncMessage,
    messages: SYNC_MESSAGES,
    onSuccess: () => {
      lastSync.reload()
      invalidateQueries(QUERY.RECEIVABLE_PAYABLE, { refetchActive: true })
    },
  })

  const syncNow = () => {
    if (syncedAt) setConfirmingSync(true)
    else sync.start()
  }

  const lastSyncText = lastSync.status === 'failed' ? 'could not be read' : lastSync.data ? syncedAt || 'Not synced yet' : '...'

  const syncActions = isTally ? (
    <>
      <span className="text-xs text-muted-foreground" title={lastSync.error || lastSync.data?.message || undefined}>
        <span className="font-medium">Last Sync:</span> {lastSyncText}
      </span>
      <Button type="button" variant="secondary" size="sm" icon={Download} loading={sync.syncing} onClick={syncNow}>
        {sync.syncing ? 'Syncing...' : 'Sync Now'}
      </Button>
    </>
  ) : null

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Payable Receivable</h1>

        <ViewSwitch
          options={PR_VIEW_OPTIONS}
          value={view}
          onValueChange={setView}
          label="Payable Receivable view"
          idPrefix="pr-view"
          className="mx-auto w-fit max-w-full"
        />
      </div>

      {ledgerExportOpened ? (
        <div hidden={view !== PR_VIEW.LEDGER_EXPORT}>
          <LedgerExportScreen companyName={companyName} companyId={companyId} />
        </div>
      ) : null}

      {view === PR_VIEW.LEDGER_EXPORT ? null : (
        // A remount per list: what is open and filtered is that list's own.
        <OutstandingList
          key={view}
          companyName={companyName}
          companyId={companyId}
          source={view}
          syncing={sync.syncing}
          syncActions={syncActions}
          onRefresh={isTally ? lastSync.reload : undefined}
          emptyHint={isTally && !syncedAt ? 'Use Sync Now to bring this company’s data over from Tally.' : undefined}
        />
      )}

      <ConfirmDialog
        open={confirmingSync}
        onOpenChange={setConfirmingSync}
        title="Sync from Tally?"
        description="All previous data will be replaced."
        confirmLabel="Sync"
        variant="secondary"
        onConfirm={() => {
          setConfirmingSync(false)
          sync.start()
        }}
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeftRight, Download, RefreshCw } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { invalidateQueries, useQuery } from '@/Library/queryCache'
import LedgerReport from '@/Modules/PayableReceivable/LedgerExport/LedgerReport'
import LedgerSyncModal from '@/Modules/PayableReceivable/LedgerExport/LedgerSyncModal'
import { groupLedgers } from '@/Modules/PayableReceivable/LedgerExport/ledgerExport'
import { readLastSync } from '@/Modules/PayableReceivable/payableReceivable'
import useTallySync from '@/Modules/PayableReceivable/useTallySync'
import { TALLY_LEDGER_EXPORT_MODULE, buildLedgerExportSyncMessage, getLedgerLastSync } from '@/Services/ledgerExportService'
import {
  fetchLedgers,
  selectLedgerError,
  selectLedgerStatus,
  selectLedgers,
  selectLedgersCompanyId,
} from '@/Store/Slices/ledgerSlice'

/**
 * LEDGER EXPORT FOR A TALLY USER.
 *
 *   Last Sync, Sync Now                  the ledgers come over from Tally for the
 *                                        period chosen in LedgerSyncModal
 *   General Ledger, Party Wise Ledger    what came over (LedgerReport)
 *
 * The groups and ledgers the reports offer are the company's own, from the
 * shared ledger store. A ledger with nothing synced for it reports "No data found".
 */

const REPORTS = [
  { value: 'general', label: 'General Ledger' },
  { value: 'party', label: 'Party Wise Ledger' },
]
const NO_RANGE = Object.freeze({ startMonth: '', startYear: '', endMonth: '', endYear: '' })
const SYNC_MESSAGES = Object.freeze({
  done: 'Ledgers synced from Tally.',
  failed: 'Tally could not sync the ledgers.',
})
const NO_LEDGERS = []

export default function TallyLedgerExport({ companyName, companyId, companyAddress }) {
  const dispatch = useDispatch()
  const [range, setRange] = useState(NO_RANGE) // the period last asked for
  const [choosing, setChoosing] = useState(false)
  const [report, setReport] = useState(REPORTS[0].value)

  const lastSync = useQuery({
    key: [QUERY.LEDGER_EXPORT_SYNC, companyName],
    fetch: () => getLedgerLastSync(companyName).then(readLastSync),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const syncedAt = lastSync.data?.lastSync ?? null

  /* ---------------- What the reports offer ---------------- */
  const storeLedgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)
  const ledgerError = useSelector(selectLedgerError)
  const ledgersReady = ledgersFor === companyId && ledgerStatus === 'succeeded'
  const ledgers = ledgersFor === companyId ? storeLedgers : NO_LEDGERS
  const groups = useMemo(() => groupLedgers(ledgers), [ledgers])

  useEffect(() => {
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  const reloadLedgers = () => dispatch(fetchLedgers({ companyId, force: true }))

  const sync = useTallySync({
    moduleName: TALLY_LEDGER_EXPORT_MODULE,
    companyName,
    buildMessage: buildLedgerExportSyncMessage,
    messages: SYNC_MESSAGES,
    onSuccess: () => {
      lastSync.reload()
      reloadLedgers()
      invalidateQueries(QUERY.LEDGER_REPORT)
    },
  })

  const startSync = (chosen) => {
    setRange(chosen)
    setChoosing(false)
    sync.start({
      start_month: Number(chosen.startMonth),
      start_year: Number(chosen.startYear),
      end_month: Number(chosen.endMonth),
      end_year: Number(chosen.endYear),
    })
  }

  const lastSyncText = lastSync.status === 'failed' ? 'could not be read' : lastSync.data ? syncedAt || 'Not synced yet' : '...'

  const renderReports = () => {
    if (sync.syncing) {
      return (
        <Loader
          variant="page"
          label={`Syncing ledgers from Tally for ${companyName}...`}
          description="The reports will be ready as soon as the sync finishes."
        />
      )
    }
    if (groups.length === 0) {
      if (ledgerStatus === 'failed') {
        return (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the ledgers" action={<RetryButton onClick={reloadLedgers} />}>
            {ledgerError}
          </StateMessage>
        )
      }
      if (!ledgersReady) return <ListSkeleton rows={3} />
      return (
        <StateMessage icon={ArrowLeftRight} title="No ledgers yet">
          This company has no ledgers to report on.
        </StateMessage>
      )
    }
    return (
      <div className="space-y-4">
        <ViewSwitch
          options={REPORTS}
          value={report}
          onValueChange={setReport}
          label="Ledger report"
          idPrefix="le-report"
          className="mx-auto w-fit max-w-full"
        />
        {/* A remount per report: a choice made in one never carries to the other. */}
        <LedgerReport
          key={report}
          general={report === 'general'}
          groups={groups}
          companyId={companyId}
          companyName={companyName}
          companyAddress={companyAddress}
        />
      </div>
    )
  }

  return (
    <Panel
      title="Ledger Export"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" title={lastSync.error || lastSync.data?.message || undefined}>
            <span className="font-medium">Last Sync:</span> {lastSyncText}
          </span>
          <Button type="button" variant="secondary" size="sm" icon={Download} loading={sync.syncing} onClick={() => setChoosing(true)}>
            {sync.syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={ledgerStatus === 'loading'}
            disabled={sync.syncing}
            onClick={() => {
              reloadLedgers()
              lastSync.reload()
            }}
          >
            Refresh
          </Button>
        </div>
      }
    >
      {renderReports()}

      {choosing ? (
        <LedgerSyncModal
          companyName={companyName}
          lastSyncText={lastSyncText}
          // Until the last sync is known (still loading, or could not be read), assume there is data to lose.
          hasData={!lastSync.data || Boolean(syncedAt)}
          initialRange={range}
          onClose={() => setChoosing(false)}
          onStart={startSync}
        />
      ) : null}
    </Panel>
  )
}

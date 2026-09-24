/**
 * Ledger Details: the Ledger Form on the left, the Ledger List on the right.
 *
 * The same shape as BankDetails, deliberately - see the note at the top of
 * that file about why nothing here is fetched on a re-render.
 *
 * In short: the ledgers and the groups both live in the store
 * (Store/Slices/ledgerSlice), and the `condition` on each thunk decides
 * whether asking for them costs a request. Opening the form, editing,
 * filtering, sorting and paging never reach the network. Only the first
 * visit for a company, Refresh, Retry, and one forced reload after a
 * create / update / delete do.
 *
 * SYNC NOW (Tally users)
 * Asks Tally, over the app's shared WebSocket, to send this company's ledgers
 * again: { payload: { module_name: "fetch_ledger", company_name } }. The
 * loader stays on through the WHOLE job - until the `fetch_ledger` reply
 * with action_status "stop_loader", and then until the ledger list has been
 * reloaded (the same fetchLedgers the Refresh button uses).
 */

import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertCircle, BookOpen, CloudDownload, RefreshCw, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { CsvDownloadButton } from '@/Components/Common/CsvDownloadButton'
import {
  InlineAlert,
  ListSkeleton,
  RetryButton,
  RowActions,
  StateMessage,
} from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import {
  DataTable,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useListView } from '@/Hooks/useListView'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { CSV_SOURCES } from '@/Services/csvService'
import {
  LEDGER_SOCKET_MODULE,
  buildFetchLedgerMessage,
  deleteLedger,
  getLedgerId,
  deleteAllLedgers,
} from '@/Services/ledgerService'
import { fetchBankOptions, selectBankNames } from '@/Store/Slices/bankSlice'
import {
  fetchCompanies,
  selectCompanyError,
  selectCompanyStatus,
  selectActiveCompany,
  selectActiveCompanyId,
  selectActiveCompanyName,
} from '@/Store/Slices/companySlice'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'
import {
  fetchLedgerGroups,
  fetchLedgers,
  selectLedgerError,
  selectLedgerGroupCompanyId,
  selectLedgerGroupSource,
  selectLedgerGroups,
  selectLedgerStatus,
  selectLedgers,
} from '@/Store/Slices/ledgerSlice'
import { orDash } from '@/Utils/display'
import LedgerCsvUpload from './LedgerCsvUpload'
import LedgerForm from './LedgerForm'

/**
 * Safety net for Sync Now: the longest the loader waits for Tally's
 * stop_loader. A large company can take a while, so this is generous - it
 * only stops the page spinning for ever if the reply never comes.
 */
const SYNC_TIMEOUT_MS = 5 * 60 * 1000

/** "0" is a real credit period; only a missing value becomes a dash. */
const creditPeriod = (days) =>
  days === null || days === undefined || days === '' ? '--' : `${days} days`

/* The group is shown, searched and filtered by `ledeger_group_name`, the
   name the ledger API sends with every row - never by the `ledeger_group`
   number, which means nothing to a user. */
const SEARCH_FIELDS = ['ledeger_name', 'ledeger_email', 'ledeger_phone', 'ledeger_group_name']
const FILTER_FIELDS = {
  ledeger_group_name: 'Group',
  // ledger_gst_reg_type: 'GST Type',
}

export default function LedgerDetails() {
  const dispatch = useDispatch()

  const company = useSelector(selectActiveCompany)
  const companyStatus = useSelector(selectCompanyStatus)
  const companyError = useSelector(selectCompanyError)
  // The selected company's `company_id` - what every ledger request is about.
  const companyId = useSelector(selectActiveCompanyId)

  const ledgers = useSelector(selectLedgers)
  const status = useSelector(selectLedgerStatus)
  const error = useSelector(selectLedgerError)
  const groups = useSelector(selectLedgerGroups)
  // The ERP's group endpoint - null until the profile has arrived.
  const groupSource = useSelector(selectLedgerGroupSource)
  // Tally only: the company the groups are for (null for Intelligere).
  const groupCompanyId = useSelector(selectLedgerGroupCompanyId)

  /* The Bank Name dropdown on the form is filled from the bank list - the
     SAME store the Bank Details page reads, so whichever page the user opens
     first pays for it and the other gets it free. */
  const bankNames = useSelector(selectBankNames)

  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /* ---------------- Sync Now ---------------- */

  // The active company's name - what the sync is about (central store).
  const activeCompanyName = useSelector(selectActiveCompanyName)
  // Sync Now fetches from Tally, so only Tally users get it.
  const isTally = useSelector(selectIsTallyErp)

  // True from the click until the reloaded list is on screen.
  const [syncing, setSyncing] = useState(false)
  // Where the sync is: 'idle' | 'sending' | 'waiting' (for stop_loader) |
  // 'reloading' (the ledger API). A ref, because the socket callback that
  // reads it was registered on mount.
  const syncPhaseRef = useRef('idle')
  const syncTimerRef = useRef(null)
  // The company to reload after the sync - the CURRENT one, read in a callback.
  const companyIdRef = useRef(companyId)

  useEffect(() => {
    companyIdRef.current = companyId
  }, [companyId])

  /** Loader off, and ready for the next Sync Now. */
  const endSync = () => {
    syncPhaseRef.current = 'idle'
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = null
    setSyncing(false)
  }

  /** The sync failed before stop_loader: stop, say so, reload nothing. */
  const failSync = (message, error) => {
    console.error('[Ledger Sync] WebSocket error:', error ?? message)
    endSync()
    toast.error(message)
  }

  /** stop_loader arrived: reload the ledgers, loader still on until done. */
  const reloadAfterSync = async () => {
    syncPhaseRef.current = 'reloading'
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = null

    const result = await dispatch(fetchLedgers({ companyId: companyIdRef.current, force: true }))

    // `meta.condition` means the request was skipped (one already running),
    // which is not a failure. A real failure keeps the rows already shown;
    // the list's own error line appears as well.
    if (fetchLedgers.rejected.match(result) && !result.meta.condition) {
      console.error('[Ledger Sync] Ledger API error:', result.payload ?? result.error)
      toast.error(result.payload || 'Could not reload the ledgers.')
    }

    endSync()
  }

  /**
   * The app's shared WebSocket - no new connection. `module` means only
   * fetch_ledger replies reach this handler.
   */
  const { send, status: socketStatus } = useWebSocket({
    module: LEDGER_SOCKET_MODULE,
    onMessage: (data) => {
      const reply = data?.res
      if (!reply || reply.return_module_name !== LEDGER_SOCKET_MODULE) return

      // Not a sync this page started (or already finished): ignore it.
      const phase = syncPhaseRef.current
      if (phase !== 'waiting' && phase !== 'sending') return

      // Several replies can arrive; only stop_loader ends the Tally part.
      if (reply.action_status !== 'stop_loader') return

      if (reply.msg) {
        if (reply.status === 'error') toast.error(reply.msg)
        else if (reply.status === 'success') toast.success(reply.msg)
        else toast.info(reply.msg)
      }

      reloadAfterSync()
    },
  })

  // The connection dropped while Tally was working: its reply is lost, so
  // stop rather than spin until the safety timeout.
  useEffect(() => {
    if (socketStatus === 'closed' && syncPhaseRef.current === 'waiting') {
      failSync('The live server connection was lost during the ledger sync. Please try again.')
    }
    // failSync is a plain function recreated each render; only the status
    // should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketStatus])

  // Nothing of the sync may outlive the page.
  useEffect(
    () => () => {
      syncPhaseRef.current = 'idle'
      clearTimeout(syncTimerRef.current)
    },
    [],
  )

  /** Sync Now. A click while a sync is running is ignored. */
  const handleSync = async () => {
    if (!isTally || syncPhaseRef.current !== 'idle') return

    const companyName = activeCompanyName?.trim()
    if (!companyName) {
      toast.error('Please select an active company before syncing Ledger data.')
      return
    }

    syncPhaseRef.current = 'sending'
    setSyncing(true)

    const delivered = await send(buildFetchLedgerMessage(companyName))

    // The reply may already have arrived, or the page gone away.
    if (syncPhaseRef.current !== 'sending') return

    if (!delivered) {
      failSync('Could not reach the live server. Please try again.')
      return
    }

    syncPhaseRef.current = 'waiting'
    syncTimerRef.current = setTimeout(() => {
      if (syncPhaseRef.current === 'waiting') {
        failSync('Tally did not finish the ledger sync in time. Please try again.')
      }
    }, SYNC_TIMEOUT_MS)
  }

  /* Asks for what this page shows. Both thunks refuse a duplicate request
     (see their `condition`), so this effect re-running still produces at most
     one of each. The groups are session-wide and fetched only the first time
     any page needs them. */
  useEffect(() => {
    if (companyStatus !== 'succeeded' || !companyId) return

    dispatch(fetchLedgers({ companyId }))
    // Reference data shared with Bank Details; its condition means this is a
    // no-op if that page has already loaded it this session.
    dispatch(fetchBankOptions())
  }, [dispatch, companyStatus, companyId])

  /* The groups follow the ERP (and, for Tally, the active company), so they
     wait for both: a new source or company loads them once, the same one is
     a no-op (the thunk's `condition`).
     A failure is a toast - only for a request that really ran, so a skipped
     duplicate never shows it twice. */
  useEffect(() => {
    if (!groupSource) return

    dispatch(fetchLedgerGroups()).then((result) => {
      if (fetchLedgerGroups.rejected.match(result) && !result.meta.condition) {
        toast.error(result.payload || 'Ledger groups could not be loaded.')
      }
    })
  }, [dispatch, groupSource, groupCompanyId])

  /** One controlled reload - the Refresh button, and after every save. */
  const reload = () => dispatch(fetchLedgers({ companyId, force: true }))

  /** Filtering, sorting and paging, all on the rows already in the store. */
  const view = useListView(ledgers, {
    searchFields: SEARCH_FIELDS,
    filterFields: FILTER_FIELDS,
  })

  /** A save finished: refresh once and drop back out of edit mode. */
  const handleSaved = () => {
    setEditing(null)
    reload()
  }

  /**
   * Removes the ledger the user confirmed.
   *
   * Ledger deletion is a SOFT delete - the backend marks the row hidden and
   * keeps it (see deleteLedger in ledgerService).
   */
  const handleDelete = async () => {
    if (!confirming || deleting) return

    setDeleting(true)

    try {
      const response = await deleteLedger(getLedgerId(confirming), companyId)
      toast.success(response?.msg || 'Ledger deleted successfully.')
      if (editing && getLedgerId(editing) === getLedgerId(confirming)) setEditing(null)
      setConfirming(null)
      reload()
    } catch (failure) {
      toast.error(failure.message)
      if (failure.status === 404) {
        setConfirming(null)
        reload()
      }
    } finally {
      setDeleting(false)
    }
  }

  /**
   * deletes all ledgers for the selected company.
   */
  const handleDeleteAll = async () => {
    if (confirming !== 'all' || deleting) return

    setDeleting(true)

    try {
      const response = await deleteAllLedgers(companyId)
      toast.success(response?.msg || 'All ledgers deleted successfully.')
      setConfirming(null)
      reload()
    } catch (failure) {
      toast.error(failure.message)
      if (failure.status === 404) {
        setConfirming(null)
        reload()
      }
    } finally {
      setDeleting(false)
    }
  }

  const loading = status === 'loading' || status === 'idle'

  // The id of the row open in the form, or null while adding.
  const editingId = editing ? getLedgerId(editing) : null

  /* ---------------- What fills the list card ---------------- */
  const renderList = () => {
    // Sync Now first: the whole list area is the loader until the reloaded
    // ledgers are in - never "No ledgers found" in between.
    if (syncing) {
      return (
        <Loader
          variant="page"
          label={`Syncing ledgers from Tally for ${activeCompanyName}...`}
          description="The ledger list will appear as soon as the sync finishes."
        />
      )
    }

    if (companyStatus === 'failed') {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load your companies"
          action={<RetryButton onClick={() => dispatch(fetchCompanies({ force: true }))} />}
        >
          {companyError || 'Please try again.'}
        </StateMessage>
      )
    }

    if (companyStatus !== 'succeeded') return <ListSkeleton />

    if (!companyId) {
      return (
        <StateMessage icon={BookOpen} title="No company selected">
          Choose a company in the header to see its ledgers.
        </StateMessage>
      )
    }

    if (loading && ledgers.length === 0) return <ListSkeleton />

    // Nothing tries again on its own; the button below is the only way.
    if (status === 'failed' && ledgers.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load ledgers"
          action={<RetryButton onClick={reload} />}
        >
          {error}
        </StateMessage>
      )
    }

    if (ledgers.length === 0) {
      return (
        <StateMessage icon={BookOpen} title="No ledgers found">
          There are no ledger records for this company. Use the Ledger Form to add one.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={view}
          searchPlaceholder="Search name, email or phone"
          // The export is of the company the header is on, by name.
          actions={
            <CsvDownloadButton
              payload={{ source: CSV_SOURCES.LEDGER, company_name: company?.comp_name }}
              disabled={!company?.comp_name}
            />
          }
        />

        {view.total === 0 ? (
          <StateMessage icon={BookOpen} title="No matching ledgers">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <DataTable
            head={
              <>
                <SortableHead view={view} field="ledeger_name" width={200}>
                  Ledger Name
                </SortableHead>
                <SortableHead view={view} field="ledeger_gstin" width={170}>
                  GSTIN
                </SortableHead>
                <SortableHead view={view} field="ledger_sac" width={140}>
                  SAC
                </SortableHead>
                <SortableHead view={view} field="gst_rate" width={140}>
                  GST Rate
                </SortableHead>
                <SortableHead view={view} field="ledeger_group_name" width={170}>
                  Group
                </SortableHead>
                <SortableHead view={view} field="ledeger_state" width={150}>
                  State
                </SortableHead>
                <SortableHead view={view} field="credit_period_days" width={120}>
                  Credit Days
                </SortableHead>
                <PlainHead width={110} className="text-right">Actions</PlainHead>
              </>
            }
          >
            {view.rows.map((ledger) => (
              <TableRow className="text-brand"
                // `ledger_obj_id` is the ledger's own id from the API - stable
                // and unique, so React can tell the rows apart across a sort,
                // a filter or a reload. (These rows have no `id` field; keying
                // on it gave every row the same undefined key.)
                key={getLedgerId(ledger)}
                // The row open in the form is tinted, so it is obvious what the
                // left-hand side is showing.
                data-state={editingId === getLedgerId(ledger) ? 'selected' : undefined}
              >
                <TableCell className="font-medium">
                  {orDash(ledger.ledeger_name)}
                </TableCell>
                {/* The group's NAME, as the API sends it - not its number. */}
                <TableCell>{orDash(ledger.ledeger_gstin)}</TableCell>
                <TableCell>{orDash(ledger.ledger_sac)}</TableCell>
                <TableCell>{orDash(ledger.gst_rate)}</TableCell>
                <TableCell>{orDash(ledger.ledeger_group_name)}</TableCell>
                <TableCell>{orDash(ledger.ledeger_state)}</TableCell>
                <TableCell>{creditPeriod(ledger.credit_period_days)}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    label={ledger.ledeger_name}
                    onEdit={() => setEditing(ledger)}
                    onDelete={() => setConfirming(ledger)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}

        <TablePager view={view} />
      </>
    )
  }

  return (
    <>
      {/* The form keeps roughly a third; the table takes the rest, because it
          is the part with seven columns in it. They stack on anything
          narrower than `lg`, form first. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 space-y-4 lg:w-[32%]">
          {/* Many ledgers at once, from a filled-in CSV - the form below is
              still the way to add or edit one. It reloads the list through
              the same `reload` a save uses. */}
          <LedgerCsvUpload
            companyId={companyId}
            companyName={company?.comp_name}
            isTally={isTally}
            onImported={reload}
          />

          {/* `key` is what fills the form in when a different row is chosen
              for editing: React remounts it, so its initialiser runs again
              with the new row. No effect, and no request. */}
          <LedgerForm
            key={editingId ?? 'new'}
            ledger={editing}
            companyId={companyId}
            companyName={company?.comp_name}
            groups={groups}
            bankNames={bankNames}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            isTally={isTally}
            onRefresh={reload}
          />
        </div>

        <div className="min-w-0 flex-1">
          <Panel
            title="Ledger List"
            meta={
              // Use flex and items-center to keep everything vertically centered on one line
              <React.Fragment>
                <span className="text-muted-foreground whitespace-nowrap">
                  Total Count: {ledgers.length}
                </span>&nbsp;&nbsp;

                <Button
                  type="button"
                  variant="iconDelete"
                  size="sm"
                  tooltip="Delete all ledgers for this company"
                  onClick={() => setConfirming('all')} // Set to 'all' to trigger the modal
                  disabled={loading || syncing || ledgers.length === 0}
                  aria-label="Delete all ledgers"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 
                </Button>
              </React.Fragment>
            }
            actions={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={reload}
                  disabled={loading || syncing || !companyId}
                  aria-label="Refresh ledger list"
                >
                  <RefreshCw className={cn(loading)} />
                  Refresh
                </Button>

                {/* Fetches the ledgers from Tally, then reloads the list. */}
                {isTally && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    icon={CloudDownload}
                    loading={syncing}
                    onClick={handleSync}
                    disabled={!companyId || !activeCompanyName}
                    aria-label="Sync ledgers from Tally"
                  >
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                )}
              </div>
            }
          >
            {/* A failed refresh with rows still on screen. */}
            {!syncing && status === 'failed' && ledgers.length > 0 ? (
              <InlineAlert action={<RetryButton onClick={reload} />}>{error}</InlineAlert>
            ) : null}

            {renderList()}
          </Panel>
        </div>
      </div>

      {/* Nothing is deleted on the click itself - this asks first. */}
      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(next) => {
          if (!next) setConfirming(null)
        }}
        title={confirming === 'all' ? "Delete All Ledgers" : "Delete ledger"}
        description={
          confirming === 'all'
            ? "Are you sure you want to permanently delete ALL ledgers for this company? This action cannot be undone."
            : confirming
              ? `Remove ${confirming.ledeger_name} from this company?`
              : undefined
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        busy={deleting}
        onConfirm={confirming === 'all' ? handleDeleteAll : handleDelete}
      />
    </>
  )
}

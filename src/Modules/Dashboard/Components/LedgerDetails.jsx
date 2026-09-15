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
 */

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertCircle, BookOpen, RefreshCw } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { CsvDownloadButton } from '@/Components/Common/CsvDownloadButton'
import {
  InlineAlert,
  ListSkeleton,
  RetryButton,
  RowActions,
  StateMessage,
} from '@/Components/Common/DataList'
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
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { CSV_SOURCES } from '@/Services/csvService'
import { deleteLedger, getLedgerId } from '@/Services/ledgerService'
import { fetchBankOptions, selectBankNames } from '@/Store/Slices/bankSlice'
import {
  fetchCompanies,
  selectCompanyError,
  selectCompanyStatus,
  selectSelectedCompany,
  selectSelectedCompanyId,
} from '@/Store/Slices/companySlice'
import {
  fetchLedgerGroups,
  fetchLedgers,
  selectLedgerError,
  selectLedgerGroups,
  selectLedgerGroupsError,
  selectLedgerStatus,
  selectLedgers,
} from '@/Store/Slices/ledgerSlice'
import { orDash } from '@/Utils/display'
import LedgerForm from './LedgerForm'

/** "0" is a real credit period; only a missing value becomes a dash. */
const creditPeriod = (days) =>
  days === null || days === undefined || days === '' ? '--' : `${days} days`

/* The group is shown, searched and filtered by `ledeger_group_name`, the
   name the ledger API sends with every row - never by the `ledeger_group`
   number, which means nothing to a user. */
const SEARCH_FIELDS = ['ledeger_name', 'ledeger_email', 'ledeger_phone', 'ledeger_group_name']
const FILTER_FIELDS = {
  ledeger_group_name: 'Group',
  ledger_gst_reg_type: 'GST Type',
}

export default function LedgerDetails() {
  const dispatch = useDispatch()

  const company = useSelector(selectSelectedCompany)
  const companyStatus = useSelector(selectCompanyStatus)
  const companyError = useSelector(selectCompanyError)
  // The selected company's `company_id` - what every ledger request is about.
  const companyId = useSelector(selectSelectedCompanyId)

  const ledgers = useSelector(selectLedgers)
  const status = useSelector(selectLedgerStatus)
  const error = useSelector(selectLedgerError)
  const groups = useSelector(selectLedgerGroups)
  const groupsError = useSelector(selectLedgerGroupsError)

  /* The Bank Name dropdown on the form is filled from the bank list - the
     SAME store the Bank Details page reads, so whichever page the user opens
     first pays for it and the other gets it free. */
  const bankNames = useSelector(selectBankNames)

  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /* Asks for what this page shows. Both thunks refuse a duplicate request
     (see their `condition`), so this effect re-running still produces at most
     one of each. The groups are session-wide and fetched only the first time
     any page needs them. */
  useEffect(() => {
    if (companyStatus !== 'succeeded' || !companyId) return

    dispatch(fetchLedgers({ companyId }))
    dispatch(fetchLedgerGroups())
    // Reference data shared with Bank Details; its condition means this is a
    // no-op if that page has already loaded it this session.
    dispatch(fetchBankOptions())
  }, [dispatch, companyStatus, companyId])

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

  const loading = status === 'loading' || status === 'idle'

  // The id of the row open in the form, or null while adding.
  const editingId = editing ? getLedgerId(editing) : null

  /* ---------------- What fills the list card ---------------- */
  const renderList = () => {
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
                <SortableHead view={view} field="ledeger_name">
                  Ledger Name
                </SortableHead>
                <SortableHead view={view} field="ledeger_group_name">
                  Group
                </SortableHead>
                <SortableHead view={view} field="ledeger_email">
                  Email
                </SortableHead>
                <SortableHead view={view} field="ledeger_phone">
                  Phone
                </SortableHead>
                <SortableHead view={view} field="ledger_gst_reg_type">
                  GST Type
                </SortableHead>
                <SortableHead view={view} field="credit_period_days">
                  Credit Days
                </SortableHead>
                <PlainHead className="text-right">Actions</PlainHead>
              </>
            }
          >
            {view.rows.map((ledger) => (
              <TableRow
                // `ledger_obj_id` is the ledger's own id from the API - stable
                // and unique, so React can tell the rows apart across a sort,
                // a filter or a reload. (These rows have no `id` field; keying
                // on it gave every row the same undefined key.)
                key={getLedgerId(ledger)}
                // The row open in the form is tinted, so it is obvious what the
                // left-hand side is showing.
                data-state={editingId === getLedgerId(ledger) ? 'selected' : undefined}
              >
                <TableCell className="font-medium text-brand">
                  {orDash(ledger.ledeger_name)}
                </TableCell>
                {/* The group's NAME, as the API sends it - not its number. */}
                <TableCell>{orDash(ledger.ledeger_group_name)}</TableCell>
                <TableCell>{orDash(ledger.ledeger_email)}</TableCell>
                <TableCell>{orDash(ledger.ledeger_phone)}</TableCell>
                <TableCell>{orDash(ledger.ledger_gst_reg_type)}</TableCell>
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
        <div className="w-full shrink-0 lg:w-[32%]">
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
          />
        </div>

        <div className="min-w-0 flex-1">
          <Panel
            title="Ledger List"
            meta={`(Total Count: ${ledgers.length})`}
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reload}
                disabled={loading || !companyId}
                aria-label="Refresh ledger list"
              >
                <RefreshCw className={cn(loading && 'animate-spin')} />
                Refresh
              </Button>
            }
          >
            {/* The groups could not be loaded. The ledgers are still perfectly
                readable without them - the Group column comes with each row;
                only the form's Ledger Group dropdown is affected - so this is
                a line above the table rather than something that replaces it. */}
            {groupsError ? (
              <InlineAlert
                action={
                  <RetryButton onClick={() => dispatch(fetchLedgerGroups({ force: true }))} />
                }
              >
                Ledger groups could not be loaded. {groupsError}
              </InlineAlert>
            ) : null}

            {/* A failed refresh with rows still on screen. */}
            {status === 'failed' && ledgers.length > 0 ? (
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
        title="Delete ledger"
        description={
          confirming ? `Remove ${confirming.ledeger_name} from this company?` : undefined
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

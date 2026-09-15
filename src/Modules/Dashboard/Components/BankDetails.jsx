/**
 * Bank Details: the Bank Form on the left, the Bank List on the right.
 *
 * ------------------------------------------------------------------
 * A RE-RENDER IS NOT A REQUEST
 * ------------------------------------------------------------------
 * Nothing is fetched here. The accounts and the form's dropdowns both live
 * in the store (Store/Slices/bankSlice); this component only ASKS for them
 * as it mounts, and the `condition` on each thunk decides whether that costs
 * a request. It does not, unless nothing has been loaded yet or the selected
 * company has changed.
 *
 * So none of the following reaches the network: opening the form, switching
 * it into edit mode, typing in a field, typing in a filter, sorting a column,
 * turning a page, or any re-render at all. Only these do:
 *
 *   the first visit for a company     the effect below
 *   Refresh                           the user asked
 *   Retry                             the user asked
 *   a create / update / delete        one forced reload afterwards
 *
 * Filtering, sorting and paging are done on the rows already in the store -
 * see Hooks/useListView - so they never send anything either.
 */

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertCircle, Landmark, RefreshCw } from 'lucide-react'

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
import { deleteBank } from '@/Services/bankService'
import { CSV_SOURCES } from '@/Services/csvService'
import {
  fetchBankOptions,
  fetchBanks,
  selectBankError,
  selectBankStatus,
  selectBanks,
} from '@/Store/Slices/bankSlice'
import {
  fetchCompanies,
  selectCompanyError,
  selectCompanyStatus,
  selectSelectedCompany,
  selectSelectedCompanyId,
} from '@/Store/Slices/companySlice'
import {
  fetchLedgers,
  selectLedgerError,
  selectLedgerStatus,
  selectLedgers,
  selectLedgersCompanyId,
} from '@/Store/Slices/ledgerSlice'
import { orDash } from '@/Utils/display'
import BankForm from './BankForm'

// A stable empty list, so "no ledgers yet" does not hand the form a new
// array on every render.
const NO_LEDGERS = []

/** The one search box looks through these; the dropdowns filter these. */
const SEARCH_FIELDS = ['bank_name', 'bank_ledger_name', 'account_no', 'ifsc_code', 'company_name']
const FILTER_FIELDS = {
  company_name: 'Company',
  bank_name: 'Bank',
  bank_ledger_name: 'Ledger',
}

export default function BankDetails() {
  const dispatch = useDispatch()

  // The company the header is on. Both modules read it from here, so the
  // company is fetched once for the whole app - see companySlice.
  const company = useSelector(selectSelectedCompany)
  const companyStatus = useSelector(selectCompanyStatus)
  const companyError = useSelector(selectCompanyError)
  // The selected company's `company_id` - what every bank request is about.
  const companyId = useSelector(selectSelectedCompanyId)

  const banks = useSelector(selectBanks)
  const status = useSelector(selectBankStatus)
  const error = useSelector(selectBankError)

  /* The company's ledgers, for the form's Bank Ledger dropdown. This is the
     SAME list the Ledger Details page shows (Store/Slices/ledgerSlice), so
     whichever page is opened first loads it and the other gets it free.

     Only used once it is known to belong to THIS company: straight after a
     company switch the store may still hold the previous company's ledgers
     for a moment, and offering those would file an account under the wrong
     ledger. */
  const allLedgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)
  const ledgerError = useSelector(selectLedgerError)
  const ledgersReady = ledgersFor === companyId
  const ledgers = ledgersReady ? allLedgers : NO_LEDGERS

  // The row being edited, or null while adding. Local UI state - changing it
  // never fetches anything.
  const [editing, setEditing] = useState(null)

  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /* Asks for what this page shows. Every thunk refuses a duplicate request
     (see their `condition`), so this effect re-running - or two screens
     asking at once - still produces at most one of each.

     `companyId` is in the dependencies because the accounts belong to it:
     when the header switches company, this asks again and the condition
     agrees, because what is in the store belongs to somebody else. */
  useEffect(() => {
    if (companyStatus !== 'succeeded' || !companyId) return

    dispatch(fetchBanks({ companyId }))
    dispatch(fetchBankOptions())
    // A no-op when the Ledger page has already loaded this company's ledgers.
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyStatus, companyId])

  /** One controlled reload - the Refresh button, and after every save. */
  const reload = () => dispatch(fetchBanks({ companyId, force: true }))

  /** Filtering, sorting and paging, all on the rows already in the store. */
  const view = useListView(banks, {
    searchFields: SEARCH_FIELDS,
    filterFields: FILTER_FIELDS,
  })

  /** A save finished: refresh once and drop back out of edit mode. */
  const handleSaved = () => {
    setEditing(null)
    reload()
  }

  /** Removes the row the user confirmed. */
  const handleDelete = async () => {
    if (!confirming || deleting) return

    setDeleting(true)

    try {
      const response = await deleteBank(confirming.id)
      toast.success(response?.msg || 'Bank deleted successfully.')
      // The row being edited may be the one just deleted.
      if (editing?.id === confirming.id) setEditing(null)
      setConfirming(null)
      reload()
    } catch (failure) {
      // A 404 means somebody has already deleted it, so the list is out of
      // date either way - it is refreshed once, and the backend's own "not
      // found" wording is what the user reads.
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

  /* ---------------- What fills the list card ---------------- */
  const renderList = () => {
    // ---- The companies could not be loaded ----
    // There is no company to ask about, so this is the only thing worth
    // saying. Retry reloads THAT list, not this one.
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
        <StateMessage icon={Landmark} title="No company selected">
          Choose a company in the header to see its bank accounts.
        </StateMessage>
      )
    }

    if (loading && banks.length === 0) return <ListSkeleton />

    // ---- The request failed and there is nothing to fall back on ----
    // Nothing tries again on its own; the button below is the only way.
    if (status === 'failed' && banks.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load bank details"
          action={<RetryButton onClick={reload} />}
        >
          {error}
        </StateMessage>
      )
    }

    if (banks.length === 0) {
      return (
        <StateMessage icon={Landmark} title="No bank details found">
          Use the Bank Form to add this company's first bank account.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={view}
          searchPlaceholder="Search bank, account or IFSC"
          // The export is of the company the header is on, by name - read
          // from the store at the moment of the click, never typed in.
          actions={
            <CsvDownloadButton
              payload={{ source: CSV_SOURCES.BANK, company_name: company?.comp_name }}
              disabled={!company?.comp_name}
            />
          }
        />

        {view.total === 0 ? (
          <StateMessage icon={Landmark} title="No matching banks">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <DataTable
            head={
              <>
                <SortableHead view={view} field="company_name">
                  Company
                </SortableHead>
                <SortableHead view={view} field="bank_ledger_name">
                  Bank Ledger
                </SortableHead>
                <SortableHead view={view} field="bank_name">
                  Bank Name
                </SortableHead>
                <SortableHead view={view} field="account_no">
                  Acc. No.
                </SortableHead>
                <SortableHead view={view} field="ifsc_code">
                  IFSC
                </SortableHead>
                <PlainHead className="text-right">Actions</PlainHead>
              </>
            }
          >
            {view.rows.map((bank) => (
              <TableRow
                key={bank.id}
                // The row open in the form is tinted, so it is obvious what the
                // left-hand side is showing.
                data-state={editing?.id === bank.id ? 'selected' : undefined}
              >
                <TableCell className="font-medium text-brand">
                  {orDash(bank.company_name ?? company?.comp_name)}
                </TableCell>
                <TableCell>{orDash(bank.bank_ledger_name)}</TableCell>
                <TableCell>{orDash(bank.bank_name)}</TableCell>
                <TableCell>{orDash(bank.account_no)}</TableCell>
                <TableCell>{orDash(bank.ifsc_code)}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    label={bank.bank_name}
                    onEdit={() => setEditing(bank)}
                    onDelete={() => setConfirming(bank)}
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
          is the part with six columns in it. They stack on anything narrower
          than `lg`, form first. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 lg:w-[32%]">
          {/* `key` is what fills the form in when a different row is chosen
              for editing: React remounts it, so its initialiser runs again
              with the new row. No effect, and no request. */}
          <BankForm
            key={editing?.id ?? 'new'}
            bank={editing}
            companyId={companyId}
            companyName={company?.comp_name}
            ledgers={ledgers}
            // Until this company's ledgers have arrived the dropdown is
            // loading - unless the request for them failed, which it says.
            ledgersStatus={ledgersReady || ledgerStatus === 'failed' ? ledgerStatus : 'loading'}
            ledgersError={ledgerStatus === 'failed' ? ledgerError : null}
            onRetryLedgers={() => dispatch(fetchLedgers({ companyId, force: true }))}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </div>

        {/* `min-w-0` is what lets a wide table scroll inside this column
            instead of stretching the whole page. */}
        <div className="min-w-0 flex-1">
          <Panel
            title="Bank List"
            meta={`(Total Count: ${banks.length})`}
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reload}
                disabled={loading || !companyId}
                aria-label="Refresh bank list"
              >
                <RefreshCw className={cn(loading && 'animate-spin')} />
                Refresh
              </Button>
            }
          >
            {/* A failed refresh with rows still on screen: the list below is
                what the backend last gave us, so it stays and this only
                explains why it has not changed. */}
            {status === 'failed' && banks.length > 0 ? (
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
        title="Delete bank"
        description={
          confirming
            ? `Remove ${confirming.bank_name} (${confirming.account_no}) from this company? This cannot be undone.`
            : undefined
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

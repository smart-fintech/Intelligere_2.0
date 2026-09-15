/**
 * Company Details: the Company Form on the left, the Company List on the
 * right - the same arrangement as Bank Details and Ledger Details.
 *
 * ------------------------------------------------------------------
 * THE LIST IS THE ONE THE WHOLE APP ALREADY HAS
 * ------------------------------------------------------------------
 * tally/user-companies-list/ is fetched once, by AppLayout, into the store
 * (Store/Slices/companySlice) - it is the same list behind the header's
 * company picker. This page reads it from there; opening it costs no request.
 * Only these reach the network:
 *
 *   Refresh / Retry        the user asked
 *   Update / Delete        the change, then one forced reload of the list
 *
 * Filtering, sorting and paging work on the rows already in memory (see
 * Hooks/useListView).
 *
 * ------------------------------------------------------------------
 * WHICH COMPANY IS IN THE FORM
 * ------------------------------------------------------------------
 * The one whose Edit was clicked; until then, the company the header is
 * working in - so the form is useful the moment the page opens. That row is
 * tinted in the table.
 */

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertCircle, Building2, RefreshCw } from 'lucide-react'

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
import { getEmail } from '@/Library/secureStorage'
import { deleteCompany, getCompanyStatus } from '@/Services/companyService'
import { CSV_SOURCES } from '@/Services/csvService'
import {
  fetchCompanies,
  removeCompany,
  selectCompanies,
  selectCompanyError,
  selectCompanyStatus,
  selectSelectedCompanyId,
} from '@/Store/Slices/companySlice'
import { formatLongDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import CompanyForm from './CompanyForm'

const SEARCH_FIELDS = ['comp_name', 'comp_gstin', 'comp_email', 'comp_phone', 'pan_no']
const FILTER_FIELDS = {
  status_label: 'Status',
  comp_state: 'State',
}

/** The badge colour for each status - see getCompanyStatus in companyService. */
const STATUS_TONES = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  paid: 'bg-brand-soft text-brand dark:bg-brand/15',
  trial: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  expired: 'bg-destructive/10 text-destructive',
  inactive: 'bg-muted text-muted-foreground',
}

/**
 * The status as a small coloured pill. The reason behind it ("Free trial
 * until 10 Sep 2027") is its tooltip, so the column stays narrow.
 */
function StatusBadge({ status }) {
  return (
    <span
      title={status.detail}
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_TONES[status.tone] ?? STATUS_TONES.inactive,
      )}
    >
      {status.label}
    </span>
  )
}

export default function CompanyDetails() {
  const dispatch = useDispatch()

  const companies = useSelector(selectCompanies)
  const status = useSelector(selectCompanyStatus)
  const error = useSelector(selectCompanyError)
  // The company the header is working in.
  const selectedId = useSelector(selectSelectedCompanyId)

  // The company_id whose Edit was clicked, or null.
  const [editingId, setEditingId] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /* AppLayout has normally loaded the list already; this only makes sure,
     and the thunk's `condition` turns it into a no-op when it has. */
  useEffect(() => {
    dispatch(fetchCompanies())
  }, [dispatch])

  /** One controlled reload - Refresh, Retry, and after every change. */
  const reload = () => dispatch(fetchCompanies({ force: true }))

  /* Each company with its status worked out once, as a plain field, so the
     Status filter and the Status column read the same value. */
  const rows = useMemo(
    () =>
      companies.map((company) => {
        const companyStatus = getCompanyStatus(company)
        return { ...company, status: companyStatus, status_label: companyStatus.label }
      }),
    [companies],
  )

  const view = useListView(rows, {
    searchFields: SEARCH_FIELDS,
    filterFields: FILTER_FIELDS,
  })

  // The company in the form: the one being edited, else the header's.
  const formId = editingId ?? selectedId
  const formCompany = companies.find((company) => company.company_id === formId) ?? null

  /** Removes the company the user confirmed. */
  const handleDelete = async () => {
    if (!confirming || deleting) return

    setDeleting(true)

    try {
      const response = await deleteCompany(confirming.company_id)
      toast.success(response?.msg || `${confirming.comp_name} has been deleted.`)

      // Out of the table at once, then the list is reloaded to be sure it
      // matches the backend (and, if it was the header's company, so a new
      // one is picked).
      dispatch(removeCompany(confirming.company_id))
      if (editingId === confirming.company_id) setEditingId(null)
      setConfirming(null)
      reload()
    } catch (failure) {
      // A 404 means it is already gone, so the list is stale either way.
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
    if (loading && companies.length === 0) return <ListSkeleton />

    // Nothing tries again on its own; the button below is the only way.
    if (status === 'failed' && companies.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load your companies"
          action={<RetryButton onClick={reload} />}
        >
          {error}
        </StateMessage>
      )
    }

    if (companies.length === 0) {
      return (
        <StateMessage icon={Building2} title="No companies found">
          Add a company with the + beside the company picker in the header.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={view}
          searchPlaceholder="Search name, GST, email or phone"
          // Every company of the signed-in user: the export is asked for by
          // their email, the one saved at sign-in - the same value the
          // company list itself is requested with (getUserCompanies).
          actions={
            <CsvDownloadButton
              payload={{ source: CSV_SOURCES.COMPANY, email: getEmail() }}
              disabled={!getEmail()}
            />
          }
        />

        {view.total === 0 ? (
          <StateMessage icon={Building2} title="No matching companies">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          // Wide: it scrolls sideways inside its own box, and the Actions
          // column stays pinned on the right while it does (see DataTable).
          <DataTable
            head={
              <>
                <SortableHead view={view} field="comp_name">
                  Company Name
                </SortableHead>
                <SortableHead view={view} field="status_label">
                  Status
                </SortableHead>
                <SortableHead view={view} field="comp_state">
                  State
                </SortableHead>
                <SortableHead view={view} field="comp_email">
                  Email
                </SortableHead>
                <SortableHead view={view} field="comp_phone">
                  Mobile
                </SortableHead>
                <SortableHead view={view} field="comp_gstin">
                  GST Number
                </SortableHead>
                <SortableHead view={view} field="pan_no">
                  PAN
                </SortableHead>
                <SortableHead view={view} field="comp_website">
                  Website
                </SortableHead>
                <SortableHead view={view} field="udyam">
                  Udyam
                </SortableHead>
                <SortableHead view={view} field="category">
                  Category
                </SortableHead>
                <SortableHead view={view} field="created_date">
                  Active Date
                </SortableHead>
                <SortableHead view={view} field="renew_date">
                  Last Date
                </SortableHead>
                <PlainHead className="text-right">Actions</PlainHead>
              </>
            }
          >
            {view.rows.map((company) => (
              <TableRow
                // `company_id` - the company's own, stable identifier.
                key={company.company_id}
                data-state={company.company_id === formId ? 'selected' : undefined}
              >
                <TableCell className="font-medium text-brand">{orDash(company.comp_name)}</TableCell>
                <TableCell>
                  <StatusBadge status={company.status} />
                </TableCell>
                <TableCell>{orDash(company.comp_state)}</TableCell>
                <TableCell>{orDash(company.comp_email)}</TableCell>
                <TableCell>{orDash(company.comp_phone)}</TableCell>
                <TableCell>{orDash(company.comp_gstin)}</TableCell>
                <TableCell>{orDash(company.pan_no)}</TableCell>
                <TableCell>{orDash(company.comp_website)}</TableCell>
                <TableCell>{orDash(company.udyam)}</TableCell>
                <TableCell>{orDash(company.category)}</TableCell>
                <TableCell>{formatLongDate(company.created_date)}</TableCell>
                <TableCell>{formatLongDate(company.renew_date)}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    label={company.comp_name}
                    onEdit={() => setEditingId(company.company_id)}
                    onDelete={() => setConfirming(company)}
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
      {/* The form keeps roughly a third; the table takes the rest. They stack
          on anything narrower than `lg`, form first. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 lg:w-[32%]">
          {/* `key` is what fills the form in when a different company is
              chosen: React remounts it, so its initialiser runs again. */}
          <CompanyForm key={formId ?? 'none'} company={formCompany} onSaved={reload} />
        </div>

        {/* `min-w-0` lets the wide table scroll inside this column instead of
            stretching the whole page. */}
        <div className="min-w-0 flex-1">
          <Panel
            title="Company List"
            meta={`(Total Count: ${companies.length})`}
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reload}
                disabled={loading}
                aria-label="Refresh company list"
              >
                <RefreshCw className={cn(loading && 'animate-spin')} />
                Refresh
              </Button>
            }
          >
            {/* A failed refresh with rows still on screen: they stay, and this
                says why they have not changed. */}
            {status === 'failed' && companies.length > 0 ? (
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
        title="Delete company"
        description={
          confirming
            ? `Delete ${confirming.comp_name}? ${
                confirming.company_id === selectedId
                  ? 'It is the company you are working in now. '
                  : ''
              }This cannot be undone.`
            : undefined
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

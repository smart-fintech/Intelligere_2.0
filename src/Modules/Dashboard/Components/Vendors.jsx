/**
 * The Vendor tab of Inventory Master: the active company's vendors, with Add
 * and Edit.
 *
 * ------------------------------------------------------------------
 * WHAT REACHES THE NETWORK
 * ------------------------------------------------------------------
 *   opening the tab / company change   the list   POST { company_id }
 *                                      the company's ledgers, unless the store
 *                                      already has them (see ledgerSlice)
 *   Refresh / Retry                    the list
 *   Save in the dialog                 POST or PUT, then the list again
 *   Search in the dialog               POST inventory/vendor_search/ - a
 *                                      lookup only; nothing is saved by it
 *
 * After every save the list is read again from the backend rather than
 * patched by hand, so the table always shows what is really saved.
 * Searching, filtering, sorting and paging work on the rows already loaded
 * (Hooks/useListView) and cost no request - and survive a save, so the user
 * is still on the same page of the same search afterwards.
 *
 * `company_id` is the company the header is working in, from the store -
 * the same source every other dashboard list uses (useActiveCompany). It is
 * also the KEY a vendor's company parts are filed under (see "Vendors" in
 * inventoryService), which is why the rows are worked out against it below.
 *
 * A reply carries far more than this page shows - machinery, certifications,
 * documents. Those belong to other screens; only the fields named in the
 * row-building below are ever read.
 *
 * THERE IS NO DELETE: how this endpoint removes a vendor has not been
 * confirmed (see the note in inventoryService), so a row has Edit only.
 *
 * The rows are this tab's alone, so they are kept here rather than in the
 * store.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertCircle, Pencil, Plus, RefreshCw, Star, Truck } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { YesNo } from '@/Components/Common/DetailList'
import { Panel } from '@/Components/Common/Panel'
import { StarRating } from '@/Components/Common/StarRating'
import {
  DataTable,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '@/Components/ui/popover'
import { TableCell, TableRow } from '@/Components/ui/table'
import {
  VENDOR_OVERALL_RATING,
  VENDOR_RATING_CRITERIA,
  VENDOR_RATING_MAX,
} from '@/Constants/inventory'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useListView } from '@/Hooks/useListView'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { getVendorId, getVendors, vendorCompanyDetails, vendorRating } from '@/Services/inventoryService'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import {
  fetchLedgers,
  selectLedgerError,
  selectLedgerStatus,
  selectLedgers,
  selectLedgersCompanyId,
} from '@/Store/Slices/ledgerSlice'
import { orDash } from '@/Utils/display'
import VendorFormModal from './VendorFormModal'

const SEARCH_FIELDS = ['ledger_name', 'company_name', 'contact', 'email', 'gst_no', 'pan_no', 'city', 'state']

/* Verification and Status read a label worked out for the row below, so
   their dropdowns offer words ("Verified") and never true / false. */
const FILTER_FIELDS = {
  // verified_label: 'Verification',
  // status_label: 'Status',
  state: 'State',
}

/** What a company whose list has not arrived yet shows - one object, so the memos below hold. */
const NOT_LOADED = { status: 'loading', rows: [], error: null }

// A stable empty list, so "no ledgers yet" does not hand the form a new
// array on every render.
const NO_LEDGERS = []

/** Whether a score is there to show - 0 is a score, null and '' are not. */
const hasScore = (value) => value !== null && value !== undefined && value !== ''

export default function Vendors() {
  const dispatch = useDispatch()
  const { activeCompanyId: companyId } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)

  /* The company's ledgers, for the form's Ledger Name dropdown. This is the
     SAME list the Ledger Details and Bank Details pages use
     (Store/Slices/ledgerSlice), so whichever is opened first loads it and
     the others get it free.

     Only used once it is known to belong to THIS company: straight after a
     company switch the store may still hold the previous company's ledgers
     for a moment, and offering those would file a vendor under the wrong
     ledger. */
  const allLedgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)
  const ledgerError = useSelector(selectLedgerError)
  const ledgersReady = ledgersFor === companyId
  const ledgers = ledgersReady ? allLedgers : NO_LEDGERS

  // A no-op when another page has already loaded this company's ledgers.
  useEffect(() => {
    if (companyId) dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  /* ---------------- The list ----------------
     Kept with the company it belongs to: a result for an older company (the
     header changed while it was on its way) is not shown. A reload keeps the
     rows on screen until the new ones arrive. */
  const [state, setState] = useState({ status: 'loading', rows: [], error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyId) return

    const requestKey = `${companyId}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getVendors(companyId)
      .then((rows) => {
        if (request.current === requestKey) setState({ status: 'ready', rows, error: null, forKey: companyId })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        toast.error(failure.message)
        setState((previous) => ({
          status: 'failed',
          // The rows already on screen stay if they are this company's.
          rows: previous.forKey === companyId ? previous.rows : [],
          error: failure.message,
          forKey: companyId,
        }))
      })
  }, [companyId, attempt])

  /** One controlled reload - Refresh, Retry, and after every save. */
  const reload = () => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setAttempt((count) => count + 1)
  }

  const current = state.forKey === companyId ? state : NOT_LOADED
  const loading = current.status === 'loading'

  /* What the table draws: the vendor's own fields beside the two parts filed
     under this company - its ledger and flags, and its ratings - flattened
     into one row, with the flags worked out once as words so a filter, a
     sort and a column all read the same value. `source` is the vendor
     exactly as the backend sent it - what Edit opens. The overall rating is
     the one the backend sent; nothing here works one out. */
  const rows = useMemo(
    () =>
      current.rows.map((vendor, index) => {
        const details = vendorCompanyDetails(vendor, companyId)
        const rating = vendorRating(vendor, companyId)

        return {
          source: vendor,
          // The position covers a row that arrived without an identifier.
          key: getVendorId(vendor) ?? `row-${index}`,
          ledger_name: details?.ledger_name,
          company_name: details?.company_name,
          contact: vendor.contact,
          email: vendor.email,
          gst_no: vendor.gst_no,
          pan_no: vendor.pan_no,
          city: vendor.city,
          state: vendor.state,
          rating,
          overall_rating: rating?.[VENDOR_OVERALL_RATING],
          is_verified: Boolean(details?.is_verified),
          is_deleted: Boolean(details?.is_deleted),
          verified_label: details?.is_verified ? 'Verified' : 'Unverified',
          status_label: details?.is_deleted ? 'Deleted' : 'Active',
        }
      }),
    [current.rows, companyId],
  )

  const view = useListView(rows, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS })

  /* ---------------- The dialog ----------------
     `session` changes on every opening and is the dialog's `key`, so each
     one starts from fresh values - form, search and found vendor alike.
     `vendor` is kept through the closing animation so the dialog does not
     change mode as it fades out. */
  const [dialog, setDialog] = useState({ open: false, vendor: null, session: 0 })

  const openDialog = (vendor) => setDialog((previous) => ({ open: true, vendor, session: previous.session + 1 }))

  const closeDialog = () => setDialog((previous) => ({ ...previous, open: false }))

  const handleSaved = () => {
    closeDialog()
    reload()
  }

  const addButton = (
    <Button type="button" size="sm" icon={Plus} onClick={() => openDialog(null)} disabled={!companyId}>
      Add Vendor
    </Button>
  )

  /* ---------------- What fills the card ---------------- */
  const renderList = () => {
    if (!companyId) {
      if (companyStatus === 'idle' || companyStatus === 'loading') return <ListSkeleton />

      return (
        <StateMessage icon={Truck} title="No company selected">
          Choose a company in the header to see its vendors.
        </StateMessage>
      )
    }

    if (loading && rows.length === 0) return <ListSkeleton />

    // Nothing tries again on its own; Retry is the only way.
    if (current.status === 'failed' && rows.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load vendors"
          action={<RetryButton onClick={reload} />}
        >
          {current.error}
        </StateMessage>
      )
    }

    // An empty list is an answer, not a failure.
    if (rows.length === 0) {
      return (
        <StateMessage icon={Truck} title="No vendors found" action={addButton}>
          Add your first vendor to start buying against it.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters view={view} searchPlaceholder="Search ledger, contact, GST or city" />

        {view.total === 0 ? (
          <StateMessage icon={Truck} title="No matching vendors">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          /* Who the vendor is, where it is and how it stands - WhatsApp, the
             address and the country are in the form, not here, to keep this
             to what is looked at. On a narrow screen it scrolls sideways
             inside its own box, never the page, and the Actions column stays
             pinned on the right while it does. */
          <DataTable
            defaultColumnWidth={120}
            head={
              <>
                <SortableHead view={view} field="ledger_name" width={180}>
                  Vendor Name
                </SortableHead>
                <SortableHead view={view} field="company_name" width={140}>
                  Company
                </SortableHead>
                <SortableHead view={view} field="contact" width={140}>
                  Contact
                </SortableHead>
                <SortableHead view={view} field="email" width={200}>
                  Email
                </SortableHead>
                <SortableHead view={view} field="gst_no" width={160}>
                  GST No.
                </SortableHead>
                <SortableHead view={view} field="pan_no" width={135}>
                  PAN No.
                </SortableHead>
                <SortableHead view={view} field="city">
                  City
                </SortableHead>
                <SortableHead view={view} field="state">
                  State
                </SortableHead>
                <SortableHead view={view} field="overall_rating" width={90}>
                  Rating
                </SortableHead>
                <SortableHead view={view} field="verified_label" width={135}>
                  Verification
                </SortableHead>
                <SortableHead view={view} field="status_label" width={95}>
                  Status
                </SortableHead>
                <PlainHead width={72} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((row) => (
              <TableRow key={row.key} className="text-brand">
                <TableCell className="font-medium" title={row.ledger_name}>
                  {orDash(row.ledger_name)}
                </TableCell>
                <TableCell title={row.company_name}>{orDash(row.company_name)}</TableCell>
                <TableCell>{orDash(row.contact)}</TableCell>
                <TableCell title={row.email}>{orDash(row.email)}</TableCell>
                <TableCell>{orDash(row.gst_no)}</TableCell>
                <TableCell>{orDash(row.pan_no)}</TableCell>
                <TableCell>{orDash(row.city)}</TableCell>
                <TableCell>{orDash(row.state)}</TableCell>
                <TableCell>
                  <RatingSummary label={row.ledger_name} rating={row.rating} />
                </TableCell>
                <TableCell>
                  <YesNo value={row.is_verified} yes="Verified" no="Unverified" />
                </TableCell>
                <TableCell>
                  <YesNo value={!row.is_deleted} yes="Active" no="Deleted" />
                </TableCell>
                <TableCell className="text-right">
                  {/* Edit alone, in the look RowActions gives it - see the
                      note at the top on why there is no Delete beside it. */}
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-sm"
                    icon={Pencil}
                    tooltip="Edit"
                    aria-label={`Edit ${row.ledger_name ?? 'vendor'}`}
                    onClick={() => openDialog(row.source)}
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
      <Panel
        title="Vendor List"
        meta={companyId && rows.length > 0 ? `(Total Count: ${rows.length})` : undefined}
        // Add Vendor lives in the header, not on the filter row, so it is
        // there whatever the card is showing - a loading list, an error, or
        // a search that matched nothing.
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={reload}
              disabled={!companyId || loading}
              aria-label="Refresh vendor list"
            >
              <RefreshCw className={cn(loading && companyId && 'animate-spin')} />
              Refresh
            </Button>
            {addButton}
          </div>
        }
      >
        {/* A failed refresh with rows still on screen: they stay, and this
            says why they have not changed. */}
        {current.status === 'failed' && rows.length > 0 ? (
          <InlineAlert action={<RetryButton onClick={reload} />}>{current.error}</InlineAlert>
        ) : null}

        {renderList()}
      </Panel>

      <VendorFormModal
        key={dialog.session}
        open={dialog.open}
        onOpenChange={(next) => {
          if (!next) closeDialog()
        }}
        vendor={dialog.vendor}
        companyId={companyId}
        ledgers={ledgers}
        // Until this company's ledgers have arrived the dropdown is loading -
        // unless the request for them failed, which it says.
        ledgersStatus={ledgersReady || ledgerStatus === 'failed' ? ledgerStatus : 'loading'}
        ledgersError={ledgerStatus === 'failed' ? ledgerError : null}
        onRetryLedgers={() => dispatch(fetchLedgers({ companyId, force: true }))}
        onSaved={handleSaved}
      />
    </>
  )
}

/**
 * A vendor's rating in one short cell: the overall rating the backend sent,
 * with the nine ratings behind it in a popover - so the table has one rating
 * column, not ten. A popover rather than a tooltip, as it is a small table
 * of its own and has to open on a tap as well as on a hover.
 *
 * The overall rating is shown exactly as it arrived, and only when it did:
 * a vendor rated before the backend has worked one out shows "--" in its
 * place, and its ratings can still be opened.
 */
function RatingSummary({ label, rating }) {
  const overall = rating?.[VENDOR_OVERALL_RATING]
  const rated = VENDOR_RATING_CRITERIA.some((name) => hasScore(rating?.[name]))
  if (!hasScore(overall) && !rated) return '--'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${hasScore(overall) ? `Overall rating ${overall}` : 'Ratings'}${label ? ` of ${label}` : ''} - show the ratings`}
          className="inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          {hasScore(overall) ? overall : '--'}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 space-y-2 p-3">
        <p className="font-semibold text-primary">Vendor Rating</p>

        <dl className="space-y-1.5 text-xs">
          {VENDOR_RATING_CRITERIA.map((name) => (
            <div key={name} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{name}</dt>
              <dd className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
                {hasScore(rating?.[name]) ? (
                  <>
                    <StarRating label={name} value={rating[name]} max={VENDOR_RATING_MAX} readOnly size="sm" />
                    <span className="w-6 text-right">{rating[name]}</span>
                  </>
                ) : (
                  '--'
                )}
              </dd>
            </div>
          ))}
        </dl>

        {hasScore(overall) ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold text-brand">
            <span>{VENDOR_OVERALL_RATING}</span>
            <span>{overall}</span>
          </div>
        ) : null}

        <PopoverArrow />
      </PopoverContent>
    </Popover>
  )
}

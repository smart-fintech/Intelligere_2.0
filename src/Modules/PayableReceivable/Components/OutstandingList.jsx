import { Fragment, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeftRight, Download, IndianRupee, 
  // Plus,
   RefreshCw, SearchX, X } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Field } from '@/Components/Common/FormFields'
import { Loader } from '@/Components/Common/Loader'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { TableCell, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { PR_SOURCE_TITLE } from '@/Constants/payableReceivable'
import { useListView } from '@/Hooks/useListView'
import { invalidateQueries, useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import OpeningBalanceModal from '@/Modules/PayableReceivable/Components/OpeningBalanceModal'
import PaymentModal from '@/Modules/PayableReceivable/Components/PaymentModal'
import {
  NO_FILTERS,
  checkCreditDays,
  filterParties,
  findInvoice,
  hasFilters,
  invoiceId,
  overdueDays,
  overdueText,
  pickSelected,
  readOutstanding,
} from '@/Modules/PayableReceivable/payableReceivable'
import { ExpandButton, LineGrid } from '@/Modules/SalesInvoice/History/InventorySalesOrderHistory'
import { createOutstandingPdf, outstandingPdfName } from '@/Modules/PayableReceivable/outstandingPdf'
import { deleteEntry, getOutstanding, updateEntry } from '@/Services/payableReceivableService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { downloadPdf } from '@/Utils/pdf'

/**
 * ONE LIST - Payable or Receivable, the same component with `source` saying
 * which: party -> its invoices -> an invoice's partial payments.
 *
 *   Filters        due date range, overdue by at least N days, at least an
 *                  amount, one or several parties (all in the browser, no
 *                  request), on one row
 *   Paging         the parties, and each party's invoices within it - in the
 *                  browser, as the API sends the whole list at once. A filter
 *                  changed goes back to page 1 of both.
 *   Tick boxes     per invoice, and per party for all its invoices the filters
 *                  leave, on every page of them. Each party's are its own.
 *   per party      Download PDF: its ticked invoices the filters still show,
 *                  as the old screen did; with none ticked, the whole party,
 *                  whatever the filters and pages show. Add Opening Balance.
 *   per invoice    Credit Days (PUT), Record Payment (PUT: partial or full),
 *                  Delete (DELETE, asked in a popover)
 *
 * The screen remounts it for another list or company (`key`), so what is open
 * and filtered never carries across; the data itself is in the shared cache
 * under [RECEIVABLE_PAYABLE, companyName, source], one company's never shown
 * for another's. After a change succeeds the list is read again; the filters
 * and the ticks stay, a tick on an invoice that has gone going with it.
 *
 *   syncing        Tally is working: the list area is the loader
 *   syncActions    the screen's Last Sync and Sync Now, for the header
 *   onRefresh      also runs on the header's Refresh
 *   emptyHint      what to say when there is nothing to list
 */

const NO_PARTIES = []
const INITIAL_SORT = { field: 'name', direction: 'asc' }

const PARTIAL_COLUMNS = [
  { key: 'date', label: 'Payment Date', min: 7, value: (payment) => formatDate(payment.paymentDate) },
  { key: 'bill', label: 'Bill Date', min: 7, value: (payment) => formatDate(payment.billDate) },
  { key: 'amount', label: 'Amount', min: 7, right: true, value: (payment) => formatIndianCurrency(payment.amount) },
]

const INVOICE_COLUMN_COUNT = 8
const ALL_INVOICES = 'All Invoices'

function OverdueCell({ dueDate }) {
  const days = overdueDays(dueDate)
  return <span className={cn(days > 0 && 'font-medium text-destructive')}>{overdueText(days)}</span>
}

/** All, some or none of these ids are ticked, as a tick box shows it. */
const tickState = (ids, selected) => {
  const ticked = ids.filter((id) => selected.has(id)).length
  if (ticked === 0) return false
  return ticked === ids.length ? true : 'indeterminate'
}

/**
 * An invoice's credit days, always open to change. A `key` with the saved value
 * starts it again once the list comes back with a new one; a failed save leaves
 * what was typed.
 */
function CreditDaysCell({ invoice, onSave }) {
  const saved = invoice.creditDays === null ? '' : String(invoice.creditDays)
  const [days, setDays] = useState(saved)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const problem = checkCreditDays(days)
    if (problem) {
      toast.error(problem)
      return
    }
    setSaving(true)
    await onSave(Number(days))
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Field
        type="number"
        min="1"
        step="1"
        aria-label={`Credit days of ${invoice.invoiceNo}`}
        value={days}
        disabled={saving}
        onChange={(event) => setDays(event.target.value)}
        className="w-14"
        inputClassName="h-8 px-2"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Submit credit days of ${invoice.invoiceNo}`}
        loading={saving}
        disabled={days === saved}
        onClick={submit}
      >
        Submit
      </Button>
    </div>
  )
}

/** A party's invoices, with their own paging. `renderInvoice` draws one, and what opens under it. */
function PartyInvoices({ invoices, renderInvoice }) {
  const view = useListView(invoices)

  return (
    <>
      <DataTable
        head={
          <>
            <PlainHead width={44}>
              <span className="sr-only">Select</span>
            </PlainHead>
            <PlainHead width={140}>Invoice No.</PlainHead>
            <PlainHead width={100}>Bill Date</PlainHead>
            <PlainHead width={100}>Due Date</PlainHead>
            <PlainHead width={160}>Credit Days</PlainHead>
            <PlainHead width={110} className="text-right">
              Outstanding
            </PlainHead>
            <PlainHead width={140}>Status</PlainHead>
            <PlainHead width={150} className="text-right">
              Actions
            </PlainHead>
          </>
        }
      >
        {view.rows.map((invoice) => renderInvoice(invoice))}
      </DataTable>
      <TablePager view={view} />
    </>
  )
}

export default function OutstandingList({ companyName, companyId, source, syncing, syncActions, onRefresh, emptyHint }) {
  const outstanding = useQuery({
    key: [QUERY.RECEIVABLE_PAYABLE, companyName, source],
    fetch: () => getOutstanding(companyName, source).then(readOutstanding),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const parties = outstanding.data?.parties ?? NO_PARTIES
  const loading = outstanding.status === 'loading'
  const failed = outstanding.status === 'failed'

  /* ---------------- Filters ---------------- */
  const partyNames = useMemo(() => parties.map((party) => party.name).sort((a, b) => a.localeCompare(b)), [parties])
  const [chosenFilters, setFilters] = useState(NO_FILTERS)
  // A chosen party that has since left the list (all paid) no longer narrows it.
  const filters = useMemo(
    () => ({ ...chosenFilters, parties: chosenFilters.parties.filter((name) => partyNames.includes(name)) }),
    [chosenFilters, partyNames],
  )
  const narrowed = useMemo(() => filterParties(parties, filters), [parties, filters])
  const view = useListView(narrowed, { initialSort: INITIAL_SORT })
  const filtered = hasFilters(filters)
  // A new value here starts each party's invoices again from their first page.
  const filterKey = JSON.stringify(filters)

  const setFilter = (changes) => {
    setFilters((previous) => ({ ...previous, ...changes }))
    view.setPage(1)
  }

  const overallTotal = useMemo(() => narrowed.reduce((sum, party) => sum + party.total, 0), [narrowed])

  /* ---------------- What is ticked ---------------- */
  const [selected, setSelected] = useState(() => new Set())
  const [downloading, setDownloading] = useState(null) // the party whose PDF is being made

  const tick = (ids, on) =>
    setSelected((previous) => {
      const next = new Set(previous)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })

  /** `ticked`: the party's ticked invoices as pickSelected gives them - empty for the whole party. */
  const downloadParty = async (name, ticked) => {
    const whole = ticked.length === 0
    setDownloading(name)
    try {
      const bytes = await createOutstandingPdf({
        companyName,
        source,
        // From the list as it came, not as filtered: all of it means all of it.
        parties: whole ? parties.filter((party) => party.name === name) : ticked,
        heading: whole ? ALL_INVOICES : undefined,
      })
      downloadPdf(bytes, outstandingPdfName(companyName, source, name, !whole))
    } catch (failure) {
      toast.error(failure.message || 'The PDF could not be made.')
    } finally {
      setDownloading(null)
    }
  }

  /* ---------------- What is open ---------------- */
  const [openParties, setOpenParties] = useState({})
  const [openInvoices, setOpenInvoices] = useState({})
  const toggle = (setOpen, key) => setOpen((previous) => ({ ...previous, [key]: !previous[key] }))

  /* ---------------- Changing an entry ---------------- */
  const [paying, setPaying] = useState(null) // { party, invoice }
  const [opening, setOpening] = useState(null) // { ledger } - '' from the header
  const [confirming, setConfirming] = useState(null) // `${party}|${invoice.key}`
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (party, invoice) => {
    setDeleting(true)
    try {
      const reply = await deleteEntry({
        company_name: companyName,
        type: source,
        ledger_name: party,
        invoice_no: invoice.invoiceNo,
      })
      toast.success(reply?.msg || 'Entry deleted.')
      await outstanding.reload()
      setConfirming(null)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  // The PUT is the same as a payment's; only `credit_days` is sent, as the old screen did.
  const saveCreditDays = async (party, invoice, days) => {
    try {
      const reply = await updateEntry({
        company_name: companyName,
        type: source,
        ledger_name: party,
        invoice_no: invoice.invoiceNo,
        credit_days: days,
      })
      const data = await outstanding.reload()
      const now = data ? findInvoice(data.parties, party, invoice.key) : null
      // A backend that ignores the field still answers { msg } - never call that saved.
      if (now && Number(now.creditDays) !== days) toast.error('The server replied, but the credit days were not changed.')
      else toast.success(reply?.msg || 'Credit days saved.')
    } catch (failure) {
      toast.error(failure.message)
    }
  }

  /* ---------------- The list area ---------------- */
  const renderInvoice = (party, invoice) => {
    const openKey = `${party.name}|${invoice.key}`
    const showPartial = Boolean(openInvoices[openKey]) && invoice.partial.length > 0

    return (
      <Fragment key={invoice.key}>
        <TableRow>
          <TableCell>
            <Checkbox
              aria-label={`Select ${invoice.invoiceNo}`}
              checked={selected.has(invoiceId(party.name, invoice))}
              onCheckedChange={(on) => tick([invoiceId(party.name, invoice)], on === true)}
            />
          </TableCell>
          <TableCell title={invoice.invoiceNo}>{orDash(invoice.invoiceNo)}</TableCell>
          <TableCell>{formatDate(invoice.billDate)}</TableCell>
          <TableCell>{formatDate(invoice.dueDate)}</TableCell>
          <TableCell>
            <CreditDaysCell
              key={String(invoice.creditDays)}
              invoice={invoice}
              onSave={(days) => saveCreditDays(party.name, invoice, days)}
            />
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatIndianCurrency(invoice.amount)}</TableCell>
          <TableCell>
            <OverdueCell dueDate={invoice.dueDate} />
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1.5">
              {invoice.partial.length > 0 ? (
                <ExpandButton
                  open={showPartial}
                  label={`partial payments of ${invoice.invoiceNo}`}
                  onClick={() => toggle(setOpenInvoices, openKey)}
                />
              ) : null}
              <Button
                type="button"
                variant="iconEdit"
                size="icon-sm"
                icon={IndianRupee}
                tooltip="Record payment"
                aria-label={`Record payment for ${invoice.invoiceNo}`}
                onClick={() => setPaying({ party: party.name, invoice })}
              />
              <RowActions
                label={invoice.invoiceNo}
                deleteConfirm={{
                  open: confirming === openKey,
                  onOpenChange: (next) => setConfirming(next ? openKey : null),
                  title: 'Delete entry?',
                  description: `Delete invoice "${invoice.invoiceNo}" of ${party.name}?`,
                  confirmLabel: 'Delete',
                  busy: deleting,
                  onConfirm: () => handleDelete(party.name, invoice),
                }}
              />
            </div>
          </TableCell>
        </TableRow>

        {showPartial ? (
          <TableRow>
            <TableCell colSpan={INVOICE_COLUMN_COUNT} className="bg-muted/30 p-3">
              <LineGrid columns={PARTIAL_COLUMNS} items={invoice.partial} label={`Partial payments of ${invoice.invoiceNo}`} />
            </TableCell>
          </TableRow>
        ) : null}
      </Fragment>
    )
  }

  const renderParty = (party) => {
    const open = Boolean(openParties[party.name])
    const ids = party.invoices.map((invoice) => invoiceId(party.name, invoice))
    const ticked = pickSelected([party], selected)
    const tickedCount = ticked[0]?.invoices.length ?? 0

    return (
      <section key={party.name} className="rounded-md border border-border">
        {/* Two groups, so on a narrow screen the amount and buttons wrap together under the name. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
          <div className="flex min-w-[min(100%,14rem)] flex-1 items-center gap-2">
            {/* The span takes the tooltip: on the tick box itself its state would overwrite the box's own. */}
            <Tooltip text="Select All">
              <span className="inline-flex">
                <Checkbox
                  aria-label={`Select all invoices of ${party.name}`}
                  checked={tickState(ids, selected)}
                  onCheckedChange={(on) => tick(ids, on === true)}
                />
              </span>
            </Tooltip>
            <ExpandButton open={open} label={`invoices of ${party.name}`} onClick={() => toggle(setOpenParties, party.name)} />
            <h3 className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere] text-brand">
              {party.name} <span className="font-normal text-muted-foreground">({party.invoices.length})</span>
            </h3>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm font-semibold tabular-nums">{formatIndianCurrency(party.total)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Download}
              aria-label={`Download PDF of ${party.name}`}
              tooltip={tickedCount > 0 ? 'Only the ticked invoices' : 'All invoices of this party'}
              loading={downloading === party.name}
              onClick={() => downloadParty(party.name, ticked)}
            >
              {tickedCount > 0 ? `Download PDF (${tickedCount})` : 'Download PDF'}
            </Button>
            {/* <Button type="button" variant="outline" size="sm" icon={Plus} onClick={() => setOpening({ ledger: party.name })}>
              Opening Balance
            </Button> */}
          </div>
        </div>

        {open ? (
          <div className="px-3 pb-3">
            <PartyInvoices key={filterKey} invoices={party.invoices} renderInvoice={(invoice) => renderInvoice(party, invoice)} />
          </div>
        ) : null}
      </section>
    )
  }

  const renderList = () => {
    // The whole list area is the loader until Tally is done - never an empty list in between.
    if (syncing) {
      return (
        <Loader
          variant="page"
          label={`Syncing from Tally for ${companyName}...`}
          description="The list will appear as soon as the sync finishes."
        />
      )
    }

    if (!outstanding.data) {
      if (failed) {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the list"
            action={<RetryButton onClick={outstanding.reload} />}
          >
            {outstanding.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={5} />
    }

    if (parties.length === 0) {
      return (
        <StateMessage icon={ArrowLeftRight} title="Nothing outstanding">
          {outstanding.data.message || emptyHint}
        </StateMessage>
      )
    }

    return (
      <>
        {failed ? (
          <InlineAlert action={<RetryButton onClick={outstanding.reload} />}>{outstanding.error}</InlineAlert>
        ) : null}

        {/* One row from 1200px, the Party Name box giving up width so that Clear stays on it; wrapping
            on anything narrower, with Clear always beside Party Name. Every field its label over a box
            of the same height. From the top, so the rest stay put when the party chips grow a row. */}
        <div className="mb-3 flex flex-wrap items-start gap-3 min-[1200px]:flex-nowrap">
          {/* The due date, From and To under their own labels as on Ledger Export; neither passes the other. */}
          <Field
            id="pr-filter-from"
            label="From Date"
            type="date"
            value={filters.dueFrom}
            max={filters.dueTo || undefined}
            onChange={(event) => setFilter({ dueFrom: event.target.value })}
            className="w-full sm:w-40 min-[1200px]:shrink-0"
          />
          <Field
            id="pr-filter-to"
            label="To Date"
            type="date"
            value={filters.dueTo}
            min={filters.dueFrom || undefined}
            onChange={(event) => setFilter({ dueTo: event.target.value })}
            className="w-full sm:w-40 min-[1200px]:shrink-0"
          />
          <Field
            id="pr-filter-overdue"
            label="Overdue Days"
            type="number"
            min="0"
            placeholder="At least"
            value={filters.minOverdue}
            onChange={(event) => setFilter({ minOverdue: event.target.value })}
            className="w-full sm:w-28 min-[1200px]:shrink-0"
          />
          <Field
            id="pr-filter-amount"
            label="Amount"
            type="number"
            min="0"
            placeholder="At least"
            value={filters.minAmount}
            onChange={(event) => setFilter({ minAmount: event.target.value })}
            className="w-full sm:w-32 min-[1200px]:shrink-0"
          />
          <div className="flex w-full min-w-0 items-start gap-3 sm:w-96 min-[1200px]:max-w-[30rem] min-[1200px]:flex-1">
            <MultiSelectField
              id="pr-party-filter"
              label="Party Name"
              placeholder="All parties"
              searchPlaceholder="Search party"
              options={partyNames}
              value={filters.parties}
              onChange={(names) => setFilter({ parties: names })}
              className="min-w-0 flex-1 sm:max-w-96 [&>span:first-child]:block"
            />
            {filtered ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                className="mt-5.5 shrink-0"
                onClick={() => {
                  setFilters(NO_FILTERS)
                  view.setPage(1)
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No entries match">
            Change or clear the filters to see more.
          </StateMessage>
        ) : (
          <>
            <div className="space-y-2">{view.rows.map(renderParty)}</div>
            <TablePager view={view} always />
          </>
        )}
      </>
    )
  }

  return (
    <Panel
      title={PR_SOURCE_TITLE[source]}
      meta={outstanding.data ? ` (${narrowed.length}) - Total: ${formatIndianCurrency(overallTotal)}` : null}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {syncActions}
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            disabled={syncing}
            onClick={() => {
              outstanding.reload()
              onRefresh?.()
            }}
          >
            Refresh
          </Button>
          {/* <Button type="button" variant="outline" size="sm" icon={Plus} disabled={syncing} onClick={() => setOpening({ ledger: '' })}>
            Add Opening Balance
          </Button> */}
        </div>
      }
    >
      {renderList()}

      {paying ? (
        <PaymentModal
          companyName={companyName}
          source={source}
          party={paying.party}
          invoice={paying.invoice}
          onClose={() => setPaying(null)}
          onSaved={async (full) => {
            const data = await outstanding.reload()
            const left = full && data ? findInvoice(data.parties, paying.party, paying.invoice.key) : null
            setPaying(null)
            // A backend that ignores `data` still answers { msg } - never call that paid.
            return left && left.amount === paying.invoice.amount ? 'The server replied, but the invoice is still open.' : undefined
          }}
        />
      ) : null}

      {opening ? (
        <OpeningBalanceModal
          companyId={companyId}
          partyNames={partyNames}
          initialLedger={opening.ledger}
          onClose={() => setOpening(null)}
          onSaved={async () => {
            // The other list is read when it is next opened; this one now.
            invalidateQueries(QUERY.RECEIVABLE_PAYABLE)
            await outstanding.reload()
            setOpening(null)
          }}
        />
      ) : null}
    </Panel>
  )
}

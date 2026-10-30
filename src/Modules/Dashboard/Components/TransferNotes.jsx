/**
 * The Transfer Note tab of Product (Inventory Management only): the stock
 * the company has moved between its warehouses, one note at a time.
 *
 *   Warehouse    whose notes are listed - the request's warehouse_id. The
 *                main user: All warehouses (none sent) or one. A sub user:
 *                only the warehouses they were given (their company record's
 *                warehouse_id), the first to begin with - never All.
 *   the list     Transfer No., Transfer Date, From / To Warehouse, Vehicle
 *                No., Products, Created At - searched, filtered by From / To
 *                Warehouse and From / To Date (each with its x, Clear for
 *                all), sorted and paged in the browser (no request) - and
 *                per note: its PDF, its details (the arrow), Edit and Delete
 *   details      Transfer Details, both warehouses' details, and the products
 *                - SKU (its details on hover), HSN, unit, quantity, remark and
 *                where it was moved from (`moved`: sr_no and quantity)
 *
 * WHAT REACHES THE NETWORK
 *   the tab first shown / another company or warehouse   the list (useTransferNotes)
 *   Refresh / Retry                                      the list
 *   Save / Update in the dialog      POST / PUT, then the list - once, by the save
 *   Delete, confirmed in its popover DELETE { company_name, id }, then the list
 *
 * A saved note's PDF (its returned transfer_note_file) opens at once. A sub
 * user without Create, Edit or Delete on Product Details is not offered them
 * (useSectionAccess).
 */

import { Fragment, useCallback, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeftRight, FileText, Plus, RefreshCw, X } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useListView } from '@/Hooks/useListView'
import useProducts from '@/Hooks/useProducts'
import useSectionAccess, { useAccessScope } from '@/Hooks/useSectionAccess'
import useTransferNotes from '@/Hooks/useTransferNotes'
import useWarehouseOptions from '@/Hooks/useWarehouseOptions'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { readProducts } from '@/Modules/Dashboard/productList'
import { NO_FILTERS, matchesFilters } from '@/Modules/Dashboard/transferNotes'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import HistoryPdfModal from '@/Modules/SalesInvoice/History/HistoryPdfModal'
import { ExpandButton, LineGrid } from '@/Modules/SalesInvoice/History/InventorySalesOrderHistory'
import { ACCESS_SECTIONS } from '@/Services/accessService'
import { deleteTransferNote } from '@/Services/inventoryService'
import { orDash } from '@/Utils/display'
import TransferNoteFormModal from './TransferNoteFormModal'

const SEARCH_FIELDS = ['transferNo', 'fromName', 'toName', 'vehicleNo', 'declaration']
const ALL = 'all'


/** One date filter on the row - the browser's date box, compact, with an x to clear it. */
export function DateFilter({ label, value, min, max, onChange }) {
  return (
    <div className="flex w-full items-center gap-1.5 sm:w-auto">
      <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>
      <Field
        type="date"
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="w-40"
        inputClassName="h-8"
      >
        {value ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            title="Clear"
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-8 my-auto flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </Field>
    </div>
  )
}

/** A sub user's own warehouses - their company record's warehouse_id, as text. */
const assignedWarehouses = (company) => (Array.isArray(company?.warehouse_id) ? company.warehouse_id : company?.warehouse_id ? [company.warehouse_id] : []).map(String)

/* ---------------- What a note opens out into ---------------- */

const HEADING = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const skuText = (details) =>
  Object.entries(details)
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ')

const LINE_COLUMNS = [
  { key: 'name', label: 'Product Name', min: 9, fr: 1.5, value: (line) => line.name },
  { key: 'sku', label: 'SKU Code', min: 7, optional: true, value: (line) => line.skuCode, show: (line) => <SkuCode code={line.skuCode} details={line.skuDetails} /> },
  { key: 'details', label: 'SKU Details', min: 10, fr: 1.5, optional: true, value: (line) => skuText(line.skuDetails) },
  { key: 'hsn', label: 'HSN Code', min: 5, optional: true, value: (line) => line.hsn },
  { key: 'unit', label: 'Per Unit', min: 4.5, optional: true, value: (line) => line.unit },
  { key: 'quantity', label: 'Quantity', min: 5, right: true, value: (line) => line.quantity },
  { key: 'remark', label: 'Remark', min: 7, optional: true, value: (line) => line.remark },
  {
    key: 'moved',
    label: 'Moved (Sr No. - Qty)',
    min: 8,
    optional: true,
    value: (line) => line.moved,
    show: (line) =>
      line.moved.length === 0
        ? '--'
        : line.moved.map((entry, index) => (
            <span key={`${entry.srNo}#${index}`} className="block tabular-nums">
              Sr {orDash(entry.srNo)} - {orDash(entry.quantity)}
            </span>
          )),
  },
]

/** One warehouse's details - its card in the opened note. */
function WarehouseCard({ title, warehouse }) {
  const rows = [
    ['Name', warehouse.name],
    ['Address', warehouse.address],
    ['Contact', warehouse.contact],
    ['Email', warehouse.email],
    ['Contact Person', warehouse.contactPerson],
  ]
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className={cn(HEADING, 'mb-1.5')}>{title}</p>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{orDash(value)}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

function NoteDetails({ note }) {
  const transfer = [
    ['Transfer No.', note.transferNo],
    ['Transfer Date', note.transferDate],
    ['Vehicle No.', note.vehicleNo],
    ['Declaration', note.declaration],
  ]
  return (
    <div className="animate-in space-y-3 px-3 py-3 duration-200 fade-in-0 slide-in-from-top-1" data-testid="transfer-note-details">
      <section className="space-y-1.5">
        <p className={HEADING}>Transfer Details</p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-border bg-card p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {transfer.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{orDash(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="space-y-1.5">
        <p className={HEADING}>Warehouse Details</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <WarehouseCard title="From Warehouse" warehouse={note.from} />
          <WarehouseCard title="To Warehouse" warehouse={note.to} />
        </div>
      </section>
      <section className="space-y-1.5">
        <p className={HEADING}>Products ({note.lines.length})</p>
        {note.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">No products came with this note.</p>
        ) : (
          <LineGrid columns={LINE_COLUMNS} items={note.lines} label={`Products of transfer ${note.transferNo || ''}`} testId="transfer-note-line" />
        )}
      </section>
    </div>
  )
}

/* ---------------- The dialog, with the product list it needs ---------------- */

/** Mounted only while the dialog is wanted, so the product list is asked for (or reused) only then. */
function TransferNoteDialog(props) {
  const productRows = useProducts()
  const list = useMemo(() => readProducts(productRows.rows), [productRows.rows])
  return <TransferNoteFormModal {...props} products={{ list, status: productRows.status }} />
}

/* ---------------- The page ---------------- */

export default function TransferNotes() {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const { subUser } = useAccessScope()
  const access = useSectionAccess(ACCESS_SECTIONS.PRODUCT)
  const warehouseOptions = useWarehouseOptions(true)

  /* ---------------- Whose notes ---------------- */
  const assigned = useMemo(() => assignedWarehouses(activeCompany), [activeCompany])
  const filterOptions = useMemo(() => {
    if (!subUser) return [{ value: ALL, label: 'All warehouses' }, ...warehouseOptions.options]
    // A sub user's own, named where the list names them.
    return assigned.map((id) => warehouseOptions.options.find((option) => option.value === id) ?? { value: id, label: `Warehouse ${id}` })
  }, [subUser, assigned, warehouseOptions.options])
  const [chosenWarehouse, setChosenWarehouse] = useState(ALL)
  // One no longer offered (another company) falls back to the first.
  const warehouse = filterOptions.some((option) => option.value === chosenWarehouse) ? chosenWarehouse : (filterOptions[0]?.value ?? ALL)
  const fromChoices = subUser ? assigned : warehouseOptions.options.map((option) => option.value)

  const notes = useTransferNotes(warehouse === ALL ? '' : warehouse)
  const loading = notes.status === 'loading'

  /* ---------------- Search, filters, sort, pages ----------------
     The listing endpoint takes one warehouse_id and nothing else to filter
     by, so From / To Warehouse and the transfer date are applied here, to the
     notes already loaded - no request. Warehouses by id; dates as YYYY-MM-DD
     (dateInput, read from the DD/MM/YYYY the list sends), so they compare as
     dates. All of them together. */
  const [filters, setFilters] = useState(NO_FILTERS)
  const [dateError, setDateError] = useState('')
  const filtered = useMemo(() => notes.rows.filter((note) => matchesFilters(note, filters)), [notes.rows, filters])
  const view = useListView(filtered, { searchFields: SEARCH_FIELDS })
  const changeFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }))
    view.setPage(1)
  }
  /** A date box changed: a To Date before the From Date (or the reverse) is not taken. */
  const changeDate = (field, value) => {
    const next = { ...filters, [field]: value }
    if (next.fromDate && next.toDate && next.toDate < next.fromDate) {
      setDateError('To Date cannot be earlier than From Date.')
      return
    }
    setDateError('')
    changeFilter(field, value)
  }
  const filtersSet = Object.values(filters).some(Boolean)
  const clearFilters = () => {
    setFilters(NO_FILTERS)
    setDateError('')
    view.clear()
  }
  const filterView = { ...view, isFiltered: view.isFiltered || filtersSet, clear: clearFilters }

  // Each note open or not, by its key - kept across pages.
  const [openRows, setOpenRows] = useState(() => new Set())
  const toggle = (key) =>
    setOpenRows((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // The table's visible width: an opened row's details are kept to it, however far the table is scrolled.
  const [visibleWidth, setVisibleWidth] = useState(null)
  const measureTable = useCallback((box) => {
    if (!box) return undefined
    const observer = new ResizeObserver(([entry]) => setVisibleWidth(Math.floor(entry.contentRect.width)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  /* ---------------- The dialog and the PDF ----------------
     `session` changes on every opening and is the dialog's key, so each one
     starts from fresh values. */
  const [dialog, setDialog] = useState({ open: false, note: null, session: 0 })
  const openDialog = (note) => setDialog((current) => ({ open: true, note, session: current.session + 1 }))
  const closeDialog = () => setDialog((current) => ({ ...current, open: false }))
  // { documentNo, pdfUrl, documentDate } - HistoryPdfModal's row.
  const [pdf, setPdf] = useState(null)
  const viewPdf = (note) => setPdf({ documentNo: `Transfer Note ${note.transferNo || ''}`.trim(), pdfUrl: note.pdfUrl, documentDate: note.dateInput })

  const handleSaved = (reply, form) => {
    closeDialog()
    // The note's PDF, as the save returned it - the list is read again by the save itself.
    const url = String(reply?.transfer_note_file ?? '').trim()
    if (/^https?:\/\//i.test(url)) setPdf({ documentNo: `Transfer Note ${form.transferNo}`.trim(), pdfUrl: url, documentDate: form.transferDate })
  }

  /* ---------------- Delete ---------------- */
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const handleDelete = async () => {
    if (!confirming || deleting) return
    setDeleting(true)
    try {
      const reply = await deleteTransferNote({ companyName, id: confirming.id })
      toast.success(reply?.msg || 'Transfer Note deleted successfully')
      setConfirming(null)
    } catch (failure) {
      toast.error(failure.message || 'The Transfer Note could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  const createButton = access.create ? (
    <Button type="button" size="sm" icon={Plus} onClick={() => openDialog(null)} disabled={!companyName || fromChoices.length === 0}>
      Create Transfer Note
    </Button>
  ) : null

  const renderList = () => {
    if (notes.status === 'failed' && notes.rows.length === 0) {
      return (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the transfer notes" action={<RetryButton onClick={notes.reload} />}>
          {notes.error}
        </StateMessage>
      )
    }
    if ((loading || notes.status === 'idle') && notes.rows.length === 0) return <ListSkeleton rows={5} />
    if (notes.rows.length === 0) {
      return (
        <StateMessage icon={ArrowLeftRight} title="No transfer notes yet" action={createButton}>
          {warehouse === ALL ? 'Stock moved between warehouses shows here.' : 'No stock has been moved in or out of this warehouse yet.'}
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={filterView}
          searchPlaceholder="Search transfer no., warehouse or vehicle"
          actions={createButton}
          extra={
            <>
              <SelectField
                ariaLabel="From Warehouse"
                size="sm"
                className="w-full sm:w-44"
                value={filters.from}
                onValueChange={(value) => changeFilter('from', value)}
                onClear={() => changeFilter('from', '')}
                placeholder="From Warehouse"
                options={warehouseOptions.options}
                searchable={warehouseOptions.options.length > 8}
              />
              <SelectField
                ariaLabel="To Warehouse"
                size="sm"
                className="w-full sm:w-44"
                value={filters.to}
                onValueChange={(value) => changeFilter('to', value)}
                onClear={() => changeFilter('to', '')}
                placeholder="To Warehouse"
                options={warehouseOptions.options}
                searchable={warehouseOptions.options.length > 8}
              />
              <DateFilter label="From Date" value={filters.fromDate} max={filters.toDate} onChange={(value) => changeDate('fromDate', value)} />
              <DateFilter label="To Date" value={filters.toDate} min={filters.fromDate} onChange={(value) => changeDate('toDate', value)} />
            </>
          }
        />
        {dateError ? (
          <p className="-mt-1.5 mb-2 text-xs text-destructive" role="alert">
            {dateError}
          </p>
        ) : null}

        {view.total === 0 ? (
          <StateMessage
            icon={FileText}
            title="No matching transfer notes"
            action={
              <Button type="button" size="sm" variant="outline" icon={X} onClick={clearFilters}>
                Clear Filters
              </Button>
            }
          >
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <div className="text-brand" ref={measureTable}>
            <DataTable
              head={
                <>
                  <SortableHead view={view} field="transferNo" width={140}>
                    Transfer No.
                  </SortableHead>
                  <SortableHead view={view} field="dateInput" width={130}>
                    Transfer Date
                  </SortableHead>
                  <SortableHead view={view} field="fromName" width={170}>
                    From Warehouse
                  </SortableHead>
                  <SortableHead view={view} field="toName" width={170}>
                    To Warehouse
                  </SortableHead>
                  <SortableHead view={view} field="vehicleNo" width={140}>
                    Vehicle No.
                  </SortableHead>
                  <SortableHead view={view} field="productCount" width={100}>
                    Products
                  </SortableHead>
                  <SortableHead view={view} field="createdAt" width={170}>
                    Created At
                  </SortableHead>
                  <PlainHead width={190} className="text-right">
                    Actions
                  </PlainHead>
                </>
              }
            >
              {view.rows.map((note) => {
                const open = openRows.has(note.key)
                const name = note.transferNo || 'this transfer note'
                return (
                  <Fragment key={note.key}>
                    <TableRow className={cn('transition-opacity', loading && 'opacity-60')} data-testid="transfer-note-row">
                      <TableCell className="font-medium">{orDash(note.transferNo)}</TableCell>
                      <TableCell className="whitespace-nowrap">{orDash(note.transferDate)}</TableCell>
                      <TableCell title={note.fromName}>{orDash(note.fromName)}</TableCell>
                      <TableCell title={note.toName}>{orDash(note.toName)}</TableCell>
                      <TableCell>{orDash(note.vehicleNo)}</TableCell>
                      <TableCell className="tabular-nums">{note.productCount}</TableCell>
                      <TableCell className="whitespace-nowrap">{orDash(note.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="iconEdit"
                            size="icon-sm"
                            icon={FileText}
                            tooltip={note.pdfUrl ? 'View PDF' : 'No PDF yet'}
                            aria-label={`View the PDF of ${name}`}
                            disabled={!note.pdfUrl}
                            onClick={() => viewPdf(note)}
                          />
                          <ExpandButton open={open} label={`the details of ${name}`} onClick={() => toggle(note.key)} />
                          <RowActions
                            label={name}
                            onEdit={access.edit && note.id !== null ? () => openDialog(note) : undefined}
                            deleteConfirm={
                              access.delete && note.id !== null
                                ? {
                                    open: confirming?.key === note.key,
                                    onOpenChange: (next) => {
                                      // One delete at a time: no other row opens while one is on its way.
                                      if (!deleting) setConfirming(next ? note : null)
                                    },
                                    title: 'Delete Transfer Note?',
                                    description: (
                                      <>
                                        Are you sure you want to delete transfer note <strong>{note.transferNo || `#${note.id}`}</strong>? This cannot be undone.
                                      </>
                                    ),
                                    confirmLabel: deleting ? 'Deleting...' : 'Delete',
                                    busy: deleting,
                                    onConfirm: handleDelete,
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} wrap className="overflow-visible! bg-muted/40 p-0 py-0!">
                          <div className="sticky left-0" style={visibleWidth ? { width: visibleWidth - 2 } : undefined}>
                            <NoteDetails note={note} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </DataTable>
          </div>
        )}

        <TablePager view={view} />
      </>
    )
  }

  if (!companyName) {
    return (
      <Panel title="Transfer Notes">
        <StateMessage icon={ArrowLeftRight} title="No company selected">
          Choose a company in the header to see its transfer notes.
        </StateMessage>
      </Panel>
    )
  }

  return (
    <>
      <Panel
        title="Transfer Notes"
        meta={notes.rows.length > 0 ? `(Total Count: ${notes.rows.length})` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-52">
              <SelectField
                ariaLabel="Warehouse"
                size="sm"
                value={warehouse}
                onValueChange={(value) => {
                  setChosenWarehouse(value)
                  view.setPage(1)
                }}
                options={filterOptions}
                placeholder="Warehouse"
                searchable={filterOptions.length > 8}
              />
            </div>
            <Button type="button" size="sm" onClick={notes.reload} disabled={loading} aria-label="Refresh transfer notes">
              <RefreshCw className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      >
        {/* A failed refresh with notes still on screen: they stay, and this says why they have not changed. */}
        {notes.status === 'failed' && notes.rows.length > 0 ? <InlineAlert action={<RetryButton onClick={notes.reload} />}>{notes.error}</InlineAlert> : null}
        {renderList()}
      </Panel>

      {dialog.session > 0 ? (
        <TransferNoteDialog
          key={dialog.session}
          open={dialog.open}
          onOpenChange={(next) => {
            if (!next) closeDialog()
          }}
          note={dialog.note}
          companyName={companyName}
          warehouses={warehouseOptions.options}
          fromChoices={fromChoices}
          onSaved={handleSaved}
        />
      ) : null}

      <HistoryPdfModal row={pdf} onClose={() => setPdf(null)} />
    </>
  )
}

/**
 * The Compare Quotation section of Inventory Details (Inventory Management
 * only): what came of the requests for quotation a Sales Order sent its
 * vendors, chosen with the app's one view switch (ViewSwitch):
 *
 *   ( ) History   ( ) Upload Quotation
 *
 *   History            each Sales Order (`document_no`) as a row - with
 *                      Compare Quotations once a vendor has quoted
 *                      (QuotationCompareModal: past quotations, Raise a PO) -
 *                      that opens out into the vendors it asked. Each vendor:
 *                      its contact details, when it was asked, Quote Form (no
 *                      quotation yet) or Edit Quotation (QuotationFormModal),
 *                      and View Details - the request (RFQ), and its
 *                      quotation's Master Details, products and Other Details
 *   Upload Quotation   a vendor's filled-in quotation (.docx - the request's
 *                      own Word file, see quotationDocx), chosen and sent:
 *                      Choose File, the file by name with x, Submit
 *
 * History is open first. As in Inventory, a view is built the first time it
 * is chosen and then kept, hidden, while the other shows - a chosen file
 * survives a look at History.
 *
 * WHAT REACHES THE NETWORK
 *   History, first shown in a page session   inventory/AllRequestSO/ { company_name }
 *   History again, either view, any section  nothing - the answer is kept
 *                                            (useQuotationRequests)
 *   Submit                                   inventory/updated_quotation/ multipart
 *                                            file + company_name; accepted, the
 *                                            History is read again ONCE, and shown
 *   Quote Form / Edit Quotation saved        PUT inventory/updated_quotation/; the
 *                                            History is read again ONCE
 *   Compare Quotations                       inventory/compare_quotation/, each time
 *   another company in the header            that company's History, once
 *
 * AFTER SUBMIT
 *   accepted   the backend's own `msg`, the file cleared, History shown
 *   refused    the backend's own message - the file STAYS chosen, to correct
 *              and send again, and History is not read again
 */

import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, FilePenLine, FileText, GitCompareArrows, Star, Upload, X } from 'lucide-react'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { formatBytes } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useListView } from '@/Hooks/useListView'
import useQuotationRequests from '@/Hooks/useQuotationRequests'
import useWarehouses from '@/Hooks/useWarehouses'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { ExpandButton, LineGrid } from '@/Modules/SalesInvoice/History/InventorySalesOrderHistory'
import { getWarehouseId } from '@/Services/inventoryService'
import QuotationCompareModal from './QuotationCompareModal'
import QuotationFormModal from './QuotationFormModal'
import { uploadQuotation } from '@/Services/procurementService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate, isValidDate } from '@/Utils/date'

/** The vendor's quotation is the request's own Word file, filled in - the server reads it as such. */
const QUOTATION_FILE = '.docx'

const VIEWS = [
  { key: 'history', label: 'History', Page: QuotationHistory },
  { key: 'upload', label: 'Upload Quotation', Page: UploadQuotation },
]

export default function CompareQuotation() {
  const [current, setCurrent] = useState(VIEWS[0].key)
  // The views chosen so far - these stay mounted, as Inventory's do (see InventoryOverview).
  const [opened, setOpened] = useState([current])
  if (!opened.includes(current)) setOpened([...opened, current])

  return (
    <div className="space-y-3">
      <ViewSwitch
        options={VIEWS.map(({ key, label }) => ({ value: key, label }))}
        value={current}
        onValueChange={setCurrent}
        label="Compare Quotation view"
        idPrefix="compare-quotation-view"
        className="mx-auto w-fit max-w-full"
      />

      {VIEWS.filter(({ key }) => opened.includes(key)).map(({ key, Page }) => (
        <div key={key} hidden={key !== current}>
          {/* An accepted upload shows the History it has just refreshed. */}
          <Page onUploaded={() => setCurrent('history')} />
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* History                                                            */
/* ------------------------------------------------------------------ */

const when = (value) => (isValidDate(value) ? formatDate(value) : value)

const productColumns = (warehouseName) => [
  { key: 'name', label: 'Product Name', min: 10, fr: 2, value: (item) => item.name },
  // Its sku_details on hover (the shared SKU tooltip) - each line its own.
  { key: 'sku', label: 'SKU Code', min: 7, value: (item) => item.skuCode, optional: true, show: (item) => <SkuCode code={item.skuCode} details={item.skuDetails} /> },
  { key: 'hsn', label: 'HSN', min: 5, value: (item) => item.hsn, optional: true },
  { key: 'per', label: 'Per', min: 4, value: (item) => item.per, optional: true },
  { key: 'quantity', label: 'Qty', min: 4, right: true, value: (item) => item.quantity },
  { key: 'gst', label: 'GST (%)', min: 4.5, right: true, optional: true, value: (item) => item.gstRate },
  { key: 'warehouse', label: 'Warehouse', min: 8, optional: true, value: (item) => item.warehouseId, show: (item) => (item.warehouseId ? warehouseName(item.warehouseId) : '--') },
]

/** "credit_terms" -> "Credit Terms". */
const labelOf = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

/** What the earlier screen left out of the quotation's two detail tables - shown in the form, or not at all. */
const MASTER_HIDDEN = ['quotation_no', 'reference_no', 'advanced_percent_required']
const OTHER_HIDDEN = ['note', 'coverage_details', 'bank_ifsc', 'bank_name', 'bank_ac_no', 'bank_branch', 'declaration', 'authorised_signature_date', 'inclusions', 'exclusions']

/** A value of the quotation's details - a { name: amount } (Additional Charges) as a list. */
const detailValue = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return '--'
    return (
      <ul className="space-y-0.5">
        {entries.map(([name, amount]) => (
          <li key={name}>
            <span className="font-medium">{name}:</span> {String(amount ?? '')}
          </li>
        ))}
      </ul>
    )
  }
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '--'
  return String(value ?? '').trim() || '--'
}

/** One of the quotation's detail blocks, closed until its heading is pressed. */
function DetailToggle({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-brand outline-none hover:bg-brand-soft/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {title}
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open ? <div className="animate-in border-t border-border px-3 py-2 duration-200 fade-in-0 slide-in-from-top-1">{children}</div> : null}
    </div>
  )
}

/** Label and value, as many to a row as fit. */
function DetailGrid({ entries }) {
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">Nothing to show.</p>
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-muted-foreground">{labelOf(key)}</dt>
          <dd className="font-medium [overflow-wrap:anywhere]">{detailValue(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

const QUOTED_COLUMNS = [
  {
    key: 'name',
    label: 'Description',
    min: 12,
    fr: 2,
    value: (item) => item.Description,
    show: (item) => (
      <>
        {item.Description || '--'}
        {item.specification ? <span className="block text-muted-foreground">{item.specification}</span> : null}
      </>
    ),
  },
  { key: 'hsn', label: 'HSN', min: 5, optional: true, value: (item) => item.Hsn_code },
  { key: 'moq', label: 'MOQ', min: 4, right: true, optional: true, value: (item) => item.moq },
  { key: 'per', label: 'Per', min: 4, optional: true, value: (item) => item.Per },
  { key: 'qty', label: 'Qty', min: 4, right: true, value: (item) => item.Qty },
  { key: 'rate', label: 'Unit Rate', min: 6, right: true, value: (item) => item.unit_rate, show: (item) => formatIndianCurrency(item.unit_rate) },
  { key: 'discount', label: 'Discount (%)', min: 5.5, right: true, value: (item) => item.discount },
  { key: 'gst', label: 'GST (%)', min: 4.5, right: true, value: (item) => item.IGst_rate },
  { key: 'total', label: 'Total', min: 7, right: true, value: (item) => item.total, show: (item) => formatIndianCurrency(item.total) },
]

/** One vendor asked: who, Quote Form / Edit Quotation, and View Details. */
function VendorQuotation({ order, vendor, warehouseName, onQuote }) {
  const [open, setOpen] = useState(false)
  const { seller } = vendor
  const contact = [seller.email, seller.contact, seller.gstNo ? `GSTIN ${seller.gstNo}` : ''].filter(Boolean)
  const name = seller.name || vendor.key
  const hasQuote = Object.keys(vendor.master).length > 0
  const masterEntries = Object.entries(vendor.master).filter(([key]) => !MASTER_HIDDEN.includes(key))
  const otherEntries = Object.entries(vendor.other).filter(([key]) => !OTHER_HIDDEN.includes(key))
  const terms = [
    ['Inclusions', Array.isArray(vendor.other.inclusions) ? vendor.other.inclusions : []],
    ['Exclusions', Array.isArray(vendor.other.exclusions) ? vendor.other.exclusions : []],
  ].filter(([, items]) => items.length > 0)

  return (
    <section className="rounded-lg border border-border bg-card shadow-xs transition-shadow hover:shadow-sm" aria-label={name} data-testid="quotation-request-vendor">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-3 py-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand [overflow-wrap:anywhere]">
            {name}
            {seller.rating > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium">
                <Star className="size-3 fill-current" />
                {seller.rating} / 10
              </span>
            ) : null}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', hasQuote ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>
              {hasQuote ? 'Quoted' : 'Awaiting quote'}
            </span>
          </p>
          {contact.length > 0 ? <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{contact.join(' · ')}</p> : null}
          {/* {seller.address ? <p className="text-xs whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{seller.address}</p> : null} */}
          {vendor.requestedAt ? <p className="text-xs text-muted-foreground">Requested on {when(vendor.requestedAt)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="xs" variant={hasQuote ? 'outline' : 'default'} icon={FilePenLine} onClick={() => onQuote(order, vendor)}>
            {hasQuote ? 'Edit Quotation' : 'Quote Form'}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="[&_svg]:transition-transform [&_svg]:duration-200"
          >
            {open ? 'Hide Details' : 'View Details'}
            <ChevronDown className={cn(open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="animate-in space-y-3 border-t border-border bg-muted/30 px-3 py-3 duration-200 fade-in-0 slide-in-from-top-1">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-brand">Request For Quotation (RFQ)</p>
            {vendor.products.length === 0 ? (
              <p className="text-xs text-muted-foreground">No products came with this request.</p>
            ) : (
              <LineGrid columns={productColumns(warehouseName)} items={vendor.products} label={`Products asked of ${name}`} testId="quotation-request-product" />
            )}
          </div>

          {hasQuote ? (
            <DetailToggle title="Quote Master Details">
              <DetailGrid entries={masterEntries} />
            </DetailToggle>
          ) : null}

          {vendor.quoted.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-brand">Quote Product Details</p>
              <LineGrid
                columns={QUOTED_COLUMNS}
                items={vendor.quoted.map((item, index) => ({ ...item, key: `${item.id ?? 'line'}#${index}` }))}
                label={`Quoted products of ${name}`}
                testId="quotation-quoted-product"
              />
            </div>
          ) : null}

          {otherEntries.length > 0 || terms.length > 0 ? (
            <DetailToggle title="Quote Other Details">
              <div className="space-y-3">
                {otherEntries.length > 0 ? <DetailGrid entries={otherEntries} /> : null}
                {terms.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {terms.map(([title, items]) => (
                      <div key={title} className="text-xs">
                        <p className="mb-1 text-muted-foreground">{title}</p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {items.map((item, index) => (
                            <li key={`${item}#${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </DetailToggle>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** What an order's row opens out into: each vendor asked. */
function OrderVendors({ order, warehouseName, onQuote }) {
  if (order.vendors.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">No vendor details came with {order.documentNo || 'this Sales Order'}.</p>
  }

  return (
    <div className="animate-in space-y-2 px-3 py-3 duration-200 fade-in-0 slide-in-from-top-1" data-testid="quotation-request-vendors">
      {console.info("object", order)}
      {order.vendors.map((vendor) => (
        <VendorQuotation key={vendor.key} order={order} vendor={vendor} warehouseName={warehouseName} onQuote={onQuote} />
      ))}
    </div>
  )
}

const COLUMNS = [
  { key: 'serial', width: 70, head: 'S.No.', cell: (order, ctx) => ctx.serial, cellClass: 'tabular-nums text-brand-muted' },
  { key: 'documentNo', width: 180, head: 'SO Number', cell: (order) => order.documentNo || '--', cellClass: 'truncate font-medium' },
  { key: 'vendors', width: 320, head: 'Vendors', cell: (order) => order.vendorNames || '--', cellClass: 'truncate' },
  { key: 'count', width: 110, head: 'No. of Vendors', align: 'center', cell: (order) => order.vendors.length, cellClass: 'tabular-nums' },
  {
    key: 'quoted',
    width: 110,
    head: 'Quotations',
    align: 'center',
    cell: (order) => (
      <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', order.quotedCount > 0 ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>
        {order.quotedCount} / {order.vendors.length}
      </span>
    ),
  },
  {
    key: 'compare',
    width: 170,
    head: 'Compare',
    align: 'center',
    // Once any vendor has quoted, as before.
    cell: (order, ctx) =>
      order.quotedCount > 0 ? (
        <Button type="button" size="xs" icon={GitCompareArrows} onClick={() => ctx.compare(order)} aria-label={`Compare the quotations of ${order.documentNo || 'this Sales Order'}`}>
          Compare Quotations
        </Button>
      ) : (
        '--'
      ),
  },
  {
    key: 'details',
    width: 90,
    head: 'Details',
    align: 'center',
    cell: (order, ctx) => <ExpandButton open={ctx.open} label={`the vendors of ${order.documentNo || 'this Sales Order'}`} onClick={() => ctx.toggle(order.key)} />,
  },
]

function QuotationHistory() {
  const { activeCompanyName: companyName, activeCompanyId: companyId } = useActiveCompany()
  const requests = useQuotationRequests()
  const view = useListView(requests.rows)

  // Each order open or not, by its key - kept across pages.
  const [openRows, setOpenRows] = useState(() => new Set())
  const toggle = (key) =>
    setOpenRows((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // A product names its warehouse by id only - the name is the shared
  // warehouse list's (useWarehouses), asked only once an opened order needs it.
  const needsNames = requests.rows.some((order) => openRows.has(order.key) && order.vendors.some((vendor) => vendor.products.some((item) => item.warehouseId)))
  const { warehouses } = useWarehouses(needsNames)
  const namesById = useMemo(() => new Map(warehouses.map((record) => [String(getWarehouseId(record) ?? ''), String(record.name ?? '').trim()])), [warehouses])
  const warehouseName = (id) => namesById.get(String(id)) || `Warehouse ${id}`

  /* The dialogs - each mounted afresh as it opens (`session`), so nothing of
     the last one is left in it. `quote` { order, vendor }; `comparing` the order. */
  const [quote, setQuote] = useState({ open: false, order: null, vendor: null, session: 0 })
  const openQuote = (order, vendor) => setQuote((current) => ({ open: true, order, vendor, session: current.session + 1 }))
  const closeQuote = () => setQuote((current) => ({ ...current, open: false }))
  const [comparing, setComparing] = useState({ open: false, order: null, session: 0 })
  const compare = (order) => setComparing((current) => ({ open: true, order, session: current.session + 1 }))

  // The table's visible width: an opened row's details are kept to it, however far the table is scrolled.
  const [visibleWidth, setVisibleWidth] = useState(null)
  const measureTable = useCallback((box) => {
    if (!box) return undefined
    const observer = new ResizeObserver(([entry]) => setVisibleWidth(Math.floor(entry.contentRect.width)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  if (!companyName) {
    return (
      <Panel title="Quotation History">
        <StateMessage icon={GitCompareArrows} title="No company selected">
          Choose a company in the header to see its quotations.
        </StateMessage>
      </Panel>
    )
  }

  const rows = requests.rows

  return (
    <Panel title="Quotation History" meta={rows.length > 0 ? `(Total Count: ${rows.length})` : undefined}>
      {requests.status === 'failed' && rows.length === 0 ? (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the quotation history" action={<RetryButton onClick={requests.reload} />}>
          {requests.error}
        </StateMessage>
      ) : requests.status === 'loading' && rows.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <StateMessage icon={FileText} title="No quotation history found">
          Requests for quotation sent from a Sales Order show here.
        </StateMessage>
      ) : (
        <div className="space-y-3">
          {/* A failed refresh with rows still on screen: they stay, and this says why they have not changed. */}
          {requests.status === 'failed' ? <InlineAlert action={<RetryButton onClick={requests.reload} />}>{requests.error}</InlineAlert> : null}
          <div className="text-brand" ref={measureTable}>
            <DataTable
              head={COLUMNS.map((column) => (
                <PlainHead key={column.key} width={column.width} className={cn('text-brand', column.align === 'center' && 'text-center')}>
                  {column.head}
                </PlainHead>
              ))}
            >
              {view.rows.map((order, index) => {
                const open = openRows.has(order.key)
                const pageSize = Number(view.pageSize) || view.rows.length
                const context = { toggle, compare, open, serial: (view.page - 1) * pageSize + index + 1 }
                return (
                  <Fragment key={order.key}>
                    <TableRow className={cn(requests.status === 'loading' && 'opacity-60')} data-testid="quotation-request-row">
                      {COLUMNS.map((column) => (
                        <TableCell key={column.key} className={cn(column.align === 'center' && 'text-center', column.cellClass)}>
                          {column.cell(order, context)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {open ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={COLUMNS.length} wrap className="overflow-visible! bg-muted/40 p-0 py-0!">
                          <div className="sticky left-0" style={visibleWidth ? { width: visibleWidth - 2 } : undefined}>
                            <OrderVendors order={order} warehouseName={warehouseName} onQuote={openQuote} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </DataTable>
          </div>
          <TablePager view={view} />
        </div>
      )}

      {quote.order ? (
        <QuotationFormModal
          key={quote.session}
          open={quote.open}
          onOpenChange={(next) => {
            if (!next) closeQuote()
          }}
          order={quote.order}
          vendor={quote.vendor}
          companyName={companyName}
          // Saved: the History is read again by the save itself (saveQuotationForm).
          onSaved={closeQuote}
        />
      ) : null}

      {comparing.order ? (
        <QuotationCompareModal
          key={comparing.session}
          open={comparing.open}
          onOpenChange={(next) => {
            if (!next) setComparing((current) => ({ ...current, open: false }))
          }}
          documentNo={comparing.order.documentNo}
          companyName={companyName}
          companyId={companyId}
        />
      ) : null}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Upload Quotation                                                   */
/* ------------------------------------------------------------------ */

function UploadQuotation({ onUploaded }) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // Set at once, so a second click before the re-render is turned away.
  const inFlight = useRef(false)

  const handleSubmit = async () => {
    if (inFlight.current) return

    if (!file) {
      toast.error('Choose the quotation file first.')
      return
    }
    if (!file.name.toLowerCase().endsWith(QUOTATION_FILE)) {
      toast.error('Please choose a DOCX file.')
      return
    }
    if (!companyName) {
      toast.error('Select a company before uploading a quotation.')
      return
    }

    inFlight.current = true
    setSubmitting(true)

    try {
      // Accepted, the History is read again by the upload itself (uploadQuotation).
      const response = await uploadQuotation(companyName, file)
      toast.success(response?.msg || 'Quotation uploaded successfully.')
      setFile(null)
      onUploaded?.()
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService). The
      // file stays chosen - to correct and send again.
      toast.error(failure.message || 'The quotation could not be uploaded.')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Panel title="Upload Quotation">
        <div className="space-y-3">
          {file ? (
            // The chosen file, by name, with x to take it away again.
            <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-card pr-1 pl-3 text-sm shadow-xs">
              <FileText className="size-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                icon={X}
                tooltip="Remove"
                aria-label={`Remove ${file.name}`}
                disabled={submitting}
                onClick={() => setFile(null)}
              />
            </div>
          ) : (
            // The shared picker: it only hands the file back, and turns away anything that is not .docx.
            <CsvUploadButton size="sm" variant="outline" icon={Upload} accept={QUOTATION_FILE} onFileSelect={setFile}>
              Choose File
            </CsvUploadButton>
          )}

          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" loading={submitting} disabled={!file || !companyName} onClick={handleSubmit}>
              {submitting ? 'Uploading...' : 'Submit'}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

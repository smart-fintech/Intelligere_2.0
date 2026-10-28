import { Fragment, useCallback, useMemo, useState } from 'react'
import { AlertCircle, ChevronRight, Download, Eye, FileSpreadsheet, FileText, FileX, Info, Pencil, RefreshCcw, Trash2, Truck, X } from 'lucide-react'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field, FieldError, SelectField } from '@/Components/Common/FormFields'
import { DataTable, DateRangeFilter, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Checkbox } from '@/Components/ui/checkbox'
import { Switch } from '@/Components/ui/switch'
import { TableCell, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import { QUERY } from '@/Constants/queryKeys'
import { DOCUMENT_TYPE_INVOICE } from '@/Constants/salesInvoice'
import { invalidateQueries } from '@/Library/queryCache'
import { cn } from '@/Library/utils'
import { toast } from '@/Library/toast'
import useInventoryAccess from '@/Hooks/useInventoryAccess'
import { useListView } from '@/Hooks/useListView'
import { GstProgressPanel, GstToolbarActions } from '@/Modules/SalesInvoice/History/GstDocumentPanel'
import HistoryPdfModal from '@/Modules/SalesInvoice/History/HistoryPdfModal'
import HistoryProductRows from '@/Modules/SalesInvoice/History/HistoryProductRows'
import InventorySalesOrderHistory from '@/Modules/SalesInvoice/History/InventorySalesOrderHistory'
import TallyFetchModal from '@/Modules/SalesInvoice/History/TallyFetchModal'
import {
  EMPTY_HISTORY_FILTERS,
  HISTORY_SOURCE,
  amountRangeError,
  buildDocumentExportBody,
  filterHistoryRows,
  financialYearOf,
  financialYearOptions,
  hasHistoryFilters,
  historyPartyOptions,
  historyTotal,
} from '@/Modules/SalesInvoice/History/historyHelpers'
import { toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'
import useDocumentHistory from '@/Modules/SalesInvoice/History/useDocumentHistory'
import useGstDocumentActions, { GST_DOCUMENT_TYPES } from '@/Modules/SalesInvoice/History/useGstDocumentActions'
import useHistoryDocumentPdf from '@/Modules/SalesInvoice/History/useHistoryDocumentPdf'
import useTallyInvoiceFetch from '@/Modules/SalesInvoice/History/useTallyInvoiceFetch'
import {
  REGENERATE_VOUCHER_TYPES,
  deleteBusinessDocument,
  documentTypeOfRecord,
  exportDocumentsExcel,
  getDocumentTypeAccess,
  regenerateVoucher,
} from '@/Services/salesInvoiceService'
import { readEinvoiceDetails } from '@/Services/gstPortalService'
import { downloadFileFromUrl } from '@/Utils/fileDownload'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * HISTORY - the company's saved documents, by type and financial year.
 *
 *   toolbar     Document Type (the types this company may make), Financial
 *               Year (this one and the five before), and - for a Tally
 *               company - Fetch from Tally
 *   table       the columns in HISTORY_COLUMNS below: S.No., Buyer Name (the
 *               Show Buyer GSTIN switch in its heading), Buyer GSTIN while
 *               that is on, Invoice No. (with the count), Invoice Date,
 *               Taxable Amount (total_taxable_amount), Total (with every listed
 *               document's total added up), Actions
 *
 * THE ARROW, first in a row's Actions, opens the row out into its product
 * lines (product_data, already in the history - HistoryProductRows) and closes
 * it again; each row on its own, kept open across pages and filters by its
 * document_id.
 *
 * E-Invoice and E-Way Bill sit with Download Excel, at the end of the filter row.
 *
 * SALES ORDER, for a company with Inventory Management (useInventoryAccess -
 * the rule the Sales Order's booking follows): Sales Order / Inventory Sales
 * Order beside Document Type. Sales Order is this screen as it is; Inventory
 * Sales Order puts InventorySalesOrderHistory (inventory/sales_order_history/)
 * in place of the year, the filters and the table. Another type goes back to
 * Sales Order.
 *
 * FILTERS AND PAGES - the history answers with every document of the type
 * and year at once, so both are done here, on the rows already loaded, with
 * no request: Document Date from / to (document_date), Buyer - or Seller on
 * a purchase - by its ledger id, Source (Tally when past_tally_invoice is
 * true, else Intelligere - the earlier history screens' rule), and From / To
 * Amount (total_amount). They all apply together; changing any, or the type
 * or year, goes back to page 1; Clear Filters sets them all back. The count
 * and the total in the headings are the filtered rows'. Rows are keyed by
 * document_id, each document listed once.
 *
 * Regenerate Voucher (Sales Invoice, Credit Note, Debit Note, Purchase
 * Invoice) asks invoice/regenerate_voucher/ to make the document's voucher
 * again - by its document_id - and the company's vouchers are read again.
 * One request per document at a time.
 *
 * Download Excel exports what the filters show (buildDocumentExportBody) -
 * every page of it, not just the one on screen - and saves the file the
 * server names (downloadFileFromUrl).
 *
 * PDF opens the row's saved PDF (doc_pdf) in a modal, from its own URL -
 * nothing generated, no API called (HistoryPdfModal). A Sales Invoice, Credit
 * Note or Debit Note that also has an E-Way Bill PDF (e_way_bill_pdf) offers
 * Invoice PDF / E-Way Bill PDF in that same modal.
 *
 * Edit is offered only for a document made in Intelligere: one fetched from
 * Tally (past_tally_invoice - readHistoryRow's `fromTally`) shows it disabled,
 * with TALLY_EDIT_BLOCKED on hover - it is Tally's to change.
 *
 * E-Invoice and E-Way Bill (Sales Invoice, Credit Note, Debit Note -
 * useGstDocumentActions): pressing one puts a box beside the S.No. of each
 * row it can still be generated for; Generate takes the rows ticked one at a
 * time - the portal API, then the document's PDF made again with what it
 * returned and saved - with the progress shown, and reads the list again when
 * all are through (the page and filters stay). A row whose e_invoice_details
 * says one is generated offers Cancel E-Invoice / Cancel E-Way Bill instead
 * (asked first): the cancel API, then that PDF stamped CANCELLED and saved.
 *
 * Delete asks first (the app's confirm popover), and a row leaves the table
 * only when the server says it is gone - the list is then read again, and
 * the count, the total and the numbering with it. The server's own message
 * is shown either way, a refusal included.
 *
 *   company   the active company's record
 *   isTally   the user works in Tally - Fetch from Tally is offered
 *   documentTypesOf(company)   the types offered - Sales Invoice's by default;
 *             Purchase Invoice passes its own (getPurchaseDocumentTypeAccess)
 *   defaultType   the type listed first
 *   partyLabel    whose name the party column shows - the buyer on a sale; on
 *             a purchase the ledger saved as buyer_id is the supplier, "Seller"
 *   onEdit(record)  Edit on a row - the row as the server sent it
 *   refresh   a number that changes when a document was saved or updated -
 *             the list is read again
 */

/** The "every one" entry of a filter dropdown - Radix forbids "". */
const ALL = '__all__'

const SALES_ORDER = 'Sales Order'
const SALES_ORDER_VIEWS = [
  { value: 'documents', label: 'Sales Order' },
  { value: 'inventory', label: 'Inventory Sales Order' },
]

const SOURCE_OPTIONS = [
  { value: ALL, label: 'All Sources' },
  { value: HISTORY_SOURCE.TALLY, label: 'Tally Invoice' },
  { value: HISTORY_SOURCE.INTELLIGERE, label: 'Intelligere Invoice' },
]

/** Money as the app shows it - formatIndianCurrency, from paise. */
const rupees = (paise) => (paise === null ? '--' : formatIndianCurrency(paise / 100))

/** The party column's heading: the name, then the switch that adds the GSTIN column, then what it does. */
function BuyerHead({ showGstin, onShowGstinChange, partyLabel }) {
  return (
    <span className="flex items-center gap-2">
      <span className="truncate">{partyLabel} Name</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Switch
          id="history-show-gstin"
          checked={showGstin}
          onCheckedChange={onShowGstinChange}
          aria-label={`Show ${partyLabel} GSTIN`}
          className="h-4 w-7 [&>span]:size-3"
        />
        <Tooltip text={`Show ${partyLabel} GSTIN - adds each ${partyLabel.toLowerCase()}'s GSTIN in a column beside the name`}>
          <span tabIndex={0} className="inline-flex cursor-help outline-none focus-visible:text-brand-dark" aria-label={`About Show ${partyLabel} GSTIN`}>
            <Info className="size-3.5" />
          </span>
        </Tooltip>
      </span>
    </span>
  )
}

/** Whether the history sent this row's document_id - the id an update names. */
const hasDocumentId = (row) => row.source?.document_id !== undefined && row.source?.document_id !== null && String(row.source.document_id).trim() !== ''

/** The document type a row is - as the history names it ("Invoice" was "Sales Invoice"). */
const typeOfRow = (row, listedType) => documentTypeOfRecord(String(row.source?.document_type ?? '').trim() || listedType)

/** What a Tally document's disabled Edit says on hover. */
const TALLY_EDIT_BLOCKED = 'Tally invoice will not edit'

/** A row's Show products (the arrow), Regenerate Voucher (the types that have vouchers), PDF, Edit (the document opens in Create Document, filled in) and Delete. */
function RowActions({ row, rowKey, open, actions }) {
  const { confirming, setConfirming, deleting, remove, onEdit, regenerating, regenerate, listedType, previewPdf, gst, toggleProducts } = actions
  const canRegenerate = REGENERATE_VOUCHER_TYPES.includes(typeOfRow(row, listedType))
  // Cancel E-Invoice / Cancel E-Way Bill - each only while that one is generated and not cancelled.
  const details = gst ? readEinvoiceDetails(row.source) : null
  const cancels = !details
    ? []
    : [
        ['einvoice', 'E-Invoice', FileX, details.einvoice],
        ['ewaybill', 'E-Way Bill', Truck, details.ewaybill],
      ].filter(([, , , state]) => state.generated && !state.cancelled && hasDocumentId(row))
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {/* One arrow, turning as the row opens and closes. */}
      <Button
        type="button"
        variant="iconEdit"
        size="icon-sm"
        icon={ChevronRight}
        className={cn('[&_svg]:transition-transform [&_svg]:duration-200', open && '[&_svg]:rotate-90')}
        tooltip={open ? 'Hide products' : 'Show products'}
        aria-label={`${open ? 'Hide' : 'Show'} products of ${row.documentNo || 'this document'}`}
        aria-expanded={open}
        onClick={() => toggleProducts(rowKey)}
      />
      {cancels.map(([kind, label, Icon]) => {
        const key = `cancel-${kind}:${rowKey}`
        const busy = gst.cancelling === `${kind}:${row.id}`
        return (
          <ConfirmPopover
            key={kind}
            open={confirming === key}
            onOpenChange={(next) => !busy && setConfirming(next ? key : null)}
            title={`Cancel ${label} of ${row.documentNo || 'this document'}?`}
            description={`The ${label} is cancelled on the GST portal, and its PDF is stamped CANCELLED. This cannot be undone.`}
            confirmLabel={`Cancel ${label}`}
            busy={busy}
            onConfirm={async () => {
              await gst.cancel(row, kind)
              setConfirming(null)
            }}
          >
            <Button
              type="button"
              variant="iconDelete"
              size="icon-sm"
              icon={Icon}
              loading={busy}
              disabled={gst.busy || deleting}
              tooltip={`Cancel ${label}`}
              aria-label={`Cancel ${label} of ${row.documentNo}`}
            />
          </ConfirmPopover>
        )
      })}
      {canRegenerate ? (
        <Button
          type="button"
          variant="iconEdit"
          size="icon-sm"
          icon={RefreshCcw}
          loading={regenerating.has(rowKey)}
          // Only a document the history names by its document_id - and one request at a time for it.
          disabled={!hasDocumentId(row) || regenerating.has(rowKey) || deleting}
          tooltip="Regenerate Voucher"
          aria-label={`Regenerate voucher for ${row.documentNo}`}
          onClick={() => regenerate(row, rowKey)}
        />
      ) : null}
      <Button
        type="button"
        variant="iconEdit"
        size="icon-sm"
        icon={Eye}
        tooltip="View PDF"
        aria-label={`View PDF of ${row.documentNo}`}
        onClick={() => previewPdf(row)}
      />
      {row.fromTally ? (
        // Disabled buttons take no pointer events, so the tooltip hangs on a wrapper the pointer and Tab reach.
        <Tooltip text={TALLY_EDIT_BLOCKED}>
          <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`Edit ${row.documentNo}: ${TALLY_EDIT_BLOCKED}`}>
            <Button type="button" variant="iconEdit" size="icon-sm" icon={Pencil} disabled aria-hidden="true" tabIndex={-1} />
          </span>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant="iconEdit"
          size="icon-sm"
          icon={Pencil}
          // Only a document the history names by its document_id can be updated.
          disabled={!onEdit || !hasDocumentId(row) || deleting}
          tooltip="Edit"
          aria-label={`Edit ${row.documentNo}`}
          onClick={() => onEdit?.(row.source)}
        />
      )}
      <ConfirmPopover
        open={confirming === rowKey}
        onOpenChange={(next) => !deleting && setConfirming(next ? rowKey : null)}
        title={`Delete ${row.documentNo || 'this document'}?`}
        description="It is removed from the history."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => remove(row)}
      >
        <Button
          type="button"
          variant="iconDelete"
          size="icon-sm"
          icon={Trash2}
          disabled={row.id === null || (deleting && confirming !== rowKey)}
          aria-label={`Delete ${row.documentNo}`}
        />
      </ConfirmPopover>
    </span>
  )
}

/**
 * THE COLUMNS, in order - one entry per column, so adding, removing or
 * moving one is a change here and nowhere else:
 *
 *   key             unique and stable
 *   width           px. The table is laid out from these (DataTable is
 *                   table-fixed) and shares spare room out in proportion.
 *   align           'right' for figures and actions
 *   head(ctx)       the heading
 *   cell(row, ctx)  the cell. Plain text too long for the column is cut off
 *                   with "..." and shown whole on hover (TableCell's title).
 *   cellClass       extra classes for the column's cells
 *   when(ctx)       optional - the column shows only while this is true
 *
 * `ctx` holds what headings and cells may need: `count` and `total` of the
 * listed documents, the GSTIN switch, the row actions, and per row its
 * `index` and `rowKey`. Actions stays LAST - DataTable pins the last column.
 */
const HISTORY_COLUMNS = [
  {
    key: 'serial',
    width: 80,
    head: (ctx) =>
      ctx.selection ? (
        <span className="flex items-center gap-2">
          <Checkbox
            aria-label="Select every listed document on this page"
            checked={ctx.selection.pageAll}
            disabled={ctx.selection.locked || ctx.selection.pageEligible.length === 0}
            onCheckedChange={(on) => ctx.selection.gst.toggleMany(ctx.selection.pageEligible, on === true)}
          />
          S.No.
        </span>
      ) : (
        'S.No.'
      ),
    // While E-Invoice / E-Way Bill is selecting: a box beside each row it can be generated for.
    cell: (row, ctx) =>
      ctx.selection ? (
        <span className="flex items-center gap-2">
          {ctx.selection.gst.eligible(row) ? (
            <Checkbox
              aria-label={`Select ${row.documentNo}`}
              checked={ctx.selection.gst.selected.has(String(row.id))}
              disabled={ctx.selection.locked}
              onCheckedChange={(on) => ctx.selection.gst.toggle(row, on === true)}
            />
          ) : (
            <span className="inline-block size-4" aria-hidden="true" />
          )}
          {ctx.serial}
        </span>
      ) : (
        ctx.serial
      ),
    cellClass: 'tabular-nums text-brand-muted',
  },
  {
    key: 'buyerName',
    width: 230,
    head: (ctx) => <BuyerHead showGstin={ctx.showGstin} onShowGstinChange={ctx.onShowGstinChange} partyLabel={ctx.partyLabel} />,
    cell: (row) => row.buyerName || '--',
    cellClass: 'truncate font-medium',
  },
  {
    key: 'buyerGstin',
    width: 160,
    when: (ctx) => ctx.showGstin,
    head: (ctx) => `${ctx.partyLabel} GSTIN`,
    cell: (row) => row.buyerGstin || '--',
    cellClass: 'truncate font-mono text-xs',
  },
  {
    key: 'documentNo',
    width: 170,
    head: (ctx) => `Invoice No. (${ctx.count})`,
    cell: (row) => row.documentNo || '--',
    cellClass: 'truncate',
  },
  {
    key: 'documentDate',
    width: 120,
    head: () => 'Invoice Date',
    cell: (row) => formatDate(row.documentDate),
    cellClass: 'whitespace-nowrap',
  },
  {
    key: 'taxable',
    width: 160,
    align: 'right',
    head: () => 'Taxable Amount',
    cell: (row) => rupees(row.taxablePaise),
    cellClass: 'truncate tabular-nums',
  },
  {
    key: 'total',
    width: 200,
    align: 'right',
    // The amount keeps its own lettering, not the heading's capitals.
    head: (ctx) => (
      <span title={`Total (${rupees(ctx.total)})`}>
        Total <span className="tabular-nums normal-case">({rupees(ctx.total)})</span>
      </span>
    ),
    cell: (row) => rupees(row.totalPaise),
    cellClass: 'truncate font-medium tabular-nums',
  },
  {
    key: 'actions',
    // Room for the most a row shows - the arrow, both cancels, Regenerate, PDF, Edit, Delete: 7 x 32 px, the gaps, the padding.
    width: 272,
    align: 'right',
    head: () => 'Actions',
    cell: (row, ctx) => <RowActions row={row} rowKey={ctx.rowKey} open={ctx.open} actions={ctx.actions} />,
    cellClass: 'whitespace-nowrap',
  },
]

export default function DocumentHistory({
  company,
  isTally,
  documentTypesOf = getDocumentTypeAccess,
  defaultType = DOCUMENT_TYPE_INVOICE,
  partyLabel = 'Buyer',
  onEdit,
  refresh = 0,
}) {
  const documentTypes = useMemo(() => documentTypesOf(company).filter((type) => type.enabled), [documentTypesOf, company])
  const yearOptions = useMemo(() => financialYearOptions(), [])

  const [documentType, setDocumentType] = useState(defaultType)
  const [financialYear, setFinancialYear] = useState(() => financialYearOf())
  const [showGstin, setShowGstin] = useState(false)

  /* ---- Sales Order / Inventory Sales Order - Sales Orders of a company with Inventory Management ---- */
  const inventoryAccess = useInventoryAccess()
  const offersInventoryOrders = documentType === SALES_ORDER && inventoryAccess.full
  const [salesOrderView, setSalesOrderView] = useState(SALES_ORDER_VIEWS[0].value)
  const inventoryOrders = offersInventoryOrders && salesOrderView === 'inventory'

  const history = useDocumentHistory({ companyId: company.company_id, documentType, financialYear, refresh })

  /* ---- E-Invoice / E-Way Bill - Sales Invoice, Credit Note, Debit Note ---- */
  const gstApplies = GST_DOCUMENT_TYPES.includes(documentTypeOfRecord(documentType))
  const historyPdfs = useHistoryDocumentPdf(company)
  const gst = useGstDocumentActions({ pdfs: historyPdfs, reload: history.reload, documentType: documentTypeOfRecord(documentType) })

  /* ---- filters and pages - on the rows already loaded ---- */
  const [filters, setFilters] = useState(EMPTY_HISTORY_FILTERS)
  const partyOptions = useMemo(() => historyPartyOptions(history.rows), [history.rows])
  const filtered = useMemo(() => filterHistoryRows(history.rows, filters), [history.rows, filters])
  const view = useListView(filtered)
  const total = useMemo(() => historyTotal(filtered), [filtered])
  const amountError = amountRangeError(filters)
  const filtering = hasHistoryFilters(filters)
  const { setPage } = view
  const setFilter = (changes) => {
    setFilters((previous) => ({ ...previous, ...changes }))
    setPage(1)
  }
  const clearFilters = () => {
    setFilters(EMPTY_HISTORY_FILTERS)
    setPage(1)
  }
  const changeList = (apply) => (value) => {
    if (!value) return
    apply(value)
    setPage(1)
    // Another list: nothing ticked in this one carries over.
    gst.stop()
  }

  /* ---- Fetch from Tally ---- */
  const [fetchOpen, setFetchOpen] = useState(false)
  const tallyFetch = useTallyInvoiceFetch({
    companyName: company.comp_name,
    onSuccess: () => {
      setFetchOpen(false)
      history.reload()
    },
  })

  /* ---- Delete ---- */
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const remove = async (row) => {
    if (deleting) return
    setDeleting(true)
    try {
      const reply = await deleteBusinessDocument(row.id)
      toast.success(reply?.msg || `${row.documentNo || 'The document'} was deleted.`)
      setConfirming(null)
      history.reload()
    } catch (failure) {
      // `failure.message` is the server's own text (see authService) - a
      // document referenced elsewhere stays, and says why.
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  /* ---- PDF - the row's own doc_pdf (and E-Way Bill PDF), in a modal ---- */
  // { row, ewayBill } - the row whose own files are shown; ewayBill: its E-Way Bill PDF is offered too.
  const [pdfView, setPdfView] = useState(null)

  /* ---- the arrow - each row's products, open or not, by its key ---- */
  const [openRows, setOpenRows] = useState(() => new Set())
  // The table's visible width: an opened row's products are kept to it, at its left
  // edge, and scroll sideways inside themselves - however far the table is scrolled.
  const [visibleWidth, setVisibleWidth] = useState(null)
  const measureTable = useCallback((box) => {
    if (!box) return undefined
    const observer = new ResizeObserver(([entry]) => setVisibleWidth(Math.floor(entry.contentRect.width)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  const toggleProducts = (rowKey) =>
    setOpenRows((current) => {
      const next = new Set(current)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })

  /* ---- Regenerate Voucher - one request per document at a time ---- */
  const [regenerating, setRegenerating] = useState(() => new Set())
  const regenerate = async (row, rowKey) => {
    if (regenerating.has(rowKey) || !hasDocumentId(row)) return
    setRegenerating((current) => new Set(current).add(rowKey))
    try {
      const reply = await regenerateVoucher({ companyId: company.company_id, documentId: row.source.document_id, documentType: typeOfRow(row, documentType) })
      toast.success(reply?.msg || 'Voucher regenerated.')
      // The voucher is the Voucher view's - read again wherever it is open.
      invalidateQueries(QUERY.TALLY_VOUCHERS, { whose: company.company_id, refetchActive: true })
    } catch (failure) {
      toast.error(failure.message || 'The voucher could not be regenerated.')
    } finally {
      setRegenerating((current) => {
        const next = new Set(current)
        next.delete(rowKey)
        return next
      })
    }
  }

  /* ---- Download Excel - the filters as applied ---- */
  const [exporting, setExporting] = useState(false)
  const downloadExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const partyName = partyOptions.find((option) => option.value === filters.party)?.label ?? ''
      const reply = await exportDocumentsExcel(buildDocumentExportBody({ financialYear, documentType, filters, partyName }))
      const fileUrl = typeof reply?.file_name === 'string' ? reply.file_name.trim() : ''
      if (!fileUrl) {
        toast.error(reply?.msg || 'The export sent no file to download.')
        return
      }
      await downloadFileFromUrl(fileUrl, `${documentType} ${financialYear}.xlsx`)
      toast.success(reply?.msg || 'Excel exported successfully')
    } catch (failure) {
      toast.error(failure.message || 'The Excel file could not be exported.')
    } finally {
      setExporting(false)
    }
  }

  /* ---- what the columns' headings and cells read ---- */
  const context = {
    count: filtered.length,
    total,
    showGstin,
    onShowGstinChange: setShowGstin,
    partyLabel,
    actions: {
      confirming,
      setConfirming,
      deleting,
      remove,
      onEdit,
      regenerating,
      regenerate,
      listedType: documentType,
      previewPdf: (row) => setPdfView({ row, ewayBill: gstApplies }),
      gst: gstApplies ? gst : null,
      toggleProducts,
    },
    selection: null,
  }
  if (gstApplies && gst.mode) {
    const pageEligible = view.rows.filter((row) => gst.eligible(row))
    context.selection = {
      gst,
      locked: gst.busy,
      pageEligible,
      pageAll: pageEligible.length > 0 && pageEligible.every((row) => gst.selected.has(String(row.id))),
    }
  }
  const columns = HISTORY_COLUMNS.filter((column) => !column.when || column.when(context))

  return (
    <div className="space-y-3">
      {/* ---------------- Toolbar ---------------- */}
      <Card className="gap-0 border-border/70 py-3 shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 px-3">
          <SelectField
            id="history-document-type"
            label="Document Type"
            className="w-full sm:w-52"
            options={documentTypes.map((type) => ({ value: type.value, label: type.label }))}
            value={documentType}
            onValueChange={changeList((value) => {
              setDocumentType(value)
              setSalesOrderView(SALES_ORDER_VIEWS[0].value)
            })}
          />
          {offersInventoryOrders ? (
            <ViewSwitch
              options={SALES_ORDER_VIEWS}
              value={salesOrderView}
              onValueChange={(value) => value && setSalesOrderView(value)}
              label="Sales Order history"
              idPrefix="history-sales-order"
              className="w-full sm:w-auto"
            />
          ) : null}
          {inventoryOrders ? null : (
            <SelectField
              id="history-financial-year"
              label="Financial Year"
              className="w-full sm:w-44"
              options={yearOptions}
              value={financialYear}
              onValueChange={changeList(setFinancialYear)}
            />
          )}
          {isTally && !inventoryOrders ? (
            // The right-hand end of the row, where the total used to be.
            <Button
              type="button"
              variant="outline"
              icon={Download}
              loading={tallyFetch.fetching}
              className="w-full sm:ml-auto sm:w-auto"
              onClick={() => setFetchOpen(true)}
            >
              {tallyFetch.fetching ? 'Fetching from Tally...' : 'Fetch from Tally'}
            </Button>
          ) : null}
        </CardContent>

        {/* ---- the filters: all apply together, on the rows loaded ---- */}
        <CardContent className={cn('mt-3 flex flex-wrap items-end gap-3 border-t border-border px-3 pt-3', inventoryOrders && 'hidden')} role="group" aria-label="History filters">
          <DateRangeFilter
            stacked
            label="Document Date"
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) => setFilter({ from, to })}
          />
          <SelectField
            id="history-party"
            label={partyLabel}
            className="w-full sm:w-52"
            searchable
            searchPlaceholder={`Search ${partyLabel.toLowerCase()}`}
            options={[{ value: ALL, label: `All ${partyLabel}s` }, ...partyOptions]}
            value={filters.party || ALL}
            onValueChange={(value) => value && setFilter({ party: value === ALL ? '' : value })}
          />
          <SelectField
            id="history-source"
            label="Source"
            className="w-full sm:w-44"
            options={SOURCE_OPTIONS}
            value={filters.source || ALL}
            onValueChange={(value) => value && setFilter({ source: value === ALL ? '' : value })}
          />
          <div className="space-y-1">
            <div className="flex items-end gap-2">
              <Field
                id="history-amount-from"
                label="From Amount"
                inputMode="decimal"
                placeholder="0.00"
                className="w-28"
                value={filters.minAmount}
                onChange={(event) => setFilter({ minAmount: toDecimalInput(event.target.value) })}
              />
              <Field
                id="history-amount-to"
                label="To Amount"
                inputMode="decimal"
                placeholder="0.00"
                className="w-28"
                value={filters.maxAmount}
                onChange={(event) => setFilter({ maxAmount: toDecimalInput(event.target.value) })}
              />
            </div>
            <FieldError id="history-amount-error">{amountError}</FieldError>
          </div>
          {filtering ? (
            <Button type="button" variant="ghost" size="sm" icon={X} onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : null}
          {/* The row's actions, together at its end: E-Invoice / E-Way Bill (their types only), then Download Excel. */}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {gstApplies ? <GstToolbarActions gst={gst} rows={filtered} disabled={history.rows.length === 0} size="sm" /> : null}
            <Button
              type="button"
              variant="default"
              size="sm"
              icon={FileSpreadsheet}
              loading={exporting}
              disabled={exporting || history.rows.length === 0}
              onClick={downloadExcel}
            >
              {exporting ? 'Exporting...' : 'Download Excel'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {gstApplies ? <GstProgressPanel gst={gst} /> : null}

      {inventoryOrders ? <InventorySalesOrderHistory company={company} /> : null}

      {/* ---------------- The documents ---------------- */}
      <Card className={cn('border-border/70 py-3 shadow-sm', inventoryOrders && 'hidden')}>
        <CardContent className="px-3">
          {history.status === 'failed' && history.rows.length === 0 ? (
            <StateMessage icon={AlertCircle} tone="error" title="Could not load the history" action={<RetryButton onClick={history.reload} />}>
              {history.error}
            </StateMessage>
          ) : history.status === 'loading' && history.rows.length === 0 ? (
            <ListSkeleton rows={5} />
          ) : history.rows.length === 0 ? (
            <StateMessage icon={FileText} title="No documents yet">
              Nothing saved for this document type in {financialYear}.
            </StateMessage>
          ) : filtered.length === 0 ? (
            <StateMessage
              icon={FileText}
              title="No documents match the filters"
              action={
                <Button type="button" variant="outline" size="sm" icon={X} onClick={clearFilters}>
                  Clear Filters
                </Button>
              }
            >
              None of the {history.rows.length} documents for {financialYear} passes every filter set.
            </StateMessage>
          ) : (
            <div className="space-y-3">
              {history.status === 'failed' ? (
                <InlineAlert action={<RetryButton onClick={history.reload} />}>{history.error}</InlineAlert>
              ) : null}
              {/* The table in the app's primary colour; the action icons keep their own. */}
              <div className="text-brand" ref={measureTable}>
                <DataTable
                  head={columns.map((column) => (
                    <PlainHead key={column.key} width={column.width} className={cn('text-brand', column.align === 'right' && 'text-right')}>
                      {column.head(context)}
                    </PlainHead>
                  ))}
                >
                  {view.rows.map((row, index) => {
                    // Each document by its document_id - never its place or number.
                    const rowKey = row.id ?? `no-id-${row.documentNo}-${index}`
                    const pageSize = Number(view.pageSize) || view.rows.length
                    const open = openRows.has(rowKey)
                    const cellContext = { ...context, index, rowKey, open, serial: (view.page - 1) * pageSize + index + 1 }
                    return (
                      <Fragment key={rowKey}>
                        <TableRow className={cn(history.status === 'loading' && 'opacity-60')}>
                          {columns.map((column) => (
                            <TableCell key={column.key} className={cn(column.align === 'right' && 'text-right', column.cellClass)}>
                              {column.cell(row, cellContext)}
                            </TableCell>
                          ))}
                        </TableRow>
                        {/* What the row opens out into: one cell across every column (see "A ROW THAT OPENS" in DataTable). */}
                        {open ? (
                          <TableRow className="hover:bg-transparent">
                            {/* `overflow-visible!`: the table clips its cells, which would hold the products in place instead of letting them stay in view. */}
                            <TableCell colSpan={columns.length} wrap className="overflow-visible! bg-muted/40 p-0 py-0!">
                              {/* The visible width less the table's 1px border on each side. */}
                              <div className="sticky left-0" style={visibleWidth ? { width: visibleWidth - 2 } : undefined}>
                                <HistoryProductRows products={row.products} documentNo={row.documentNo} />
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
        </CardContent>
      </Card>

      <HistoryPdfModal row={pdfView?.row ?? null} ewayBill={Boolean(pdfView?.ewayBill)} onClose={() => setPdfView(null)} />
      {/* Out of view: where an E-Invoice / cancelled invoice PDF is measured before it is drawn. */}
      {historyPdfs.host}

      {isTally ? (
        <TallyFetchModal open={fetchOpen} onOpenChange={setFetchOpen} companyName={company.comp_name} tallyFetch={tallyFetch} />
      ) : null}
    </div>
  )
}

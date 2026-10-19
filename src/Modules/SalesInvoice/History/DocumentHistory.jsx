import { useMemo, useState } from 'react'
import { AlertCircle, Download, FileText, Info, Pencil, Trash2 } from 'lucide-react'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { DataTable, PlainHead } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Switch } from '@/Components/ui/switch'
import { TableCell, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import { DOCUMENT_TYPE_INVOICE } from '@/Constants/salesInvoice'
import { cn } from '@/Library/utils'
import { toast } from '@/Library/toast'
import TallyFetchModal from '@/Modules/SalesInvoice/History/TallyFetchModal'
import { financialYearOf, financialYearOptions, historyTotal } from '@/Modules/SalesInvoice/History/historyHelpers'
import useDocumentHistory from '@/Modules/SalesInvoice/History/useDocumentHistory'
import useTallyInvoiceFetch from '@/Modules/SalesInvoice/History/useTallyInvoiceFetch'
import { deleteBusinessDocument, getDocumentTypeAccess } from '@/Services/salesInvoiceService'
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
 *               Total (with every listed document's total added up), Actions
 *
 * Delete asks first (the app's confirm popover), and a row leaves the table
 * only when the server says it is gone - the list is then read again, and
 * the count, the total and the numbering with it. The server's own message
 * is shown either way, a refusal included.
 *
 *   company   the active company's record
 *   isTally   the user works in Tally - Fetch from Tally is offered
 */

/** Money as the app shows it - formatIndianCurrency, from paise. */
const rupees = (paise) => (paise === null ? '--' : formatIndianCurrency(paise / 100))

/** Buyer Name's heading: the name, then the switch that adds the GSTIN column, then what it does. */
function BuyerHead({ showGstin, onShowGstinChange }) {
  return (
    <span className="flex items-center gap-2">
      <span className="truncate">Buyer Name</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Switch
          id="history-show-gstin"
          checked={showGstin}
          onCheckedChange={onShowGstinChange}
          aria-label="Show Buyer GSTIN"
          className="h-4 w-7 [&>span]:size-3"
        />
        <Tooltip text="Show Buyer GSTIN - adds each buyer's GSTIN in a column beside the name">
          <span tabIndex={0} className="inline-flex cursor-help outline-none focus-visible:text-brand-dark" aria-label="About Show Buyer GSTIN">
            <Info className="size-3.5" />
          </span>
        </Tooltip>
      </span>
    </span>
  )
}

/** A row's Edit and Delete. Edit is shown, not offered: no edit flow exists for a saved document yet. */
function RowActions({ row, rowKey, actions }) {
  const { confirming, setConfirming, deleting, remove } = actions
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="iconEdit"
        size="icon-sm"
        icon={Pencil}
        disabled
        tooltip="Editing a saved document is not available yet"
        aria-label={`Edit ${row.documentNo}`}
      />
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
    width: 64,
    head: () => 'S.No.',
    cell: (row, ctx) => ctx.index + 1,
    cellClass: 'tabular-nums text-brand-muted',
  },
  {
    key: 'buyerName',
    width: 230,
    head: (ctx) => <BuyerHead showGstin={ctx.showGstin} onShowGstinChange={ctx.onShowGstinChange} />,
    cell: (row) => row.buyerName || '--',
    cellClass: 'truncate font-medium',
  },
  {
    key: 'buyerGstin',
    width: 160,
    when: (ctx) => ctx.showGstin,
    head: () => 'Buyer GSTIN',
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
    width: 96,
    align: 'right',
    head: () => 'Actions',
    cell: (row, ctx) => <RowActions row={row} rowKey={ctx.rowKey} actions={ctx.actions} />,
    cellClass: 'whitespace-nowrap',
  },
]

export default function DocumentHistory({ company, isTally }) {
  const documentTypes = useMemo(() => getDocumentTypeAccess(company).filter((type) => type.enabled), [company])
  const yearOptions = useMemo(() => financialYearOptions(), [])

  const [documentType, setDocumentType] = useState(DOCUMENT_TYPE_INVOICE)
  const [financialYear, setFinancialYear] = useState(() => financialYearOf())
  const [showGstin, setShowGstin] = useState(false)

  const history = useDocumentHistory({ companyId: company.company_id, documentType, financialYear })
  const total = useMemo(() => historyTotal(history.rows), [history.rows])

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

  /* ---- what the columns' headings and cells read ---- */
  const context = {
    count: history.rows.length,
    total,
    showGstin,
    onShowGstinChange: setShowGstin,
    actions: { confirming, setConfirming, deleting, remove },
  }
  const columns = HISTORY_COLUMNS.filter((column) => !column.when || column.when(context))

  return (
    <div className="space-y-3">
      {/* ---------------- Toolbar ---------------- */}
      <Card className="border-border/70 py-3 shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 px-3">
          <SelectField
            id="history-document-type"
            label="Document Type"
            className="w-full sm:w-52"
            options={documentTypes.map((type) => ({ value: type.value, label: type.label }))}
            value={documentType}
            onValueChange={(value) => value && setDocumentType(value)}
          />
          <SelectField
            id="history-financial-year"
            label="Financial Year"
            className="w-full sm:w-44"
            options={yearOptions}
            value={financialYear}
            onValueChange={(value) => value && setFinancialYear(value)}
          />
          {isTally ? (
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
      </Card>

      {/* ---------------- The documents ---------------- */}
      <Card className="border-border/70 py-3 shadow-sm">
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
          ) : (
            <div className="space-y-3">
              {history.status === 'failed' ? (
                <InlineAlert action={<RetryButton onClick={history.reload} />}>{history.error}</InlineAlert>
              ) : null}
              {/* The table in the app's primary colour; the action icons keep their own. */}
              <div className="text-brand">
                <DataTable
                  head={columns.map((column) => (
                    <PlainHead key={column.key} width={column.width} className={cn('text-brand', column.align === 'right' && 'text-right')}>
                      {column.head(context)}
                    </PlainHead>
                  ))}
                >
                  {history.rows.map((row, index) => {
                    const rowKey = row.id ?? `${row.documentNo}-${index}`
                    const cellContext = { ...context, index, rowKey }
                    return (
                      <TableRow key={rowKey} className={cn(history.status === 'loading' && 'opacity-60')}>
                        {columns.map((column) => (
                          <TableCell key={column.key} className={cn(column.align === 'right' && 'text-right', column.cellClass)}>
                            {column.cell(row, cellContext)}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </DataTable>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isTally ? (
        <TallyFetchModal open={fetchOpen} onOpenChange={setFetchOpen} companyName={company.comp_name} tallyFetch={tallyFetch} />
      ) : null}
    </div>
  )
}

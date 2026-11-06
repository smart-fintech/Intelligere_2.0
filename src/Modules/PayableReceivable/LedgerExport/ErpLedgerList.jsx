import { Fragment, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeftRight, Download, Landmark, Plus, RefreshCw, SearchX } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, DateRangeFilter, PlainHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { BankEntryModal, EditEntryModal } from '@/Modules/PayableReceivable/LedgerExport/ErpEntryModals'
import {
  balanceText,
  currentFinancialYear,
  erpLedgersCsv,
  filterErpRows,
  financialYearOptions,
  isFixedRow,
  readErpLedgers,
  rowDetails,
} from '@/Modules/PayableReceivable/LedgerExport/ledgerExport'
import OpeningBalanceModal from '@/Modules/PayableReceivable/Components/OpeningBalanceModal'
import { ExpandButton } from '@/Modules/SalesInvoice/History/InventorySalesOrderHistory'
import { formatAmount } from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { deleteErpEntry, getErpLedgers } from '@/Services/Accounting/ledgerExportService'
import { formatIndianCurrency } from '@/Utils/currency'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * LEDGER EXPORT FOR A USER ON ANOTHER ERP - every ledger for a financial year,
 * each opening out into its rows, the balances as the backend worked them out.
 *
 *   Filters       ledger, narration or particular, dates (in the browser)
 *   per ledger    Show All Details, Opening Balance, Bank Entry
 *   per row       Edit (moves it to another ledger; not for a bank entry),
 *                 Delete (asked in a popover)
 *   Download      the filtered ledgers as CSV
 *   Paging        the ledgers, and each ledger's rows - in the browser, as the
 *                 API sends the whole year at once. A filter changed goes back
 *                 to page 1 of both.
 *
 * After any change the list is read again.
 */

const NO_LEDGERS = []
const NO_FILTERS = Object.freeze({ ledger: '', search: '', from: '', to: '' })
const YEAR_OPTIONS = financialYearOptions()
const COLUMN_COUNT = 9
const UTF8_MARK = String.fromCharCode(0xfeff)

const toAmount = (value) => formatAmount(Number(value) || 0)

/** What a row opens out into: the journal's two sides, or the invoice's items and charges. */
function RowDetails({ details }) {
  return (
    <div className="grid gap-3 text-xs md:grid-cols-2">
      {details.debits.length || details.credits.length ? (
        <div className="rounded-md border border-border bg-card p-3 md:col-span-2">
          <p className="mb-2 font-semibold text-brand">Journal Details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Debit (Dr)', details.debits],
              ['Credit (Cr)', details.credits],
            ].map(([title, lines]) => (
              <div key={title}>
                <p className="mb-1 font-medium">{title}</p>
                {lines.map((line, index) => (
                  <p key={index} className="flex justify-between gap-2 text-muted-foreground">
                    <span>{line.ledger_name}</span>
                    <span className="font-medium tabular-nums">{formatIndianCurrency(line.amount)}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {details.products.length ? (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="mb-2 font-semibold text-brand">Products / Items</p>
          {details.products.map((product, index) => (
            <p key={index} className="flex justify-between gap-2 text-muted-foreground">
              <span>
                {product.Products}
                {product.Hsn_code ? ` (HSN ${product.Hsn_code})` : ''} - {product.quantity} {product.Per} @ {formatIndianCurrency(product.Rate)}
              </span>
              <span className="font-medium tabular-nums">{formatIndianCurrency(product.Amount)}</span>
            </p>
          ))}
        </div>
      ) : null}

      {details.charges.length ? (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="mb-2 font-semibold text-brand">Taxes &amp; Charges</p>
          {details.charges.map((charge, index) => (
            <p key={index} className="flex justify-between gap-2 text-muted-foreground">
              <span className="uppercase">{charge.charge_name}</span>
              <span className="font-medium tabular-nums">{formatIndianCurrency(charge.amount)}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** One ledger's rows, with their own paging. */
function LedgerRows({ ledgerName, rows, showDetails, onEdit, onDelete, deleting }) {
  const view = useListView(rows)
  const [confirming, setConfirming] = useState(null)

  return (
    <>
      <DataTable
        head={
          <>
            <PlainHead width={100}>Date</PlainHead>
            <PlainHead width={110}>Voucher No.</PlainHead>
            <PlainHead width={110}>Voucher Type</PlainHead>
            <PlainHead width={240}>Narration</PlainHead>
            <PlainHead width={150}>Particular</PlainHead>
            <PlainHead width={110} className="text-right">
              Debit
            </PlainHead>
            <PlainHead width={110} className="text-right">
              Credit
            </PlainHead>
            <PlainHead width={130} className="text-right">
              Running Balance
            </PlainHead>
            <PlainHead width={100} className="text-right">
              Actions
            </PlainHead>
          </>
        }
      >
        {view.rows.map((row) => {
          // Within the whole ledger, so the same row keeps its popover across pages.
          const index = rows.indexOf(row)
          const details = showDetails ? rowDetails(row) : null
          return (
            <Fragment key={index}>
              <TableRow>
                <TableCell>{row.date}</TableCell>
                <TableCell title={String(row.voucher_no ?? '')}>{row.voucher_no}</TableCell>
                <TableCell>{row.vouchertype}</TableCell>
                <TableCell title={row.narration}>{row.narration}</TableCell>
                <TableCell title={row.particular}>{row.particular}</TableCell>
                <TableCell className="text-right tabular-nums">{toAmount(row.debit)}</TableCell>
                <TableCell className="text-right tabular-nums">{toAmount(row.credit)}</TableCell>
                <TableCell className="text-right tabular-nums">{balanceText(row.balance)}</TableCell>
                <TableCell>
                  {isFixedRow(row) ? null : (
                    <RowActions
                      label={`${row.particular || row.narration || 'entry'} of ${row.date}`}
                      // A bank entry is not moved from here; Delete stays.
                      onEdit={row.is_bank_entry === true ? undefined : () => onEdit(ledgerName, row)}
                      deleteConfirm={{
                        open: confirming === index,
                        onOpenChange: (next) => setConfirming(next ? index : null),
                        title: 'Delete entry?',
                        description: `Delete this entry of ${ledgerName}?`,
                        confirmLabel: 'Delete',
                        busy: deleting,
                        onConfirm: async () => {
                          // Stays open on a failure, for another try.
                          if (await onDelete(ledgerName, row)) setConfirming(null)
                        },
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
              {details ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30 p-3 whitespace-normal">
                    <RowDetails details={details} />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          )
        })}
      </DataTable>
      <TablePager view={view} />
    </>
  )
}

export default function ErpLedgerList({ companyName, companyId, companyAddress }) {
  const [financialYear, setFinancialYear] = useState(() => currentFinancialYear())

  const erp = useQuery({
    key: [QUERY.ERP_LEDGER, companyName, financialYear, companyId],
    fetch: () => getErpLedgers(financialYear, companyId).then(readErpLedgers),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const ledgers = erp.data?.ledgers ?? NO_LEDGERS
  const ledgerNames = useMemo(() => ledgers.map((ledger) => ledger.name).sort((a, b) => a.localeCompare(b)), [ledgers])

  /* ---------------- Filters ---------------- */
  const [filters, setFilters] = useState(NO_FILTERS)
  const narrowed = useMemo(() => {
    const filtering = Boolean(filters.search.trim() || filters.from || filters.to || filters.ledger)
    return ledgers
      .filter((ledger) => !filters.ledger || ledger.name === filters.ledger)
      .map((ledger) => ({ ...ledger, rows: filterErpRows(ledger.rows, filters) }))
      .filter((ledger) => !filtering || ledger.rows.length > 0)
  }, [ledgers, filters])
  const view = useListView(narrowed)

  const setFilter = (changes) => {
    setFilters((previous) => ({ ...previous, ...changes }))
    view.setPage(1)
  }

  const listView = {
    ...view,
    search: filters.search,
    setSearch: (search) => setFilter({ search }),
    isFiltered: Object.values(filters).some(Boolean),
    clear: () => {
      view.clear()
      setFilters(NO_FILTERS)
    },
  }

  // Another year has its own ledgers: the one chosen may not be among them, nor the page there.
  const changeYear = (year) => {
    if (!year) return
    setFinancialYear(year)
    setFilter({ ledger: '' })
  }

  /* ---------------- What is open ---------------- */
  const [open, setOpen] = useState({})
  const [details, setDetails] = useState({})

  /* ---------------- Changing an entry ---------------- */
  const [editing, setEditing] = useState(null) // { ledgerName, row }
  const [opening, setOpening] = useState(null) // ledger name
  const [banking, setBanking] = useState(null) // ledger name
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (ledgerName, row) => {
    setDeleting(true)
    try {
      const reply = await deleteErpEntry({
        id: row.id,
        ledger_name: ledgerName,
        position: row.position,
        vouchertype: row.vouchertype,
        module_name: row.module_name || '',
        object_id: row.object_id,
      })
      toast.success(reply?.msg || 'Entry deleted.')
      await erp.reload()
      return true
    } catch (failure) {
      toast.error(failure.message)
      return false
    } finally {
      setDeleting(false)
    }
  }

  const downloadCsv = () => {
    const csv = erpLedgersCsv(narrowed.filter((ledger) => ledger.rows.length > 0), companyName, companyAddress)
    // The mark tells Excel the file is UTF-8, so names and the rupee sign survive.
    downloadTextFile('Ledger_Filtered_Report.csv', `${UTF8_MARK}${csv}`)
  }

  /* ---------------- The list area ---------------- */
  const renderLedger = (ledger) => {
    const isOpen = Boolean(open[ledger.name])
    const showing = Boolean(details[ledger.name])
    const hasDetails = ledger.rows.some((row) => rowDetails(row))
    return (
      <section key={ledger.name} className="rounded-md border border-border">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <ExpandButton
            open={isOpen}
            label={`entries of ${ledger.name}`}
            onClick={() => setOpen((previous) => ({ ...previous, [ledger.name]: !previous[ledger.name] }))}
          />
          <h3 className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere] text-brand">{ledger.name}</h3>
          {hasDetails ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDetails((previous) => ({ ...previous, [ledger.name]: !showing }))
                if (!showing) setOpen((previous) => ({ ...previous, [ledger.name]: true }))
              }}
            >
              {showing ? 'Hide All Details' : 'Show All Details'}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" icon={Plus} onClick={() => setOpening(ledger.name)}>
            Opening Balance
          </Button>
          <Button type="button" variant="outline" size="sm" icon={Landmark} onClick={() => setBanking(ledger.name)}>
            Bank Entry
          </Button>
        </div>

        {isOpen ? (
          <div className="px-3 pb-3">
            <LedgerRows
              key={JSON.stringify(filters)}
              ledgerName={ledger.name}
              rows={ledger.rows}
              showDetails={showing}
              onEdit={(ledgerName, row) => setEditing({ ledgerName, row })}
              onDelete={handleDelete}
              deleting={deleting}
            />
          </div>
        ) : null}
      </section>
    )
  }

  const renderList = () => {
    if (!erp.data) {
      if (erp.status === 'failed') {
        return (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the ledgers" action={<RetryButton onClick={erp.reload} />}>
            {erp.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={5} />
    }

    if (ledgers.length === 0) {
      return (
        <StateMessage icon={ArrowLeftRight} title="No data available">
          {erp.data.message || `Nothing is recorded for ${financialYear}.`}
        </StateMessage>
      )
    }

    return (
      <>
        {erp.status === 'failed' ? <InlineAlert action={<RetryButton onClick={erp.reload} />}>{erp.error}</InlineAlert> : null}

        <TableFilters
          view={listView}
          searchPlaceholder="Search narration or particular"
          extra={
            <>
              <SelectField
                ariaLabel="Ledger"
                size="sm"
                searchable
                searchPlaceholder="Search ledger"
                placeholder="All ledgers"
                options={ledgerNames.map((name) => ({ value: name, label: name }))}
                value={filters.ledger}
                onValueChange={(ledger) => setFilter({ ledger })}
                className="w-full sm:w-44"
              />
              <DateRangeFilter
                label="Date"
                from={filters.from}
                to={filters.to}
                onChange={({ from, to }) => setFilter({ from, to })}
              />
            </>
          }
          actions={
            <Button type="button" variant="outline" size="sm" icon={Download} disabled={narrowed.length === 0} onClick={downloadCsv}>
              Download CSV
            </Button>
          }
        />

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No data available for the selected filters">
            Change or clear the filters to see more.
          </StateMessage>
        ) : (
          <>
            <div className="space-y-2">{view.rows.map(renderLedger)}</div>
            <TablePager view={view} always />
          </>
        )}
      </>
    )
  }

  return (
    <Panel
      title="Ledger Export"
      meta={erp.data ? ` (${narrowed.length})` : null}
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            id="le-financial-year"
            ariaLabel="Financial year"
            size="sm"
            placeholder="Financial year"
            options={YEAR_OPTIONS}
            value={financialYear}
            onValueChange={changeYear}
            className="w-36"
          />
          <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={erp.status === 'loading'} onClick={erp.reload}>
            Refresh
          </Button>
        </div>
      }
    >
      {renderList()}

      {editing ? (
        <EditEntryModal
          companyId={companyId}
          ledgerName={editing.ledgerName}
          row={editing.row}
          ledgerNames={ledgerNames}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await erp.reload()
            setEditing(null)
          }}
        />
      ) : null}

      {opening ? (
        <OpeningBalanceModal
          companyId={companyId}
          partyNames={ledgerNames}
          initialLedger={opening}
          onClose={() => setOpening(null)}
          onSaved={async () => {
            await erp.reload()
            setOpening(null)
          }}
        />
      ) : null}

      {banking ? (
        <BankEntryModal
          companyId={companyId}
          ledgerName={banking}
          onClose={() => setBanking(null)}
          onSaved={async () => {
            await erp.reload()
            setBanking(null)
          }}
        />
      ) : null}
    </Panel>
  )
}

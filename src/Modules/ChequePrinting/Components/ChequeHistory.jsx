import { useMemo, useState } from 'react'
import { AlertCircle, Download, FileCheck, Printer, Receipt, RefreshCw, SearchX } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Field } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, DateRangeFilter, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { CHEQUE_VIEW } from '@/Constants/chequePrinting'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { invalidateQueries, useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import ChequeViewer, { ChequeImage } from '@/Modules/ChequePrinting/Components/ChequeViewer'
import VoucherModal from '@/Modules/ChequePrinting/Components/VoucherModal'
import { chequesCsv, filterCheques, formatTimestamp, readChequeDetails } from '@/Modules/ChequePrinting/chequePrinting'
import { deleteCheque, getChequeDetails } from '@/Services/Accounting/chequeService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * ONE LIST - the vouchers still to post, or every cheque ever made, the same
 * component with `type` saying which. The data is in the shared cache under
 * [CHEQUE_DETAILS, companyId, type].
 *
 *   View Voucher   the cheques not yet verified. Post Voucher, Print, Delete.
 *   Past Data      all of them, with whether each is posted - read from the
 *                  voucher list, as the reply does not say. Post Voucher, Print,
 *                  Download CSV.
 *
 * Search, the date range and the amounts all work in the browser, as the API
 * sends the whole list at once.
 */

const NO_ROWS = []
const NO_FILTERS = Object.freeze({ from: '', to: '', minAmount: '', maxAmount: '' })
const SEARCH_FIELDS = ['payee_name', 'bank_name', 'narration', 'created_by']
const INITIAL_SORT = { field: 'created_on', direction: 'desc' }
const UTF8_MARK = String.fromCharCode(0xfeff)

const TITLES = {
  [CHEQUE_VIEW.VOUCHER]: 'Vouchers',
  [CHEQUE_VIEW.PAST]: 'Past Cheques',
}

/** One list of the module, and how to read it again. */
const useChequeList = (companyId, type, enabled = true) =>
  useQuery({
    key: [QUERY.CHEQUE_DETAILS, companyId, type],
    fetch: () => getChequeDetails(companyId, type).then(readChequeDetails),
    staleTime: MASTER_DATA_STALE_MS,
    enabled,
  })

function PostedBadge({ posted }) {
  if (posted === null) return '--'
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
        posted
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
      )}
    >
      {posted ? 'Posted' : 'Pending'}
    </span>
  )
}

export default function ChequeHistory({ companyName, companyId, type }) {
  const isPast = type === CHEQUE_VIEW.PAST
  const list = useChequeList(companyId, type)
  const pending = useChequeList(companyId, CHEQUE_VIEW.VOUCHER, isPast)
  const rows = list.data ?? NO_ROWS

  const pendingIds = useMemo(() => (pending.data ? new Set(pending.data.map((cheque) => cheque.id)) : null), [pending.data])
  /** Whether a Past Data row has its voucher posted - null until that is known. */
  const postedOf = (cheque) => (pendingIds ? !pendingIds.has(cheque.id) : null)

  const [filters, setFilters] = useState(NO_FILTERS)
  const narrowed = useMemo(() => filterCheques(rows, filters), [rows, filters])
  const listView = useListView(narrowed, { searchFields: SEARCH_FIELDS, initialSort: INITIAL_SORT })
  const view = {
    ...listView,
    isFiltered: listView.isFiltered || Object.values(filters).some(Boolean),
    clear: () => {
      listView.clear()
      setFilters(NO_FILTERS)
    },
  }
  const setFilter = (changes) => {
    setFilters((previous) => ({ ...previous, ...changes }))
    listView.setPage(1)
  }

  const [printing, setPrinting] = useState(null) // the cheque open in the viewer
  const [posting, setPosting] = useState(null) // the cheque open in the voucher form
  const [confirming, setConfirming] = useState(null) // the id being asked about
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (cheque) => {
    setDeleting(true)
    try {
      await deleteCheque(cheque.id)
      toast.success('Cheque deleted successfully.')
      setConfirming(null)
      invalidateQueries(QUERY.CHEQUE_DETAILS, { refetchActive: true })
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  const downloadCsv = () => {
    // Everything the filters leave, on every page - with the mark Excel needs to read it as UTF-8.
    const term = listView.search.trim().toLowerCase()
    const left = narrowed.filter((cheque) => SEARCH_FIELDS.some((field) => String(cheque[field] ?? '').toLowerCase().includes(term)))
    downloadTextFile('chequeReport.csv', `${UTF8_MARK}${chequesCsv(left)}`)
  }

  const renderList = () => {
    if (!list.data) {
      if (list.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the cheques"
            action={<RetryButton onClick={list.reload} />}
          >
            {list.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={5} />
    }

    if (rows.length === 0) {
      return isPast ? (
        <StateMessage icon={Receipt} title="No cheques yet">
          Every cheque you generate is kept here.
        </StateMessage>
      ) : (
        <StateMessage icon={FileCheck} title="No vouchers waiting">
          Each new cheque waits here until its voucher is posted.
        </StateMessage>
      )
    }

    return (
      <>
        {list.status === 'failed' ? <InlineAlert action={<RetryButton onClick={list.reload} />}>{list.error}</InlineAlert> : null}

        <TableFilters
          view={view}
          searchPlaceholder="Search payee, bank, narration"
          extra={
            <>
              <DateRangeFilter
                label="Cheque Date"
                from={filters.from}
                to={filters.to}
                onChange={({ from, to }) => setFilter({ from, to })}
              />
              <Field
                type="number"
                min="0"
                placeholder="Min amount"
                aria-label="Minimum amount"
                value={filters.minAmount}
                onChange={(event) => setFilter({ minAmount: event.target.value })}
                className="w-32"
                inputClassName="h-8"
              />
              <Field
                type="number"
                min="0"
                placeholder="Max amount"
                aria-label="Maximum amount"
                value={filters.maxAmount}
                onChange={(event) => setFilter({ maxAmount: event.target.value })}
                className="w-32"
                inputClassName="h-8"
              />
            </>
          }
        />

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No cheques match">
            Change or clear the filters to see more.
          </StateMessage>
        ) : (
          <>
            <DataTable
              head={
                <>
                  <PlainHead width={120}>Cheque</PlainHead>
                  <SortableHead view={view} field="cheque_date" width={100}>
                    Date
                  </SortableHead>
                  <SortableHead view={view} field="payee_name" width={170}>
                    Payee
                  </SortableHead>
                  <SortableHead view={view} field="bank_name" width={160}>
                    Bank
                  </SortableHead>
                  <SortableHead view={view} field="cheque_amount" width={120} className="text-right">
                    Amount
                  </SortableHead>
                  <PlainHead width={140}>Narration</PlainHead>
                  <SortableHead view={view} field="created_by" width={170}>
                    Created By
                  </SortableHead>
                  <SortableHead view={view} field="created_on" width={140}>
                    Created On
                  </SortableHead>
                  {isPast ? <PlainHead width={90}>Status</PlainHead> : null}
                  <PlainHead width={isPast ? 100 : 130} className="text-right">
                    Actions
                  </PlainHead>
                </>
              }
            >
              {view.rows.map((cheque) => (
                <TableRow key={cheque.id}>
                  <TableCell>
                    <button
                      type="button"
                      aria-label={`View the cheque for ${orDash(cheque.payee_name)}`}
                      disabled={cheque.images.length === 0}
                      onClick={() => setPrinting(cheque)}
                      className="block w-24 cursor-pointer overflow-hidden rounded border border-border outline-none hover:border-brand/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
                    >
                      <ChequeImage compact src={cheque.images[0]} alt="" className="block h-10 w-full object-cover" />
                    </button>
                  </TableCell>
                  <TableCell>{formatDate(cheque.cheque_date)}</TableCell>
                  <TableCell title={cheque.payee_name ?? undefined}>{orDash(cheque.payee_name)}</TableCell>
                  <TableCell title={cheque.bank_name ?? undefined}>{orDash(cheque.bank_name)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatIndianCurrency(cheque.cheque_amount)}</TableCell>
                  <TableCell title={cheque.narration ?? undefined}>{orDash(cheque.narration)}</TableCell>
                  <TableCell title={cheque.created_by ?? undefined}>{orDash(cheque.created_by)}</TableCell>
                  <TableCell>{formatTimestamp(cheque.created_on)}</TableCell>
                  {isPast ? (
                    <TableCell>
                      <PostedBadge posted={postedOf(cheque)} />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="iconEdit"
                        size="icon-sm"
                        icon={Receipt}
                        tooltip="Post voucher"
                        aria-label={`Post the voucher for ${orDash(cheque.payee_name)}`}
                        onClick={() => setPosting(cheque)}
                      />
                      <Button
                        type="button"
                        variant="iconEdit"
                        size="icon-sm"
                        icon={Printer}
                        tooltip="Print cheque"
                        aria-label={`Print the cheque for ${orDash(cheque.payee_name)}`}
                        disabled={cheque.images.length === 0}
                        onClick={() => setPrinting(cheque)}
                      />
                      {isPast ? null : (
                        <RowActions
                          label={orDash(cheque.payee_name)}
                          deleteConfirm={{
                            open: confirming === cheque.id,
                            onOpenChange: (next) => setConfirming(next ? cheque.id : null),
                            title: 'Delete cheque?',
                            description: `Delete the cheque for ${orDash(cheque.payee_name)}? This cannot be undone.`,
                            confirmLabel: 'Delete',
                            busy: deleting,
                            onConfirm: () => handleDelete(cheque),
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
            <TablePager view={view} />
          </>
        )}
      </>
    )
  }

  return (
    <Panel
      title={TITLES[type]}
      meta={list.data ? ` (Total Count: ${listView.total})` : undefined}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={list.status === 'loading'}
            onClick={() => {
              list.reload()
              if (isPast) pending.reload()
            }}
          >
            Refresh
          </Button>
          {isPast ? (
            <Button type="button" variant="outline" size="sm" icon={Download} disabled={listView.total === 0} onClick={downloadCsv}>
              Download CSV
            </Button>
          ) : null}
        </div>
      }
    >
      {renderList()}

      <Modal
        open={Boolean(printing)}
        onOpenChange={() => setPrinting(null)}
        title={printing ? `Cheque - ${orDash(printing.payee_name)}` : 'Cheque'}
        size="xl"
        autoFocus={false}
      >
        {printing ? <ChequeViewer key={printing.id} images={printing.images} /> : null}
      </Modal>

      {posting ? (
        <VoucherModal
          cheque={posting}
          companyName={companyName}
          companyId={companyId}
          alreadyPosted={isPast && postedOf(posting) === true}
          onClose={() => setPosting(null)}
        />
      ) : null}
    </Panel>
  )
}

import { Fragment, useMemo, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, Download, History, RefreshCw, SearchX, Send } from 'lucide-react'
import { useSelector } from 'react-redux'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { historyVoucherPayload } from '@/Modules/JournalVoucher/journalVoucher'
import { deleteJvVoucher, exportJvVouchers, saveJvVouchers } from '@/Services/Accounting/journalVoucherService'
import { selectIsErpKnown, selectIsTallyErp } from '@/Store/Slices/profileSlice'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { downloadFileFromUrl } from '@/Utils/fileDownload'
import { safeFileName } from '@/Utils/pdf'

/**
 * HISTORY - the saved vouchers, by template: the templates on the left, the
 * chosen one's vouchers on the right. A row opens out into its Dr and Cr
 * lines and its narration.
 *
 *   Resend           as the old project's: the voucher is saved again, as a
 *                    copy - in History and Ledger Export twice - and for Tally
 *                    it is first sent there (`tally`, useJvTallySend). Asked
 *                    about first, for the copy. Not delivered, nothing is
 *                    saved; delivered, Tally's answer follows as its own message.
 *   Delete           marks the voucher deleted: it leaves this list, the Excel
 *                    and Ledger Export
 *   Download Excel   this template's vouchers, or every template's
 *
 * Search, sorting and paging work in the browser: the API sends every voucher.
 */

const NO_GROUPS = []
const SEARCH_FIELDS = ['narration', 'firstLedger', 'date']
const INITIAL_SORT = { field: 'date', direction: 'desc' }

function SideTag({ side }) {
  return <span className="ml-1.5 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">{side}</span>
}

function TemplateVouchers({ companyId, group, tally, onChanged }) {
  const rows = useMemo(() => group.vouchers.map((voucher) => ({ ...voucher, firstLedger: voucher.dr[0]?.ledger ?? '' })), [group.vouchers])
  const view = useListView(rows, { searchFields: SEARCH_FIELDS, initialSort: INITIAL_SORT })
  const [open, setOpen] = useState(() => new Set())
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [resendAsked, setResendAsked] = useState(null) // the key being asked about
  const [resending, setResending] = useState(false)

  const isTally = useSelector(selectIsTallyErp)
  const isErpKnown = useSelector(selectIsErpKnown)

  const toggle = (key) =>
    setOpen((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const handleDelete = async (voucher) => {
    setDeleting(true)
    try {
      const reply = await deleteJvVoucher(companyId, group.template, voucher.id)
      toast.success(reply?.msg || 'Voucher deleted successfully.')
      setConfirming(null)
      onChanged()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleResend = async (voucher) => {
    setResending(true)
    let delivered = false
    try {
      const payload = historyVoucherPayload(group.template, voucher)
      if (isTally) {
        // Not delivered, useJvTallySend has said why.
        delivered = await tally.send([payload])
        if (!delivered) return
      }
      await saveJvVouchers(companyId, [payload])
      toast.success(
        isTally ? "Voucher sent to Tally - a copy is saved in History. Tally's answer follows." : 'Voucher resent - a copy is saved in History.',
      )
      setResendAsked(null)
      onChanged()
    } catch (failure) {
      toast.error(delivered ? `The voucher went to Tally, but its copy could not be saved: ${failure.message}` : failure.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <TableFilters view={view} searchPlaceholder="Search narration, ledger, date" />

      {view.rows.length === 0 ? (
        <StateMessage icon={SearchX} title="No vouchers match">
          Change or clear the search to see more.
        </StateMessage>
      ) : (
        <>
          <DataTable
            head={
              <>
                <SortableHead view={view} field="date" width={110}>
                  Date
                </SortableHead>
                <PlainHead width={110}>Voucher Type</PlainHead>
                <SortableHead view={view} field="firstLedger" width={200}>
                  Ledger
                </SortableHead>
                <SortableHead view={view} field="total" width={140} className="text-right">
                  Amount
                </SortableHead>
                <PlainHead width={220}>Narration</PlainHead>
                <PlainHead width={190} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((voucher) => {
              const expanded = open.has(voucher.key)
              const more = voucher.dr.length - 1 + voucher.cr.length
              return (
                <Fragment key={voucher.key}>
                  <TableRow className={cn(expanded && 'bg-brand-soft/40 dark:bg-brand/10')}>
                    <TableCell>{formatDate(voucher.date)}</TableCell>
                    <TableCell>Journal</TableCell>
                    <TableCell title={voucher.firstLedger}>
                      {orDash(voucher.firstLedger)}
                      {more > 0 ? <span className="ml-1 text-xs text-muted-foreground">+{more}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatIndianCurrency(voucher.total)}</TableCell>
                    <TableCell title={voucher.narration}>{orDash(voucher.narration)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="iconEdit"
                          size="icon-sm"
                          icon={expanded ? ChevronUp : ChevronDown}
                          tooltip={expanded ? 'Hide details' : 'Full details of the entry'}
                          aria-label={`${expanded ? 'Hide' : 'Show'} the details of the voucher dated ${formatDate(voucher.date)}`}
                          aria-expanded={expanded}
                          onClick={() => toggle(voucher.key)}
                        />
                        <ConfirmPopover
                          open={resendAsked === voucher.key}
                          onOpenChange={(next) => setResendAsked(next ? voucher.key : null)}
                          title="Resend voucher?"
                          description={
                            isTally
                              ? 'It is sent to Tally again, and a second copy is saved in History and Ledger Export.'
                              : 'A second copy is saved in History and Ledger Export.'
                          }
                          confirmLabel="Resend"
                          variant="default"
                          busy={resending}
                          onConfirm={() => handleResend(voucher)}
                        >
                          <Button
                            type="button"
                            size="sm"
                            icon={Send}
                            tooltip={isTally ? 'Send this voucher to Tally again' : 'Save this voucher again'}
                            aria-label={`Resend the voucher dated ${formatDate(voucher.date)}`}
                            disabled={!isErpKnown || resending || (isTally && tally.sending)}
                          >
                            Resend
                          </Button>
                        </ConfirmPopover>
                        <RowActions
                          label={`voucher dated ${formatDate(voucher.date)}`}
                          deleteConfirm={{
                            open: confirming === voucher.key,
                            onOpenChange: (next) => setConfirming(next ? voucher.key : null),
                            title: 'Delete voucher?',
                            description: 'It leaves History, the Excel and Ledger Export. This cannot be undone.',
                            confirmLabel: 'Delete',
                            busy: deleting,
                            onConfirm: () => handleDelete(voucher),
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>

                  {expanded ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="bg-muted/20 whitespace-normal">
                        <ul className="space-y-1 py-1 text-sm">
                          {[...voucher.dr.map((leg) => ({ ...leg, side: 'Dr' })), ...voucher.cr.map((leg) => ({ ...leg, side: 'Cr' }))].map(
                            (leg, index) => (
                              <li key={`${leg.side}-${index}`} className="flex max-w-xl items-center justify-between gap-4">
                                <span className="min-w-0 truncate" title={leg.ledger}>
                                  {leg.ledger}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {formatIndianCurrency(leg.amount)}
                                  <SideTag side={leg.side} />
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Narration:</span> {orDash(voucher.narration)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </DataTable>
          <TablePager view={view} />
        </>
      )}
    </>
  )
}

export default function VoucherHistory({ companyId, vouchers, tally }) {
  const groups = vouchers.data ?? NO_GROUPS
  const [chosen, setChosen] = useState(null)
  const active = groups.find((group) => group.template === chosen) ?? groups[0] ?? null
  const [exporting, setExporting] = useState(null) // 'all' | 'one'

  const download = async (which) => {
    setExporting(which)
    try {
      const template = which === 'one' ? active.template : undefined
      const url = await exportJvVouchers(companyId, template)
      if (typeof url !== 'string' || !url) throw new Error('The Excel could not be made. Please try again.')
      const name = template ? `JV Vouchers - ${safeFileName(template)}.xlsx` : 'JV Vouchers.xlsx'
      await downloadFileFromUrl(url, name, { keepGivenName: true })
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setExporting(null)
    }
  }

  const refresh = () => invalidateQueries(QUERY.JV_VOUCHERS, { refetchActive: true })

  if (!vouchers.data) {
    return (
      <Panel title="History">
        {vouchers.status === 'failed' ? (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the vouchers" action={<RetryButton onClick={vouchers.reload} />}>
            {vouchers.error}
          </StateMessage>
        ) : (
          <ListSkeleton rows={5} />
        )}
      </Panel>
    )
  }

  if (groups.length === 0) {
    return (
      <Panel
        title="History"
        actions={
          <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={vouchers.status === 'loading'} onClick={vouchers.reload}>
            Refresh
          </Button>
        }
      >
        <StateMessage icon={History} title="No vouchers saved yet">
          Every journal voucher you save is kept here, by template.
        </StateMessage>
      </Panel>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Panel
        title="Templates"
        actions={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            icon={Download}
            tooltip="Download every template's vouchers"
            aria-label="Download every template's vouchers as Excel"
            loading={exporting === 'all'}
            disabled={Boolean(exporting)}
            onClick={() => download('all')}
          />
        }
      >
        <nav aria-label="Templates" className="-mx-1 flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto">
          {groups.map((group) => {
            const current = group.template === active.template
            return (
              <button
                key={group.template}
                type="button"
                aria-current={current || undefined}
                onClick={() => setChosen(group.template)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  current ? 'bg-brand font-medium text-brand-foreground' : 'text-foreground hover:bg-brand-soft hover:text-brand',
                )}
              >
                <span className="min-w-0 truncate" title={group.template}>
                  {group.template}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                    current ? 'bg-brand-foreground/20' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {group.vouchers.length}
                </span>
              </button>
            )
          })}
        </nav>
      </Panel>

      <Panel
        title={active.template}
        meta={` (${active.vouchers.length})`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={vouchers.status === 'loading'} onClick={vouchers.reload}>
              Refresh
            </Button>
            <Button type="button" variant="outline" size="sm" icon={Download} loading={exporting === 'one'} disabled={Boolean(exporting)} onClick={() => download('one')}>
              Download Excel
            </Button>
          </div>
        }
      >
        {vouchers.status === 'failed' ? <InlineAlert action={<RetryButton onClick={vouchers.reload} />}>{vouchers.error}</InlineAlert> : null}
        <TemplateVouchers key={active.template} companyId={companyId} group={active} tally={tally} onChanged={refresh} />
      </Panel>
    </div>
  )
}

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileSpreadsheet } from 'lucide-react'

import { StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { toast } from '@/Library/toast'
import { downloadLedgerEntries, downloadSummary, downloadVoucherEntries } from '@/Modules/BankStatement/bankStatementExport'
import { summaryRows } from '@/Modules/BankStatement/bankStatementModel'
import { formatIndianCurrency } from '@/Utils/currency'

const failed = (error) => toast.error(error?.message || 'The file could not be made.')

const DEBIT = 'text-red-700 dark:text-red-300'
const CREDIT = 'text-emerald-700 dark:text-emerald-300'

/**
 * The end of a statement: every ledger the sent entries went to, with how many
 * of each voucher type and the totals - opened onto its rows by a click - and
 * the Excel downloads.
 */
export default function StatementSummary({ statement, isTally }) {
  const [open, setOpen] = useState(null)

  if (statement.loadingSummary) {
    return (
      <Panel title="Summary">
        <Loader variant="section" label="Loading the summary..." />
      </Panel>
    )
  }

  const summary = statement.summary
  const { rows, total } = summaryRows(summary?.byLedger)

  return (
    <Panel
      title="Summary"
      meta={` (${rows.length} ledgers)`}
      actions={
        rows.length ? (
          <div className="flex flex-wrap gap-2">
            {!isTally ? (
              <Button variant="outline" size="sm" icon={FileSpreadsheet} onClick={() => downloadVoucherEntries(summary.rows).catch(failed)}>
                Voucher Entries
              </Button>
            ) : null}
            <Button variant="outline" size="sm" icon={Download} onClick={() => downloadSummary(summary.byLedger).catch(failed)}>
              Download
            </Button>
          </div>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <StateMessage icon={FileSpreadsheet} title="Nothing was sent">
          No entry of this statement was sent, so there is nothing to sum up.
        </StateMessage>
      ) : (
        <DataTable
          defaultColumnWidth={110}
          head={
            <>
              <PlainHead width={220}>Ledger</PlainHead>
              <PlainHead width={90}>Payment</PlainHead>
              <PlainHead width={90}>Receipt</PlainHead>
              <PlainHead width={90}>Contra</PlainHead>
              <PlainHead width={60}>JV</PlainHead>
              <PlainHead>Debit</PlainHead>
              <PlainHead>Credit</PlainHead>
              <PlainHead>Difference</PlainHead>
              <PlainHead width={72}>Actions</PlainHead>
            </>
          }
        >
          {rows.map((row) => (
            <Fragment key={row.ledger}>
              <TableRow className="cursor-pointer" onClick={() => setOpen(open === row.ledger ? null : row.ledger)}>
                <TableCell title={row.ledger}>
                  <span className="inline-flex items-center gap-1">
                    {open === row.ledger ? <ChevronDown className="size-4 text-brand" /> : <ChevronRight className="size-4 text-brand" />}
                    {row.ledger} ({row.entries.length})
                  </span>
                </TableCell>
                <TableCell>{row.counts.Payment}</TableCell>
                <TableCell>{row.counts.Receipt}</TableCell>
                <TableCell>{row.counts.Contra}</TableCell>
                <TableCell>{row.jv ? 'Yes' : 'No'}</TableCell>
                <TableCell className={DEBIT}>{formatIndianCurrency(row.debit)}</TableCell>
                <TableCell className={CREDIT}>{formatIndianCurrency(row.credit)}</TableCell>
                <TableCell className={row.difference > 0 ? CREDIT : DEBIT}>{formatIndianCurrency(row.difference)}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    icon={Download}
                    aria-label={`Download ${row.ledger} entries`}
                    tooltip="Download"
                    onClick={(event) => {
                      event.stopPropagation()
                      downloadLedgerEntries(row.ledger, row.entries).catch(failed)
                    }}
                  />
                </TableCell>
              </TableRow>
              {open === row.ledger
                ? row.entries.map((entry, index) => (
                    <TableRow key={`${row.ledger}-${entry.sr_no ?? index}`} className="bg-muted/40 text-xs">
                      <TableCell>{entry.date}</TableCell>
                      <TableCell colSpan={4} title={entry.transaction}>
                        {entry.transaction}
                      </TableCell>
                      <TableCell className={DEBIT}>{formatIndianCurrency(Math.abs(Number(entry.debit) || 0))}</TableCell>
                      <TableCell className={CREDIT}>{formatIndianCurrency(Number(entry.credit) || 0)}</TableCell>
                      <TableCell colSpan={2}>{entry.Vouchetype}</TableCell>
                    </TableRow>
                  ))
                : null}
            </Fragment>
          ))}
          <TableRow className="font-semibold">
            <TableCell>Total</TableCell>
            <TableCell>{total.counts.Payment}</TableCell>
            <TableCell>{total.counts.Receipt}</TableCell>
            <TableCell>{total.counts.Contra}</TableCell>
            <TableCell />
            <TableCell className={DEBIT}>{formatIndianCurrency(total.debit)}</TableCell>
            <TableCell className={CREDIT}>{formatIndianCurrency(total.credit)}</TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </DataTable>
      )}
    </Panel>
  )
}

import { useRef, useState } from 'react'
import { AlertCircle, Check, CheckCheck, RefreshCw, ScanSearch, SearchX } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { JV_BANK_SOURCE } from '@/Constants/journalVoucher'
import { QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { assignJvBankEntries, deleteJvBankEntries } from '@/Services/journalVoucherService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'

/**
 * DETECT BANK ENTRIES - bank entries whose ledger is in more than one
 * template, so which voucher they make is a choice. Choosing a template and
 * pressing Assign moves the entry to Bank Entries under that template, to be
 * saved there; Assign All moves every row with a choice, in one request.
 *
 * The choices are kept by each row's content (its `key`), not its sr_no: an
 * assign or a delete numbers the rest again. Nothing is sent while the list
 * is being read again, so the sr_nos sent are always the latest.
 */

const SEARCH_FIELDS = ['ledger', 'narration', 'date']

export default function DetectEntries({ companyId, bankEntries }) {
  const rows = bankEntries.data?.multi ?? []
  const view = useListView(rows, { searchFields: SEARCH_FIELDS })

  const [choices, setChoices] = useState({}) // template chosen, by row key
  const [busy, setBusy] = useState(null) // 'all' | `assign:<row key>` | `delete:<row key>`
  const [confirming, setConfirming] = useState(null)
  const inFlight = useRef(false)

  const reading = bankEntries.status === 'loading'
  const locked = Boolean(busy) || reading
  const chosenRows = rows.filter((row) => choices[row.key])

  const run = async (which, request, after) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(which)
    try {
      await request()
      after()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      invalidateQueries(QUERY.JV_BANK_ENTRIES, { refetchActive: true })
      inFlight.current = false
      setBusy(null)
    }
  }

  const forget = (keys) => setChoices((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !keys.includes(key))))

  const assign = (which, chosen) =>
    run(
      which,
      () =>
        assignJvBankEntries(
          companyId,
          JV_BANK_SOURCE.MULTI,
          chosen.map((row) => ({ sr_no: row.srNo, template: choices[row.key] })),
        ),
      () => {
        forget(chosen.map((row) => row.key))
        toast.success(
          chosen.length === 1
            ? `Moved to Bank Entries under "${choices[chosen[0].key]}".`
            : `${chosen.length} entries moved to Bank Entries.`,
        )
      },
    )

  const remove = (row) =>
    run(
      `delete:${row.key}`,
      () => deleteJvBankEntries(companyId, JV_BANK_SOURCE.MULTI, [row.srNo]),
      () => {
        forget([row.key])
        setConfirming(null)
        toast.success('Entry deleted.')
      },
    )

  const renderBody = () => {
    if (!bankEntries.data) {
      if (bankEntries.status === 'failed') {
        return (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the bank entries" action={<RetryButton onClick={bankEntries.reload} />}>
            {bankEntries.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={5} />
    }

    if (rows.length === 0) {
      return (
        <StateMessage icon={ScanSearch} title="No entries need a template">
          A bank entry whose ledger is in more than one template waits here until you choose which one it belongs to.
        </StateMessage>
      )
    }

    return (
      <>
        {bankEntries.status === 'failed' ? <InlineAlert action={<RetryButton onClick={bankEntries.reload} />}>{bankEntries.error}</InlineAlert> : null}

        <TableFilters view={view} searchPlaceholder="Search ledger, narration, date" />

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No entries match">
            Change or clear the search to see more.
          </StateMessage>
        ) : (
          <>
            <DataTable
              head={
                <>
                  <SortableHead view={view} field="srNo" width={80}>
                    Sr No
                  </SortableHead>
                  <PlainHead width={100}>Date</PlainHead>
                  <SortableHead view={view} field="ledger" width={170}>
                    Ledger
                  </SortableHead>
                  <SortableHead view={view} field="amount" width={120} className="text-right">
                    Amount
                  </SortableHead>
                  <PlainHead width={220}>Narration</PlainHead>
                  <PlainHead width={220}>Select Template</PlainHead>
                  <PlainHead width={140} className="text-right">
                    Actions
                  </PlainHead>
                </>
              }
            >
              {view.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="tabular-nums">{row.srNo}</TableCell>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell title={row.ledger}>{orDash(row.ledger)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatIndianCurrency(row.amount)}</TableCell>
                  <TableCell title={row.narration}>{orDash(row.narration)}</TableCell>
                  <TableCell>
                    <SelectField
                      size="sm"
                      ariaLabel={`Template for entry ${row.srNo}`}
                      placeholder="Select template"
                      options={row.templates.map((name) => ({ value: name, label: name }))}
                      value={choices[row.key] ?? ''}
                      disabled={locked}
                      onValueChange={(value) => setChoices((previous) => ({ ...previous, [row.key]: value }))}
                      onClear={() => forget([row.key])}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        icon={Check}
                        loading={busy === `assign:${row.key}`}
                        disabled={!choices[row.key] || locked}
                        onClick={() => assign(`assign:${row.key}`, [row])}
                      >
                        Assign
                      </Button>
                      <RowActions
                        label={`entry ${row.srNo}`}
                        deleteConfirm={{
                          open: confirming === row.key,
                          onOpenChange: (next) => setConfirming(next && !locked ? row.key : null),
                          title: 'Delete entry?',
                          description: 'The entry is taken off the list without a voucher. This cannot be undone.',
                          confirmLabel: 'Delete',
                          busy: busy === `delete:${row.key}`,
                          onConfirm: () => remove(row),
                        }}
                      />
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
      title="Detect Entries"
      meta={bankEntries.data ? ` (${rows.length} with several matching templates)` : undefined}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={reading} disabled={Boolean(busy)} onClick={bankEntries.reload}>
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            icon={CheckCheck}
            loading={busy === 'all'}
            disabled={chosenRows.length === 0 || locked}
            onClick={() => assign('all', chosenRows)}
          >
            Assign All{chosenRows.length ? ` (${chosenRows.length})` : ''}
          </Button>
        </div>
      }
    >
      {renderBody()}
    </Panel>
  )
}

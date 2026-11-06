import { useRef, useState } from 'react'
import { AlertCircle, Landmark, RefreshCw, Save } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { TablePager } from '@/Components/Common/TableTools'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { JV_BANK_SOURCE } from '@/Constants/journalVoucher'
import { QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import VoucherEditor from '@/Modules/JournalVoucher/Components/VoucherEditor'
import { checkVoucher, toVoucherPayload, voucherFromBankEntry } from '@/Modules/JournalVoucher/journalVoucher'
import { deleteJvBankEntries, saveJvVouchers } from '@/Services/Accounting/journalVoucherService'

/**
 * THE BANK ENTRIES - bank statement entries verified against a JV ledger that
 * is in exactly one template, by template. Each is that template's voucher
 * with the bank's amount on its ledger; the other amounts are filled in here.
 *
 *   Save       the voucher is saved, then its entry is taken off the list
 *   Save All   every entry of the template, in one save and one delete
 *   Delete     the entry goes without a voucher
 *
 * An entry is named by its sr_no, which the backend numbers again after every
 * delete - so nothing is sent while the list is being read again, and what is
 * typed is kept by the entry's content (its `key`), not by its number.
 *
 * If the save works and the delete does not, the entry is still listed with
 * its voucher saved: that is said plainly, so it is not saved twice.
 */

const isClean = (errors) => Object.keys(errors).length === 0

export default function BankEntries({ companyId, bankEntries, ledgers, onOpenDetect }) {
  const groups = bankEntries.data?.single ?? []
  const waiting = bankEntries.data?.multi.length ?? 0

  const [chosenTemplate, setChosenTemplate] = useState(null)
  const activeGroup = groups.find((group) => group.template === chosenTemplate) ?? groups[0] ?? null
  const entries = activeGroup?.entries ?? []

  const [drafts, setDrafts] = useState({}) // what was typed, by entry key
  const [busy, setBusy] = useState(null) // 'all' | `save:<entry key>` | `delete:<entry key>`
  const [confirming, setConfirming] = useState(null) // the key being asked about
  const inFlight = useRef(false)

  const view = useListView(entries, { initialPageSize: 5 })
  const reading = bankEntries.status === 'loading'
  // A ledger is only checked once the company's list is in - nothing is saved unchecked meanwhile.
  const locked = Boolean(busy) || reading || ledgers.loading

  const voucherOf = (entry) => drafts[entry.key] ?? voucherFromBankEntry(entry, ledgers.lookup)
  const errorsOf = (entry) => checkVoucher(voucherOf(entry), ledgers.lookup)
  const faulty = entries.filter((entry) => !isClean(errorsOf(entry))).length

  const forget = (keys) =>
    setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !keys.includes(key))))

  const run = async (which, request) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(which)
    try {
      await request()
    } finally {
      invalidateQueries(QUERY.JV_BANK_ENTRIES, { refetchActive: true })
      inFlight.current = false
      setBusy(null)
    }
  }

  /** Saves the entries' vouchers, then takes the entries off the list. */
  const post = (which, chosen) =>
    run(which, async () => {
      const template = activeGroup.template
      try {
        await saveJvVouchers(
          companyId,
          chosen.map((entry) => toVoucherPayload(template, voucherOf(entry))),
        )
      } catch (failure) {
        toast.error(failure.message)
        return
      }
      invalidateQueries(QUERY.JV_VOUCHERS, { refetchActive: true })
      forget(chosen.map((entry) => entry.key))

      try {
        await deleteJvBankEntries(
          companyId,
          JV_BANK_SOURCE.SINGLE,
          chosen.map((entry) => entry.srNo),
        )
        toast.success(chosen.length === 1 ? 'Voucher saved.' : `${chosen.length} vouchers saved.`)
      } catch (failure) {
        toast.error(
          `The ${chosen.length === 1 ? 'voucher was' : 'vouchers were'} saved, but the bank ${chosen.length === 1 ? 'entry' : 'entries'} could not be cleared: ${failure.message} Delete ${chosen.length === 1 ? 'it' : 'them'} here instead of saving again.`,
        )
      }
    })

  const remove = (entry) =>
    run(`delete:${entry.key}`, async () => {
      try {
        const reply = await deleteJvBankEntries(companyId, JV_BANK_SOURCE.SINGLE, [entry.srNo])
        toast.success(reply?.msg || 'Deleted successfully.')
        forget([entry.key])
        setConfirming(null)
      } catch (failure) {
        toast.error(failure.message)
      }
    })

  const renderBody = () => {
    if (!bankEntries.data) {
      if (bankEntries.status === 'failed') {
        return (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the bank entries" action={<RetryButton onClick={bankEntries.reload} />}>
            {bankEntries.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={4} />
    }

    if (groups.length === 0) {
      return (
        <StateMessage
          icon={Landmark}
          title="No bank entries to post"
          action={
            waiting > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={onOpenDetect}>
                Pick templates for {waiting} {waiting === 1 ? 'entry' : 'entries'}
              </Button>
            ) : null
          }
        >
          Verified bank statement entries of your JV ledgers show here, ready to be made into journal vouchers.
        </StateMessage>
      )
    }

    return (
      <div className="space-y-3">
        {bankEntries.status === 'failed' ? <InlineAlert action={<RetryButton onClick={bankEntries.reload} />}>{bankEntries.error}</InlineAlert> : null}
        {ledgers.error ? <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>{ledgers.error}</InlineAlert> : null}

        <ViewSwitch
          options={groups.map((group) => ({ value: group.template, label: `${group.template} (${group.entries.length})` }))}
          value={activeGroup.template}
          onValueChange={(next) => {
            setChosenTemplate(next)
            view.setPage(1)
          }}
          label="Template"
          idPrefix="jv-bank-template"
          className="w-fit max-w-full justify-start"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-brand">{activeGroup.template}</span> entries
          </p>
          <Button type="button" size="sm" icon={Save} loading={busy === 'all'} disabled={faulty > 0 || locked} onClick={() => post('all', entries)}>
            Save All {entries.length}
          </Button>
        </div>

        {faulty > 0 ? (
          <InlineAlert>
            {faulty === 1 ? '1 entry needs' : `${faulty} entries need`} correcting before all can be saved.
          </InlineAlert>
        ) : null}

        {view.rows.map((entry) => {
          const errors = errorsOf(entry)
          return (
            <div key={entry.key} className="rounded-lg border border-border p-3 sm:p-4">
              <VoucherEditor
                idPrefix={`jv-bank-${entry.srNo}`}
                voucher={voucherOf(entry)}
                onChange={(next) => setDrafts((previous) => ({ ...previous, [entry.key]: next }))}
                ledgers={ledgers}
                disabled={locked}
                header={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-foreground">Sr No: {entry.srNo}</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        icon={Save}
                        loading={busy === `save:${entry.key}`}
                        disabled={!isClean(errors) || locked}
                        onClick={() => post(`save:${entry.key}`, [entry])}
                      >
                        Save
                      </Button>
                      <RowActions
                        label={`bank entry ${entry.srNo}`}
                        deleteConfirm={{
                          open: confirming === entry.key,
                          onOpenChange: (next) => setConfirming(next && !locked ? entry.key : null),
                          title: 'Delete bank entry?',
                          description: 'The entry is taken off the list without a voucher. This cannot be undone.',
                          confirmLabel: 'Delete',
                          busy: busy === `delete:${entry.key}`,
                          onConfirm: () => remove(entry),
                        }}
                      />
                    </div>
                  </div>
                }
              />
            </div>
          )
        })}

        <TablePager view={view} />
      </div>
    )
  }

  return (
    <Panel
      title="Bank Entries"
      meta={bankEntries.data ? ` (${groups.reduce((sum, group) => sum + group.entries.length, 0)})` : undefined}
      actions={
        <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={reading} disabled={Boolean(busy)} onClick={bankEntries.reload}>
          Refresh
        </Button>
      }
    >
      {renderBody()}
    </Panel>
  )
}

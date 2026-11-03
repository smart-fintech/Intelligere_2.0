import { useMemo, useRef, useState } from 'react'
import { AlertCircle, BookOpen, Download, Save, SearchX, X } from 'lucide-react'
import { useSelector } from 'react-redux'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field } from '@/Components/Common/FormFields'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { JV_LEDGER_ENTRY, JV_LEDGER_ENTRY_OPTIONS } from '@/Constants/journalVoucher'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { JV_LEDGER_CSV_FORMAT_CONTENT, JV_LEDGER_CSV_FORMAT_FILE, setJvLedgers, uploadJvLedgers } from '@/Services/journalVoucherService'
import { selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * Which of the company's ledgers are JV ledgers. A bank statement entry
 * verified against one becomes a bank entry here, and a template's debit
 * accounts are chosen from them.
 *
 *   Add JV Ledgers      pick from the ledgers that are not JV ledgers yet;
 *                       the list below takes one off again
 *   Upload JV Ledgers   a CSV with a "Ledger Name" column; each name the
 *                       company has becomes a JV ledger (others are passed over)
 *
 * Both answer only { msg }, so the list is read again after either.
 */

const NO_ROWS = []

export default function JvLedgers({ companyId, jvLedgers, ledgers, onClose }) {
  const allRows = useSelector(selectLedgers)
  const loadedFor = useSelector(selectLedgersCompanyId)
  const companyLedgers = loadedFor === companyId ? allRows : NO_ROWS

  const [entry, setEntry] = useState(JV_LEDGER_ENTRY.PICK)
  const [chosen, setChosen] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null) // 'add' | 'upload' | a ledger id being taken off
  const inFlight = useRef(false)

  const current = jvLedgers.data ?? NO_ROWS
  const currentIds = useMemo(() => new Set(current.map((ledger) => String(ledger.id))), [current])

  /**
   * The ledgers that may be added: every one not a JV ledger already, A to Z.
   * The ledger list calls its id `ledger_obj_id`; the JV ledger list, `id`.
   */
  const addable = useMemo(
    () =>
      companyLedgers
        .filter((row) => row.ledger_obj_id !== undefined && row.ledeger_name && !currentIds.has(String(row.ledger_obj_id)))
        .map((row) => ({ value: String(row.ledger_obj_id), label: row.ledeger_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [companyLedgers, currentIds],
  )

  const term = search.trim().toLowerCase()
  const shown = term ? current.filter((ledger) => ledger.name.toLowerCase().includes(term)) : current

  const run = async (which, request, after) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(which)
    try {
      const reply = await request()
      toast.success(reply?.msg || 'Journal Voucher ledger updated successfully.')
      after?.()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      invalidateQueries(QUERY.JV_LEDGERS, { refetchActive: true })
      inFlight.current = false
      setBusy(null)
    }
  }

  const add = () =>
    run(
      'add',
      () => setJvLedgers(companyId, chosen.map((id) => ({ id: Number(id), jv: true }))),
      () => setChosen([]),
    )

  const takeOff = (ledger) => run(String(ledger.id), () => setJvLedgers(companyId, [{ id: ledger.id, jv: false }]))

  const upload = (file) => {
    if (file.size === 0) {
      toast.error('This file is empty.')
      return
    }
    run('upload', () => uploadJvLedgers(companyId, file))
  }

  const renderList = () => {
    if (!jvLedgers.data) {
      if (jvLedgers.status === 'failed') {
        return (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the JV ledgers" action={<RetryButton onClick={jvLedgers.reload} />}>
            {jvLedgers.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={3} />
    }

    if (current.length === 0) {
      return (
        <StateMessage icon={BookOpen} title="No JV ledgers yet">
          Add the ledgers whose bank entries should become journal vouchers.
        </StateMessage>
      )
    }

    return (
      <div className="space-y-3">
        {jvLedgers.status === 'failed' ? <InlineAlert action={<RetryButton onClick={jvLedgers.reload} />}>{jvLedgers.error}</InlineAlert> : null}
        {current.length > 8 ? (
          <Field
            type="search"
            placeholder="Search JV ledgers"
            aria-label="Search JV ledgers"
            className="max-w-xs"
            inputClassName="h-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        ) : null}
        {shown.length === 0 ? (
          <StateMessage icon={SearchX} title="No JV ledgers match">
            Change or clear the search to see more.
          </StateMessage>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((ledger) => (
              <li
                key={ledger.id}
                className="flex items-center gap-2 rounded-md border border-border border-l-4 border-l-brand bg-card py-1.5 pr-1.5 pl-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate" title={ledger.name}>
                  {ledger.name}
                </span>
                <Button
                  type="button"
                  variant="iconDelete"
                  size="icon-sm"
                  icon={X}
                  tooltip="Remove from JV ledgers"
                  aria-label={`Remove ${ledger.name} from JV ledgers`}
                  loading={busy === String(ledger.id)}
                  disabled={Boolean(busy)}
                  onClick={() => takeOff(ledger)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <Panel
      title="JV Ledgers"
      meta={jvLedgers.data ? ` (${current.length} selected)` : undefined}
      actions={
        <Button type="button" variant="ghost" size="sm" icon={X} disabled={Boolean(busy)} onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <ViewSwitch
          options={JV_LEDGER_ENTRY_OPTIONS}
          value={entry}
          onValueChange={(next) => {
            if (!busy) setEntry(next)
          }}
          label="How to add JV ledgers"
          idPrefix="jv-ledger-entry"
          className="w-fit max-w-full"
        />

        {entry === JV_LEDGER_ENTRY.PICK ? (
          <div className="space-y-2">
            {ledgers.error ? <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>{ledgers.error}</InlineAlert> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <MultiSelectField
                id="jv-ledger-pick"
                label="Select Ledgers"
                className="min-w-0 flex-1"
                options={addable}
                value={chosen}
                onChange={setChosen}
                disabled={Boolean(busy) || ledgers.loading || addable.length === 0}
                placeholder={ledgers.loading ? 'Loading ledgers...' : addable.length === 0 ? 'Every ledger is a JV ledger' : 'Select ledgers'}
                searchPlaceholder="Search ledger"
              />
              <Button type="button" icon={Save} loading={busy === 'add'} disabled={chosen.length === 0 || Boolean(busy)} onClick={add}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Fill in the format with one ledger name per row, spelt as in your ledgers. Each one found becomes a JV
              ledger.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Download}
                onClick={() => downloadTextFile(JV_LEDGER_CSV_FORMAT_FILE, JV_LEDGER_CSV_FORMAT_CONTENT)}
              >
                Download Format
              </Button>
              <CsvUploadButton variant="outline" size="sm" loading={busy === 'upload'} disabled={Boolean(busy)} onFileSelect={upload}>
                Upload CSV
              </CsvUploadButton>
            </div>
          </div>
        )}

        <div className="border-t border-border pt-3">{renderList()}</div>
      </div>
    </Panel>
  )
}

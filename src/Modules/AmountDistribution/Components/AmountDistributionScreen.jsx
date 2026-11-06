import { useEffect, useMemo, useState } from 'react'
import { Download, Save, Send, Split } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'

import { InlineAlert, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Loader } from '@/Components/Common/Loader'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { AD_MODE_OPTIONS, AD_SOURCE, AD_SOURCE_OPTIONS, AD_VOUCHER_TYPE_OPTIONS } from '@/Constants/amountDistribution'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import DistributionResult from '@/Modules/AmountDistribution/Components/DistributionResult'
import { EMPTY_FORM, buildDistributionPayload, checkDistribution, readDistribution } from '@/Modules/AmountDistribution/amountDistribution'
import useTallySync from '@/Modules/PayableReceivable/useTallySync'
import {
  TALLY_AMOUNT_DISTRIBUTION_MODULE,
  buildAmountDistributionTallyMessage,
  generateAmountDistribution,
  saveAmountDistribution,
} from '@/Services/Accounting/amountDistributionService'
import { fetchLedgers, selectLedgerError, selectLedgerStatus, selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'
import { selectIsIntelligereErp, selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * The module's screen: the form on the left, what it generated on the right.
 *
 *   Fixed Entry, Variable Entry   the same form, the same call - `source` says
 *                                 which. Changing it keeps what is typed and
 *                                 drops the result, which was the other kind.
 *   Generate                      nothing is in the books yet: the entries come
 *                                 back to be looked at, one block per ledger.
 *   Download Entries              a plain link to the reply's `file`, a complete
 *                                 URL: the browser downloads it, nothing is fetched
 *   Save Entries (Intelligere)    POST save_amount_distribution/ { id }
 *   Send to Tally (Tally)         over the shared socket (useTallySync). For a
 *                                 Tally user the entries reach the books through
 *                                 Tally, so they are not saved here as well - as
 *                                 the old backend, which saved only non-Tally ones.
 *
 * Saving or sending the same result twice would double the entries, so each
 * can be done once; a new Generate starts over.
 */

const SEND_MESSAGES = Object.freeze({
  done: 'Entries sent to Tally.',
  failed: 'Tally could not take the entries.',
})
const NO_LEDGERS = []

export default function AmountDistributionScreen({ companyName, companyId }) {
  const dispatch = useDispatch()
  const isTally = useSelector(selectIsTallyErp)
  const isIntelligere = useSelector(selectIsIntelligereErp)

  const [source, setSource] = useState(AD_SOURCE.FIXED)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null) // readDistribution
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false) // this result has been saved or sent

  /* ---------------- The ledgers offered ---------------- */
  const storeLedgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)
  const ledgerError = useSelector(selectLedgerError)
  const ledgers = ledgersFor === companyId ? storeLedgers : NO_LEDGERS

  useEffect(() => {
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  const ledgerOptions = useMemo(
    () =>
      [...new Set(ledgers.map((ledger) => ledger.ledeger_name).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [ledgers],
  )

  const sync = useTallySync({
    moduleName: TALLY_AMOUNT_DISTRIBUTION_MODULE,
    companyName,
    buildMessage: buildAmountDistributionTallyMessage,
    messages: SEND_MESSAGES,
    onSuccess: () => setDone(true),
  })

  const busy = generating || saving || sync.syncing
  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }))

  const changeSource = (next) => {
    if (busy) return
    setSource(next)
    setResult(null)
    setDone(false)
  }

  const generate = async () => {
    const found = checkDistribution(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setGenerating(true)
    setResult(null)
    setDone(false)
    try {
      const reply = readDistribution(await generateAmountDistribution(buildDistributionPayload(form, source, companyId)))
      if (reply.rows.length === 0) {
        toast.error(reply.message || 'No entries were generated. Please check the details and try again.')
        return
      }
      setResult(reply)
      toast.success(`${source === AD_SOURCE.FIXED ? 'Fixed' : 'Variable'} amount generated successfully.`)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const reply = await saveAmountDistribution(result.id)
      setDone(true)
      toast.success(reply?.msg || 'Entries saved successfully.')
      // Saved entries show in the Payable Receivable module's ledger reports.
      invalidateQueries(QUERY.LEDGER_REPORT)
      invalidateQueries(QUERY.ERP_LEDGER)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setSaving(false)
    }
  }

  const resultActions = result ? (
    <div className="flex flex-wrap items-center gap-2">
      {result.file ? (
        <Button asChild variant="outline" size="sm">
          <a href={result.file} target="_blank" rel="noopener noreferrer" download>
            <Download />
            Download Entries
          </a>
        </Button>
      ) : null}
      {isIntelligere ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Save}
          loading={saving}
          disabled={done || busy || result.id === null}
          onClick={save}
        >
          {done ? 'Saved' : 'Save Entries'}
        </Button>
      ) : null}
      {isTally ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Send}
          loading={sync.syncing}
          disabled={done || busy}
          onClick={() => sync.start(result.rows)}
        >
          {done ? 'Sent to Tally' : sync.syncing ? 'Sending...' : 'Send to Tally'}
        </Button>
      ) : null}
    </div>
  ) : null

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Amount Distribution</h1>

        <ViewSwitch
          options={AD_SOURCE_OPTIONS}
          value={source}
          onValueChange={changeSource}
          label="Amount Distribution type"
          idPrefix="ad-source"
          className="mx-auto w-fit max-w-full"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="Distribution Details">
          {ledgerStatus === 'failed' ? (
            <InlineAlert action={<RetryButton onClick={() => dispatch(fetchLedgers({ companyId, force: true }))} />}>
              {ledgerError}
            </InlineAlert>
          ) : null}

          <FormGrid>
            <Field id="ad-company" label="Active Company" className="sm:col-span-2" value={companyName} disabled readOnly />
            <SelectField
              id="ad-opposite-ledger"
              label="From Ledger"
              required
              searchable
              searchPlaceholder="Search ledger"
              className="sm:col-span-2"
              placeholder={ledgerStatus === 'loading' ? 'Loading ledgers...' : 'Select ledger'}
              options={ledgerOptions}
              value={form.oppositeLedger}
              error={errors.oppositeLedger}
              disabled={busy}
              onValueChange={(value) => setField('oppositeLedger', value)}
              onClear={() => setField('oppositeLedger', '')}
            />
            <MultiSelectField
              id="ad-ledgers"
              label="To Ledgers"
              required
              className="sm:col-span-2"
              placeholder={ledgerStatus === 'loading' ? 'Loading ledgers...' : 'Select one or more ledgers'}
              searchPlaceholder="Search ledger"
              options={ledgerOptions}
              value={form.ledgers}
              error={errors.ledgers}
              disabled={busy}
              onChange={(value) => setField('ledgers', value)}
            />

            {form.ledgers.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto p-0.5 sm:col-span-2">
                {form.ledgers.map((ledger, index) => (
                  <Field
                    key={ledger}
                    id={`ad-narration-${index}`}
                    label={`Narration - ${ledger}`}
                    placeholder="Optional"
                    value={form.narrations[ledger] ?? ''}
                    disabled={busy}
                    onChange={(event) => setField('narrations', { ...form.narrations, [ledger]: event.target.value })}
                  />
                ))}
              </div>
            ) : null}

            <SelectField
              id="ad-mode"
              label="Mode"
              required
              placeholder="Select mode"
              options={AD_MODE_OPTIONS}
              value={form.mode}
              error={errors.mode}
              disabled={busy}
              onValueChange={(value) => setField('mode', value)}
            />
            <SelectField
              id="ad-voucher-type"
              label="Voucher Type"
              required
              placeholder="Select voucher type"
              options={AD_VOUCHER_TYPE_OPTIONS}
              value={form.voucherType}
              error={errors.voucherType}
              disabled={busy}
              onValueChange={(value) => setField('voucherType', value)}
            />
            <Field
              id="ad-total-amount"
              label="Total Amount"
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter amount"
              value={form.totalAmount}
              error={errors.totalAmount}
              disabled={busy}
              onChange={(event) => setField('totalAmount', event.target.value)}
            />
            <Field
              id="ad-entries"
              label="Total Entries"
              required
              type="number"
              min="1"
              step="1"
              placeholder="Enter entries"
              value={form.entries}
              error={errors.entries}
              disabled={busy}
              onChange={(event) => setField('entries', event.target.value)}
            />
            <Field
              id="ad-date"
              label="Start Date"
              required
              type="date"
              value={form.date}
              error={errors.date}
              disabled={busy}
              onChange={(event) => setField('date', event.target.value)}
            />
            <Field
              id="ad-end-date"
              label="End Date"
              required
              type="date"
              min={form.date || undefined}
              value={form.endDate}
              error={errors.endDate}
              disabled={busy}
              onChange={(event) => setField('endDate', event.target.value)}
            />
          </FormGrid>

          <div className="mt-4 flex justify-end">
            <Button type="button" variant="secondary" loading={generating} disabled={busy} onClick={generate}>
              Generate
            </Button>
          </div>
        </Panel>

        <Panel
          title="Amount Distribution"
          meta={result ? ` (Total Count: ${result.rows.length})` : undefined}
          actions={resultActions}
        >
          {generating ? (
            <Loader variant="page" label="Generating entries..." />
          ) : result ? (
            <div className="space-y-3">
              {isIntelligere && result.id === null ? (
                <InlineAlert>The server did not return an id for these entries, so they cannot be saved.</InlineAlert>
              ) : null}
              {result.rows.map((row, index) => (
                <DistributionResult key={`${row.ledger}-${index}`} row={row} />
              ))}
            </div>
          ) : (
            <StateMessage icon={Split} title="Nothing generated yet">
              Fill in the details and press Generate. The entries show here before anything is saved.
            </StateMessage>
          )}
        </Panel>
      </div>
    </div>
  )
}

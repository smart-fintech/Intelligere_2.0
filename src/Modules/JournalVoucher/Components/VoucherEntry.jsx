import { useRef, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, Save, Send, Trash2, X } from 'lucide-react'
import { useSelector } from 'react-redux'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { InlineAlert, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { TablePager } from '@/Components/Common/TableTools'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { JV_VOUCHER_ENTRY, JV_VOUCHER_ENTRY_OPTIONS } from '@/Constants/journalVoucher'
import { QUERY } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import VoucherEditor from '@/Modules/JournalVoucher/Components/VoucherEditor'
import { checkVoucher, toVoucherPayload, voucherFromTemplate, voucherFromUpload } from '@/Modules/JournalVoucher/journalVoucher'
import { exportJvTemplate, readJvVoucherExcel, saveJvVouchers } from '@/Services/Accounting/journalVoucherService'
import { selectIsErpKnown, selectIsTallyErp } from '@/Store/Slices/profileSlice'
import { downloadFileFromUrl } from '@/Utils/fileDownload'
import { safeFileName } from '@/Utils/pdf'

/**
 * Vouchers from one template - typed in, or read from its Excel.
 *
 *   Voucher        one voucher: the template's ledgers, the amounts to fill in.
 *                  Saved, the amounts and narration are emptied for the next.
 *   Upload Excel   Download Format gives the template's sheet; the filled one
 *                  comes back as vouchers to look over, correct and save - one
 *                  at a time or all at once. Nothing is saved by the upload.
 *                  A row without a valid date is left out by the backend.
 *
 * Saved vouchers go to History and to Ledger Export as Journal entries. The
 * screen is remounted per template (its `key`), so nothing of one template's
 * vouchers is left on another's.
 *
 * For a Tally user each Save is Send to Tally, as in the old project: the
 * vouchers are saved here first, then sent (`tally`, useJvTallySend) and
 * the button waits for Tally's answer. What Tally refuses is already in
 * History, where Resend sends it again - so the form is emptied either way,
 * and a second click cannot save it twice. Until the ERP is known, nothing
 * is saved: a Tally user's voucher would miss Tally.
 *
 * A ref stops a double click saving twice, before `saving` has rendered.
 */

const isClean = (errors) => Object.keys(errors).length === 0

/** One voucher read from the Excel, with its own Save and Remove - each called with it. */
function PreviewCard({ preview, errors, ledgers, isTally, saving, disabled, busy, onChange, onSave, onRemove }) {
  return (
    <div className="rounded-lg border border-border p-3 sm:p-4">
      <VoucherEditor
        idPrefix={`jv-${preview.key}`}
        voucher={preview}
        onChange={onChange}
        ledgers={ledgers}
        disabled={disabled}
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-foreground">Sr No: {preview.srNo}</span>
              {isClean(errors) ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" /> {isTally ? 'Ready to send' : 'Ready to save'}
                </span>
              ) : (
                <span className="text-xs font-medium text-destructive">Needs correcting</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                icon={isTally ? Send : Save}
                loading={saving}
                disabled={!isClean(errors) || busy}
                onClick={() => onSave(preview)}
              >
                {isTally ? 'Send to Tally' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="iconDelete"
                size="icon-sm"
                icon={Trash2}
                tooltip="Remove from the list"
                aria-label={`Remove voucher ${preview.srNo}`}
                disabled={busy}
                onClick={() => onRemove(preview.key)}
              />
            </div>
          </div>
        }
      />
    </div>
  )
}

export default function VoucherEntry({ companyId, template, ledgers, tally, onClose }) {
  const isTally = useSelector(selectIsTallyErp)
  const isErpKnown = useSelector(selectIsErpKnown)

  const [entry, setEntry] = useState(JV_VOUCHER_ENTRY.FORM)
  const [voucher, setVoucher] = useState(() => voucherFromTemplate(template))
  const [previews, setPreviews] = useState(null) // the vouchers read from the Excel, or null before
  const [reading, setReading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(null) // 'form' | 'all' | a preview's key - till Tally answers, for Tally
  const [missedTally, setMissedTally] = useState(0) // vouchers saved that Tally did not take
  const inFlight = useRef(false)

  const previewView = useListView(previews ?? [], { initialPageSize: 5 })
  const previewErrors = (previews ?? []).map((preview) => checkVoucher(preview, ledgers.lookup))
  const faulty = previewErrors.filter((errors) => !isClean(errors)).length

  const release = () => {
    inFlight.current = false
    setSaving(null)
  }

  /** Saves the vouchers and calls `onSaved` - then, for Tally, sends them and waits for its answer. */
  const save = async (which, vouchers, onSaved) => {
    if (inFlight.current || tally.sending) return
    inFlight.current = true
    setSaving(which)
    setMissedTally(0)
    let waitingForTally = false
    try {
      const payloads = vouchers.map((one) => toVoucherPayload(template.name, one))
      const reply = await saveJvVouchers(companyId, payloads)
      invalidateQueries(QUERY.JV_VOUCHERS, { refetchActive: true })
      onSaved()
      if (!isTally) {
        toast.success(reply?.msg || 'Voucher saved successfully.')
        return
      }
      waitingForTally = true
      await tally.send(payloads, {
        onSent: release,
        onFailed: () => {
          setMissedTally(payloads.length)
          release()
        },
      })
    } catch (failure) {
      toast.error(failure.message)
      waitingForTally = false
    } finally {
      if (!waitingForTally) release()
    }
  }

  // The date stays: the next voucher is often for the same day.
  const saveForm = () =>
    save('form', [voucher], () =>
      setVoucher((previous) => ({ ...previous, narration: '', legs: previous.legs.map((leg) => ({ ...leg, amount: '' })) })),
    )

  const removePreview = (key) => setPreviews((previous) => previous.filter((preview) => preview.key !== key))

  const savePreview = (preview) => save(preview.key, [preview], () => removePreview(preview.key))

  const saveAll = () => save('all', previews, () => setPreviews(null))

  const downloadFormat = async () => {
    setDownloading(true)
    try {
      const url = await exportJvTemplate(companyId, template.name)
      if (typeof url !== 'string' || !url) throw new Error('The format file could not be made. Please try again.')
      await downloadFileFromUrl(url, `${safeFileName(template.name)}.xlsx`, { keepGivenName: true })
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDownloading(false)
    }
  }

  const readExcel = async (file) => {
    if (file.size === 0) {
      toast.error('This file is empty.')
      return
    }
    setReading(true)
    try {
      const rows = await readJvVoucherExcel(companyId, template.name, file)
      const read = (Array.isArray(rows) ? rows : []).map((row, index) => voucherFromUpload(row, index, ledgers.lookup))
      if (read.length === 0) {
        toast.error('No vouchers were found. Each row needs a valid date in the Date column.')
        return
      }
      setPreviews(read)
      previewView.setPage(1)
      toast.success(`${read.length} ${read.length === 1 ? 'voucher' : 'vouchers'} read. Check them, then save.`)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setReading(false)
    }
  }

  const busy = Boolean(saving) || reading
  // A Resend from History may be with Tally too: nothing more is sent till it answers.
  const saveLocked = busy || !isErpKnown || (isTally && tally.sending)

  const renderForm = () => {
    const errors = checkVoucher(voucher, ledgers.lookup)
    return (
      <div className="space-y-4">
        <VoucherEditor
          idPrefix="jv-form"
          voucher={voucher}
          onChange={setVoucher}
          ledgers={ledgers}
          lockLedgers
          disabled={saving === 'form'}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            icon={isTally ? Send : Save}
            loading={saving === 'form'}
            disabled={!isClean(errors) || saveLocked}
            onClick={saveForm}
          >
            {isTally ? 'Send to Tally' : 'Save Voucher'}
          </Button>
        </div>
      </div>
    )
  }

  const renderUpload = () => {
    if (reading) return <Loader variant="page" label="Reading the Excel..." description="A long sheet can take a little while." />

    if (!previews) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download the format, fill one voucher per row - a date in the Date column, the amounts under each ledger, and
            the party&apos;s ledger name in the last column when the template has one - then upload it to check before
            saving.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" icon={Download} loading={downloading} onClick={downloadFormat}>
              Download Format
            </Button>
            <CsvUploadButton variant="outline" size="sm" accept=".xlsx" icon={FileSpreadsheet} onFileSelect={readExcel}>
              Upload Filled Excel
            </CsvUploadButton>
          </div>
        </div>
      )
    }

    if (previews.length === 0) {
      return (
        <StateMessage
          icon={CheckCircle2}
          title="Every voucher is saved or removed"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviews(null)}>
              Upload another file
            </Button>
          }
        >
          The saved vouchers are in History.
        </StateMessage>
      )
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-brand">
            Voucher Preview <span className="font-normal text-muted-foreground">({previews.length})</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" icon={X} disabled={busy} onClick={() => setPreviews(null)}>
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              icon={isTally ? Send : Save}
              loading={saving === 'all'}
              disabled={faulty > 0 || saveLocked || ledgers.loading}
              onClick={saveAll}
            >
              {isTally ? `Send All ${previews.length} to Tally` : `Save All ${previews.length}`}
            </Button>
          </div>
        </div>

        {faulty > 0 ? (
          <InlineAlert>
            {faulty === 1 ? '1 voucher needs' : `${faulty} vouchers need`} correcting before all can be saved.
          </InlineAlert>
        ) : null}

        {previewView.rows.map((preview) => (
          <PreviewCard
            key={preview.key}
            preview={preview}
            errors={previewErrors[previews.indexOf(preview)] ?? {}}
            ledgers={ledgers}
            isTally={isTally}
            saving={saving === preview.key}
            disabled={saving === preview.key || saving === 'all'}
            busy={saveLocked || ledgers.loading}
            onChange={(next) => setPreviews((previous) => previous.map((one) => (one.key === preview.key ? next : one)))}
            onSave={savePreview}
            onRemove={removePreview}
          />
        ))}

        <TablePager view={previewView} pageSizeChoice={false} />
      </div>
    )
  }

  return (
    <Panel
      title="Voucher"
      meta={` (${template.name})`}
      actions={
        <Button type="button" variant="ghost" size="sm" icon={X} disabled={busy} onClick={onClose}>
          Close
        </Button>
      }
    >
      {ledgers.error ? <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>{ledgers.error}</InlineAlert> : null}
      {missedTally > 0 ? (
        <InlineAlert>
          {missedTally === 1 ? 'The voucher is' : `${missedTally} vouchers are`} saved in History, but did not get into Tally.
          Once the cause in the message is put right, use Resend in History to send {missedTally === 1 ? 'it' : 'them'} again.
        </InlineAlert>
      ) : null}

      <ViewSwitch
        options={JV_VOUCHER_ENTRY_OPTIONS}
        value={entry}
        onValueChange={(next) => {
          if (!busy) setEntry(next)
        }}
        label="How to enter vouchers"
        idPrefix="jv-entry"
        className="mb-4 w-fit max-w-full"
      />

      {entry === JV_VOUCHER_ENTRY.FORM ? renderForm() : renderUpload()}
    </Panel>
  )
}

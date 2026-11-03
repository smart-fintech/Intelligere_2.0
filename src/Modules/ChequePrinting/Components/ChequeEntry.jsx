import { useRef, useState } from 'react'
import { Download, FileText, Landmark, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { InlineAlert, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { CHEQUE_ENTRY, CHEQUE_ENTRY_OPTIONS } from '@/Constants/chequePrinting'
import { QUERY } from '@/Constants/queryKeys'
import { ROUTES } from '@/Constants/routes'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import ChequeViewer from '@/Modules/ChequePrinting/Components/ChequeViewer'
import { checkChequeForm, emptyChequeForm, readChequeResult, toChequeDate } from '@/Modules/ChequePrinting/chequePrinting'
import { useBankOptions } from '@/Modules/ChequePrinting/useChequeOptions'
import {
  CHEQUE_CSV_FORMAT_CONTENT,
  CHEQUE_CSV_FORMAT_FILE,
  printCheque,
  printChequesFromCsv,
} from '@/Services/chequeService'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * Making cheques: the form or the CSV on the left, what came back on the right.
 *
 *   Single Cheque   payee, bank (the company's own accounts), date, amount
 *   CSV             Download Format, choose a file, Generate. The file is
 *                   checked by CsvUploadButton; its rows by the backend.
 *
 * A ref stops a double click sending twice, before `generating` has rendered:
 * the backend turns away a repeat as a duplicate cheque. Either way the lists
 * are marked as changed - a CSV the backend stops at a duplicate has already
 * saved the rows before it.
 */
export default function ChequeEntry({ companyId }) {
  const banks = useBankOptions(companyId)

  const [entry, setEntry] = useState(CHEQUE_ENTRY.FORM)
  const [form, setForm] = useState(emptyChequeForm)
  const [errors, setErrors] = useState({})
  const [file, setFile] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null) // { images, at } - `at` starts the viewer afresh
  const sending = useRef(false)

  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }))

  const send = async (request, onGenerated) => {
    if (sending.current) return
    sending.current = true
    setGenerating(true)
    try {
      const reply = readChequeResult(await request())
      if (!reply.ok) {
        toast.error(reply.message || 'No cheques were generated. Please check the details and try again.')
        return
      }
      setResult({ images: reply.images, at: Date.now() })
      onGenerated()
      toast.success(reply.message || 'Cheque processed successfully.')
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      invalidateQueries(QUERY.CHEQUE_DETAILS, { refetchActive: true })
      sending.current = false
      setGenerating(false)
    }
  }

  const submitForm = () => {
    const found = checkChequeForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    send(
      () =>
        printCheque({
          companyId,
          payeeName: form.payeeName.trim(),
          bankName: form.bankName,
          chequeDate: toChequeDate(form.chequeDate),
          chequeAmount: String(form.chequeAmount).trim(),
        }),
      // The bank and date stay: the next cheque is often from the same book.
      () => setForm((previous) => ({ ...previous, payeeName: '', chequeAmount: '' })),
    )
  }

  const submitFile = () => send(() => printChequesFromCsv({ companyId, file }), () => setFile(null))

  const chooseFile = (picked) => {
    if (picked.size === 0) toast.error('This file is empty.')
    else setFile(picked)
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Panel title="Cheque Details">
        <ViewSwitch
          options={CHEQUE_ENTRY_OPTIONS}
          value={entry}
          onValueChange={(next) => {
            if (!generating) setEntry(next)
          }}
          label="How to enter cheques"
          idPrefix="cheque-entry"
          className="mb-4 w-full"
        />

        {entry === CHEQUE_ENTRY.FORM ? (
          <>
            {banks.error ? <InlineAlert action={<RetryButton onClick={banks.retry} />}>{banks.error}</InlineAlert> : null}
            {!banks.loading && !banks.error && banks.options.length === 0 ? (
              <StateMessage
                icon={Landmark}
                title="No bank accounts yet"
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link to={ROUTES.BANK_DETAILS}>Add a bank</Link>
                  </Button>
                }
              >
                A cheque is drawn on one of the company&apos;s bank accounts, so add one first.
              </StateMessage>
            ) : (
              <>
                <FormGrid>
                  <Field
                    id="cheque-payee"
                    label="Payee Name"
                    required
                    className="sm:col-span-2"
                    placeholder="Enter payee name"
                    value={form.payeeName}
                    error={errors.payeeName}
                    disabled={generating}
                    onChange={(event) => setField('payeeName', event.target.value)}
                  />
                  <SelectField
                    id="cheque-bank"
                    label="Bank Name"
                    required
                    searchable
                    searchPlaceholder="Search bank"
                    className="sm:col-span-2"
                    placeholder={banks.loading ? 'Loading banks...' : 'Select bank'}
                    options={banks.options}
                    value={form.bankName}
                    error={errors.bankName}
                    disabled={generating}
                    onValueChange={(value) => setField('bankName', value)}
                  />
                  <Field
                    id="cheque-date"
                    label="Cheque Date"
                    required
                    type="date"
                    value={form.chequeDate}
                    error={errors.chequeDate}
                    disabled={generating}
                    onChange={(event) => setField('chequeDate', event.target.value)}
                  />
                  <Field
                    id="cheque-amount"
                    label="Cheque Amount"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Enter amount"
                    value={form.chequeAmount}
                    error={errors.chequeAmount}
                    disabled={generating}
                    onChange={(event) => setField('chequeAmount', event.target.value)}
                  />
                </FormGrid>

                <div className="mt-4 flex justify-end">
                  <Button type="button" variant="secondary" loading={generating} onClick={submitForm}>
                    {generating ? 'Generating...' : 'Generate Cheque'}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fill in the format, one cheque per row, with dates like 02-Nov-26. The bank is chosen later, on each
              cheque&apos;s voucher.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Download}
                onClick={() => downloadTextFile(CHEQUE_CSV_FORMAT_FILE, CHEQUE_CSV_FORMAT_CONTENT)}
              >
                Download Format
              </Button>
              <CsvUploadButton variant="outline" size="sm" disabled={generating} onFileSelect={chooseFile}>
                Choose CSV
              </CsvUploadButton>
            </div>

            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm">
                <FileText className="size-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  icon={X}
                  tooltip="Remove"
                  aria-label={`Remove ${file.name}`}
                  disabled={generating}
                  onClick={() => setFile(null)}
                />
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="button" variant="secondary" loading={generating} disabled={!file} onClick={submitFile}>
                {generating ? 'Generating...' : 'Generate Cheques'}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Generated Cheques" meta={result ? ` (${result.images.length})` : undefined}>
        {generating ? (
          <Loader variant="page" label="Generating cheques..." description="A long CSV can take a little while." />
        ) : result ? (
          <ChequeViewer key={result.at} images={result.images} />
        ) : (
          <StateMessage icon={FileText} title="Nothing generated yet">
            Generate a cheque or upload a CSV. The cheques show here, ready to print.
          </StateMessage>
        )}
      </Panel>
    </div>
  )
}

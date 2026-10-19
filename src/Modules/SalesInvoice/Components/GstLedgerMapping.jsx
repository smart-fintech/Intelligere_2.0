import { useMemo, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'

import { RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { GST_RATES } from '@/Constants/gst'
import { cn } from '@/Library/utils'
import { toast } from '@/Library/toast'
import { InvoiceGrid } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import { rateText } from '@/Modules/SalesInvoice/salesInvoiceForm'
import { MAPPING_KIND } from '@/Services/salesInvoiceService'

/**
 * GST LEDGER MAPPING - which ledger each GST tax is posted to, for Sales
 * Invoice. Shown in place of the product form while its box is ticked; the
 * products already added are untouched.
 *
 *   tax        CGST | SGST | IGST
 *   rate       a GST rate - CGST and SGST are each half the slab
 *              (GST_RATES, Constants/gst), IGST the whole slab. Always one:
 *              a ledger is posted to for its own tax AND rate (Utils/gstLedgers),
 *              so a mapping for "any rate" would never be used. Such rows
 *              saved earlier are listed as "Any (not used)" and can be deleted.
 *   ledger     one of the company's ledgers, sent by name
 *
 * The mapping key is the tax with the rate after it: "sgst_6", "igst_18". OK saves it (invoice/document-mapping/) and
 * the table below is read again from the server.
 *
 *   mappings   useDocumentMappings(...)
 *   ledgers    { options, status } - the company's ledgers
 */

const TAX_OPTIONS = ['CGST', 'SGST', 'IGST'].map((tax) => ({ value: tax, label: tax }))
/** The rates one tax can be mapped for: half of each slab for CGST / SGST, the slab itself for IGST - 0% charges no tax, so it needs no ledger. */
const rateOptions = (tax) => {
  const rates = [...new Set(GST_RATES.map((rate) => rateText(tax === 'IGST' ? Number(rate) : Number(rate) / 2)))].filter((rate) => Number(rate) > 0)
  return rates.map((rate) => ({ value: rate, label: `${rate}%` }))
}

const KIND_LABEL = { [MAPPING_KIND.LEDGER]: 'Ledger', [MAPPING_KIND.PRODUCT]: 'Product' }

export default function GstLedgerMapping({ mappings, ledgers, disabled }) {
  const [tax, setTax] = useState('')
  const [rate, setRate] = useState('')
  const [ledger, setLedger] = useState('')
  const [errors, setErrors] = useState({})
  const [removing, setRemoving] = useState(null)

  // Ledgers are sent by name, so the options are the names, each once.
  const ledgerOptions = useMemo(
    () => [...new Set(ledgers.options.map((option) => option.label))].map((name) => ({ value: name, label: name })),
    [ledgers.options],
  )
  const ledgerNames = useMemo(() => new Set(ledgerOptions.map((option) => option.value.trim().replace(/\s+/g, ' ').toLowerCase())), [ledgerOptions])
  const busy = disabled || mappings.busy

  const submit = async () => {
    const found = {}
    if (!tax) found.tax = 'Select CGST, SGST or IGST'
    if (!rate) found.rate = 'Select the GST percentage'
    if (!ledger) found.ledger = 'Select the ledger'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const key = `${tax.toLowerCase()}_${rate}`
    try {
      await mappings.save(key, ledger)
      setTax('')
      setRate('')
      setLedger('')
    } catch (failure) {
      toast.error(failure.message)
    }
  }

  const remove = async (row) => {
    setRemoving(`${row.kind}|${row.key}`)
    try {
      await mappings.remove(row)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-3">
      <InvoiceGrid>
        <SelectField
          id="mapping-tax"
          label="Select GST Mapping"
          required
          placeholder="CGST / SGST / IGST"
          options={TAX_OPTIONS}
          value={tax}
          error={errors.tax}
          disabled={busy}
          onValueChange={(value) => {
            if (!value) return
            setTax(value)
            setRate('')
            setErrors((previous) => ({ ...previous, tax: undefined }))
          }}
        />
        <SelectField
          id="mapping-rate"
          label="GST Percentage"
          required
          placeholder={tax ? 'Select %' : 'Select the GST first'}
          options={rateOptions(tax)}
          value={rate}
          error={errors.rate}
          disabled={busy || !tax}
          onValueChange={(value) => {
            if (!value) return
            setRate(value)
            setErrors((previous) => ({ ...previous, rate: undefined }))
          }}
        />
        <SelectField
          id="mapping-ledger"
          label="Ledger"
          required
          searchable
          searchPlaceholder="Search ledger"
          placeholder={ledgers.status === 'loading' ? 'Loading ledgers...' : 'Select Ledger'}
          options={ledgerOptions}
          value={ledger}
          error={errors.ledger}
          disabled={busy || ledgerOptions.length === 0}
          onValueChange={(value) => {
            if (!value) return
            setLedger(value)
            setErrors((previous) => ({ ...previous, ledger: undefined }))
          }}
        />
      </InvoiceGrid>

      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" icon={Check} loading={mappings.busy} disabled={disabled} onClick={submit}>
          OK
        </Button>
      </div>

      {/* ---- What the server holds ---- */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold tracking-wide text-brand uppercase">Saved mappings</p>
        {mappings.status === 'loading' && mappings.rows.length === 0 ? <p className="text-xs text-muted-foreground">Loading...</p> : null}
        {mappings.status === 'failed' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            The mappings could not be loaded. <RetryButton onClick={mappings.reload} />
          </div>
        ) : null}
        {mappings.status === 'ready' && mappings.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No GST ledger mappings yet.</p>
        ) : null}
        {mappings.rows.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 font-medium">GST</th>
                  <th className="px-2 py-1.5 font-medium">Rate</th>
                  <th className="px-2 py-1.5 font-medium">Ledger</th>
                  <th className="w-10 px-2 py-1.5">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mappings.rows.map((row) => {
                  const id = `${row.kind}|${row.key}`
                  return (
                    <tr key={id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                            row.kind === MAPPING_KIND.LEDGER ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {KIND_LABEL[row.kind]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{row.tax}</td>
                      <td className="px-2 py-1.5">
                        {row.rate ? (
                          `${row.rate}%`
                        ) : (
                          <span className="text-muted-foreground" title="A ledger is chosen per tax and rate, so a mapping without a rate is not used.">
                            Any (not used)
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.ledger}
                        {/* A mapping to a ledger the company no longer has is skipped (Utils/gstLedgers). */}
                        {ledgers.status === 'succeeded' && row.ledger && !ledgerNames.has(row.ledger.trim().replace(/\s+/g, ' ').toLowerCase()) ? (
                          <span className="block text-[11px] text-destructive">Not in this company&apos;s ledgers - not used</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="iconDelete"
                          size="icon-xs"
                          icon={Trash2}
                          tooltip="Delete mapping"
                          aria-label={`Delete ${KIND_LABEL[row.kind]} mapping ${row.key}`}
                          loading={removing === id}
                          disabled={busy}
                          onClick={() => remove(row)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}

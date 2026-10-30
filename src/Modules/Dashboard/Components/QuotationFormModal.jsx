/**
 * THE QUOTE FORM - a vendor's quotation typed in on its behalf, for a Sales
 * Order's request for quotation; EDIT QUOTATION is the same form opened on
 * the quotation the vendor already has (quoteFormOf decides which):
 *
 *   Master Details            Quotation No., Quotation Date, Reference No. (the
 *                             order - fixed), Reference Date, Validity Period,
 *                             Delivery Time, Advanced %, Credit Terms
 *   Products                  each product asked for: Description (its SKU's
 *                             details on hover), HSN, Per, and the vendor's
 *                             Qty, MOQ, Unit Rate, Discount %, GST % - Total
 *                             worked out (changeQuoteRow)
 *   Other Details             Additional Charges (name and amount, rows added
 *                             and removed), Warranty Duration, Coverage Details
 *   Inclusions & Exclusions   each added (Add, or Enter) and removed one by one
 *
 * Submit sends PUT inventory/updated_quotation/ (saveQuotationForm) once,
 * however often it is pressed. Saved: the backend's message, the History
 * read again, and onSaved(). Refused: its message, and everything typed
 * stays. Closing keeps nothing - the next opening starts from the quotation
 * as saved (the dialog is mounted afresh each time).
 *
 *   order, vendor   the History's order and the vendor quoting (readQuotationRequests)
 *   companyName     the active company's
 */

import { useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

import { Field, FieldLabel } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  MASTER_FIELDS,
  OTHER_FIELDS,
  buildQuotationBody,
  changeQuoteRow,
  dateInputOf,
  dateTextOf,
  quoteFormOf,
} from '@/Modules/Dashboard/quotationRequests'
import { saveQuotationForm } from '@/Services/procurementService'
import { formatIndianCurrency } from '@/Utils/currency'

/** One titled block of the form - the cards of the earlier form, in this app's style. */
function FormSection({ title, children }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-xs">
      <h3 className="text-sm font-semibold text-brand">{title}</h3>
      {children}
    </section>
  )
}

/** The cells of the products table that the vendor fills in - each a number. */
const ROW_INPUTS = [
  { field: 'Qty', label: 'Qty' },
  { field: 'moq', label: 'MOQ' },
  { field: 'unit_rate', label: 'Unit Rate' },
  { field: 'discount', label: 'Discount %', max: 99 },
  { field: 'IGst_rate', label: 'GST %' },
]

/** Inclusions or Exclusions: a box to add one, and the list, each with its remove. */
function TermList({ id, title, items, onChange }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const value = draft.trim()
    if (!value) return
    onChange([...items, value])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            add()
          }}
        />
        <Button type="button" variant="outline" size="icon" icon={Plus} tooltip={`Add ${title.replace(/s$/, '')}`} aria-label={`Add ${title.replace(/s$/, '')}`} disabled={!draft.trim()} onClick={add} />
      </div>
      {items.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((item, index) => (
            <li key={`${item}#${index}`} className="flex animate-in items-center justify-between gap-2 px-3 py-1.5 text-sm duration-200 fade-in-0 slide-in-from-top-1">
              <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
              <Button
                type="button"
                variant="iconDelete"
                size="icon-xs"
                icon={X}
                tooltip="Remove"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, place) => place !== index))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">None added.</p>
      )}
    </div>
  )
}

export default function QuotationFormModal({ open, onOpenChange, order, vendor, companyName, onSaved }) {
  const [form, setForm] = useState(() => quoteFormOf(order, vendor))
  const [submitting, setSubmitting] = useState(false)
  // Set at once, so a second click before the re-render is turned away.
  const inFlight = useRef(false)

  const setMaster = (key, value) => setForm((current) => ({ ...current, master: { ...current.master, [key]: value } }))
  const setOther = (key, value) => setForm((current) => ({ ...current, other: { ...current.other, [key]: value } }))
  const changeRow = (index, field, value) =>
    setForm((current) => ({ ...current, rows: current.rows.map((row, place) => (place === index ? changeQuoteRow(row, field, value) : row)) }))
  const changeCharge = (index, field, value) =>
    setForm((current) => ({ ...current, charges: current.charges.map((charge, place) => (place === index ? { ...charge, [field]: value } : charge)) }))

  const vendorName = vendor.seller.name || vendor.key

  const handleSubmit = async () => {
    if (inFlight.current) return
    if (!companyName) {
      toast.error('Select a company before saving a quotation.')
      return
    }

    inFlight.current = true
    setSubmitting(true)
    try {
      const reply = await saveQuotationForm(buildQuotationBody({ documentNo: order.documentNo, vendorEmail: vendor.seller.email, companyName, form }))
      toast.success(reply?.msg || 'Quotation saved successfully.')
      onSaved?.()
    } catch (failure) {
      // The backend's own message (see authService); everything typed stays.
      toast.error(failure.message || 'The quotation could not be saved.')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next)
      }}
      size="xxl"
      title={form.editing ? 'Edit Quotation' : 'Quote Form'}
      description={`${vendorName} · SO ${order.documentNo || '--'}`}
      autoFocus={false}
      footer={
        <>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={submitting} onClick={handleSubmit}>
            {submitting ? 'Saving...' : 'Submit'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormSection title="Master Details">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {MASTER_FIELDS.map(({ key, label, date, locked, placeholder }) =>
              date ? (
                <Field
                  key={key}
                  id={`quote-${key}`}
                  label={label}
                  type="date"
                  value={dateInputOf(form.master[key])}
                  onChange={(event) => setMaster(key, dateTextOf(event.target.value))}
                />
              ) : (
                <Field
                  key={key}
                  id={`quote-${key}`}
                  label={label}
                  value={form.master[key]}
                  placeholder={placeholder ?? label}
                  disabled={locked}
                  onChange={(event) => setMaster(key, event.target.value)}
                />
              ),
            )}
          </div>
        </FormSection>

        <FormSection title="Products">
          {form.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No products came with this request.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="w-12 px-2 py-2 text-left">Sr</th>
                    <th className="px-2 py-2 text-left">Description of Goods</th>
                    <th className="w-24 px-2 py-2 text-left">HSN</th>
                    <th className="w-20 px-2 py-2 text-left">Per</th>
                    {ROW_INPUTS.map(({ field, label }) => (
                      <th key={field} className="w-24 px-2 py-2 text-right">
                        {label}
                      </th>
                    ))}
                    <th className="w-28 px-2 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {form.rows.map((row, index) => (
                    <tr key={row.key} className="border-t border-border align-middle">
                      <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{index + 1}</td>
                      <td className="px-2 py-1.5">
                        <SkuDetailsTooltip
                          details={Object.entries(row.sku_details && typeof row.sku_details === 'object' ? row.sku_details : {})
                            .filter(([name, value]) => name !== 'Quantity' && String(value ?? '').trim() !== '')
                            .map(([name, value]) => ({ name, value: String(value) }))}
                          side="top"
                        >
                          <span tabIndex={0} className="cursor-help font-medium underline decoration-muted-foreground/50 decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                            {row.Description || '--'}
                          </span>
                        </SkuDetailsTooltip>
                        {row.sku_code ? <span className="block text-xs text-muted-foreground">{row.sku_code}</span> : null}
                      </td>
                      <td className="px-2 py-1.5">{row.Hsn_code || '--'}</td>
                      <td className="px-2 py-1.5">{row.Per || '--'}</td>
                      {ROW_INPUTS.map(({ field, label, max }) => (
                        <td key={field} className="px-1 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            max={max}
                            step="any"
                            inputMode="decimal"
                            className="h-8 text-right tabular-nums"
                            aria-label={`${label} of ${row.Description || `line ${index + 1}`}`}
                            value={row[field]}
                            onChange={(event) => changeRow(index, field, event.target.value)}
                          />
                        </td>
                      ))}
                      {/* Worked out, never typed: quantity x rate less the discount (no GST). */}
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatIndianCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>

        <FormSection title="Other Details">
          <div className="space-y-2">
            <FieldLabel>Additional Charges</FieldLabel>
            {form.charges.map((charge, index) => (
              <div key={index} className="grid animate-in grid-cols-[1fr_10rem_auto] items-center gap-2 duration-200 fade-in-0 slide-in-from-top-1">
                <Input
                  aria-label={`Charge ${index + 1} name`}
                  placeholder="Charge name (e.g. Packing, Transport)"
                  value={charge.label}
                  onChange={(event) => changeCharge(index, 'label', event.target.value)}
                />
                <Input aria-label={`Charge ${index + 1} amount`} placeholder="Amount" value={charge.amount} onChange={(event) => changeCharge(index, 'amount', event.target.value)} />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="iconDelete"
                    size="icon-sm"
                    icon={Trash2}
                    tooltip="Remove Charge"
                    aria-label={`Remove charge ${index + 1}`}
                    disabled={form.charges.length === 1}
                    onClick={() => setForm((current) => ({ ...current, charges: current.charges.filter((_, place) => place !== index) }))}
                  />
                  {/* + only on the last row, as before. */}
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-sm"
                    icon={Plus}
                    tooltip="Add Charge"
                    aria-label="Add charge"
                    className={cn(index !== form.charges.length - 1 && 'invisible')}
                    onClick={() => setForm((current) => ({ ...current, charges: [...current.charges, { label: '', amount: '' }] }))}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
            {OTHER_FIELDS.map(({ key, label, wide }) => (
              <Field
                key={key}
                id={`quote-${key}`}
                label={label}
                placeholder={label}
                className={cn(wide && 'sm:col-span-2')}
                value={form.other[key]}
                onChange={(event) => setOther(key, event.target.value)}
              />
            ))}
          </div>
        </FormSection>

        <FormSection title="Inclusions & Exclusions">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TermList id="quote-inclusion" title="Inclusions" items={form.inclusions} onChange={(inclusions) => setForm((current) => ({ ...current, inclusions }))} />
            <TermList id="quote-exclusion" title="Exclusions" items={form.exclusions} onChange={(exclusions) => setForm((current) => ({ ...current, exclusions }))} />
          </div>
        </FormSection>
      </div>
    </Modal>
  )
}

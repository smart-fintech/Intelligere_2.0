import { useState } from 'react'

import { Field, FormGrid } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { checkPayment } from '@/Modules/PayableReceivable/payableReceivable'
import { updateEntry } from '@/Services/payableReceivableService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate, toInputDate } from '@/Utils/date'

/**
 * RECORD A PAYMENT against one invoice - PUT tally/receivable_payable/.
 *
 *   Partial Payment   an amount up to the outstanding and a date; it joins the
 *                     invoice's partial payments
 *   Full Payment      the outstanding amount, filled in and not to be changed;
 *                     closes the invoice, which leaves the list. As the old
 *                     screen: the PUT names the invoice under `data`, with no
 *                     amount or date - an amount would be taken as a partial.
 *
 * Mounted only while it is wanted, so every opening starts on today's date and
 * an empty amount. Stays open on a failure, for another try; `onSaved` reads
 * the list again and closes it.
 *
 *   source         'payable' or 'receivable' - sent as `type`
 *   party, invoice the row it was opened from (readOutstanding)
 *   onSaved        (full) => a message if the list shows the change did not
 *                  happen, nothing if all is well
 *
 * The bill date goes back exactly as the list sent it.
 */

const PARTIAL = 'partial'
const FULL = 'full'
const MODES = [
  { value: PARTIAL, label: 'Partial Payment' },
  { value: FULL, label: 'Full Payment' },
]

export default function PaymentModal({ companyName, source, party, invoice, onClose, onSaved }) {
  // With nothing left outstanding, closing the invoice is all there is to do.
  const [mode, setMode] = useState(invoice.amount > 0 ? PARTIAL : FULL)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => toInputDate(new Date()))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const full = mode === FULL

  const save = async () => {
    const found = full ? {} : checkPayment({ amount, paymentDate }, invoice.amount)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const entry = full
      ? { data: { [party]: [invoice.invoiceNo] } }
      : {
          ledger_name: party,
          invoice_no: invoice.invoiceNo,
          amount: Number(amount),
          billdate: invoice.billDate,
          payment_date: paymentDate,
        }

    setSaving(true)
    try {
      const reply = await updateEntry({ company_name: companyName, type: source, ...entry })
      const problem = await onSaved(full)
      if (problem) toast.error(problem)
      else toast.success(reply?.msg || 'Entry updated.')
    } catch (failure) {
      toast.error(failure.message)
      setSaving(false)
    }
  }

  const summary = [
    ['Ledger', party],
    ['Invoice No.', invoice.invoiceNo],
    ['Bill Date', formatDate(invoice.billDate)],
    ['Outstanding', formatIndianCurrency(invoice.amount)],
  ]

  return (
    <Modal
      open
      onOpenChange={(next) => !saving && !next && onClose()}
      title={`Record ${source === 'payable' ? 'Payment' : 'Receipt'}`}
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 text-xs">
          {summary.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{value || '--'}</dd>
            </div>
          ))}
        </dl>

        <ViewSwitch
          options={MODES}
          value={mode}
          onValueChange={(next) => {
            setMode(next)
            setErrors({})
          }}
          label="Payment type"
          idPrefix="pr-payment"
          className="w-fit max-w-full justify-start"
        />

        {full ? (
          <div className="space-y-2">
            <Field id="pr-payment-full-amount" label="Amount" value={formatIndianCurrency(invoice.amount)} disabled readOnly />
            <p className="text-xs text-muted-foreground">
              This closes the invoice and removes it from the list. No payment date is recorded.
            </p>
          </div>
        ) : (
          <FormGrid>
            <Field
              id="pr-payment-date"
              label="Payment Date"
              required
              type="date"
              value={paymentDate}
              max={toInputDate(new Date())}
              error={errors.paymentDate}
              disabled={saving}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
            <Field
              id="pr-payment-amount"
              label="Amount"
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter amount"
              value={amount}
              error={errors.amount}
              disabled={saving}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormGrid>
        )}
      </div>
    </Modal>
  )
}

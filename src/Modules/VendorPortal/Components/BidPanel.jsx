import { useState } from 'react'
import { AlertCircle, Gavel } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { Field } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { VendorHistory } from '@/Modules/Procurement/Components/ProductVendors'
import { showAmount } from '@/Modules/Procurement/procurement'
import {
  BID_FORM_ERROR,
  bidErrors,
  bidLimitText,
  bidRules,
  buildBidBody,
  canBid,
  emptyBidForm,
} from '@/Modules/VendorPortal/vendorPortal'
import { placeVendorBid } from '@/Services/Procurement/vendorPortalService'

/**
 * Under a product's row: the vendor's own bid history, delivery day changes and
 * notes, and - while the Bid runs - the form to bid again, change its delivery
 * days or add a note. A bid is confirmed before it is sent; the rules it is
 * checked against are vendorPortal's bidRules.
 */
export default function BidPanel({ event, product, mine, onPlaced }) {
  const [form, setForm] = useState(emptyBidForm)
  const [errors, setErrors] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [placing, setPlacing] = useState(false)

  const open = canBid(event)
  const rules = bidRules(event, product, mine)
  const idPrefix = `vendor-bid-${event.id}-${product.sr_no}`

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => {
      if (!previous[field] && !previous[BID_FORM_ERROR]) return previous
      const next = { ...previous }
      delete next[field]
      delete next[BID_FORM_ERROR]
      return next
    })
  }

  const send = async () => {
    setPlacing(true)
    try {
      const reply = await placeVendorBid(buildBidBody({ event, product, mine, form }))
      toast.success(reply?.msg || 'Bid submitted.')
      setForm(emptyBidForm())
      setConfirming(false)
      onPlaced()
    } catch (failure) {
      toast.error(failure.message)
      setConfirming(false)
      onPlaced()
    } finally {
      setPlacing(false)
    }
  }

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault()
    const found = bidErrors(form, rules, mine)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    // A bid binds the vendor, so it is confirmed; delivery days or a note alone are not.
    if (String(form.amount).trim() !== '') setConfirming(true)
    else send()
  }

  return (
    <div className="space-y-3 bg-muted/30 p-3">
      {open ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <Field
              id={`${idPrefix}-amount`}
              label="Your Bid (₹)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder={rules.own ? `Now ${rules.own}` : 'Amount'}
              value={form.amount}
              error={errors.amount}
              disabled={placing || rules.max === 0}
              onChange={(changeEvent) => setField('amount', changeEvent.target.value)}
              className="w-full sm:w-44"
            />
            <Field
              id={`${idPrefix}-days`}
              label="Delivery Days"
              type="number"
              min="1"
              step="1"
              placeholder={mine?.delivery_days ? `Now ${mine.delivery_days}` : 'Days'}
              value={form.delivery_days}
              error={errors.delivery_days}
              disabled={placing}
              onChange={(changeEvent) => setField('delivery_days', changeEvent.target.value)}
              className="w-full sm:w-32"
            />
            <Field
              id={`${idPrefix}-note`}
              label="Note"
              placeholder="Optional - e.g. price includes freight"
              maxLength={300}
              value={form.note}
              disabled={placing}
              onChange={(changeEvent) => setField('note', changeEvent.target.value)}
              className="min-w-48 flex-1"
            />
            <div className="space-y-1.5">
              <span aria-hidden="true" className="block h-3" />
              <Button type="submit" icon={Gavel} loading={placing && !confirming}>
                Submit
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{bidLimitText(rules)}</p>
          {errors[BID_FORM_ERROR] ? (
            <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              {errors[BID_FORM_ERROR]}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <VendorHistory vendor={mine ?? {}} showAmounts />
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !placing) setConfirming(false)
        }}
        title="Submit this bid?"
        description={`${showAmount(form.amount)} for ${product.product_name || 'this product'}${
          String(form.delivery_days).trim() ? `, delivery in ${String(form.delivery_days).trim()} days` : ''
        }. A bid cannot be withdrawn.`}
        confirmLabel="Submit Bid"
        cancelLabel="Back"
        variant="default"
        busy={placing}
        onConfirm={send}
      />
    </div>
  )
}

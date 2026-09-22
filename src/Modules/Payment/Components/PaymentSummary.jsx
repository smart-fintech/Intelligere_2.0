import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

import { formatINR } from '../pricing'

function Row({ label, value, className }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-lg', className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/**
 * The right-hand column of the old package payment page: Sub Total, GST, a
 * rule, the Grand Total in bold brand blue, and a small "Payment" button.
 *
 * With an upgrade discount and/or an offer it reads the way the old page did
 * after a discount (Total, Upgrade Discount / Discount (n%), Sub Total ...):
 *   Total, Discount (n%), Sub Total, GST, Grand Total.
 *
 * Every figure comes from the quote (pricing.calculateQuote); the reasons the
 * order cannot be placed yet sit on top as a small red note.
 */
export function PaymentSummary({ quote, paying, waiting, onPay }) {
  const blocked = quote.issues.length > 0 || Boolean(waiting)
  const hasOffer = quote.offerDiscount > 0
  const hasUpgrade = quote.upgradeDiscount > 0

  return (
    <section aria-label="Payment summary" className="space-y-4 lg:pt-10">
      {quote.issues.length ? (
        <ul className="space-y-0.5 text-xs text-destructive">
          {quote.issues.map((issue) => (
            <li key={issue}>Note : {issue}</li>
          ))}
        </ul>
      ) : null}

      {hasOffer || hasUpgrade ? (
        <>
          <Row label="Total" value={formatINR(quote.subtotal)} />
          {hasUpgrade ? (
            <Row label="Upgrade Discount" value={formatINR(-quote.upgradeDiscount)} className="text-green-700" />
          ) : null}
          {hasOffer ? (
            <Row
              label={`Discount (${quote.offer.percent}%)`}
              value={formatINR(-quote.offerDiscount)}
              className="text-green-700"
            />
          ) : null}
          <Row label="Sub Total" value={formatINR(quote.payable)} />
        </>
      ) : (
        <Row label="Sub Total" value={formatINR(quote.subtotal)} />
      )}
      <Row label={`GST(${quote.gstPercent}%)`} value={formatINR(quote.gst)} />

      <hr className="border-border" />

      <Row label="Grand Total" value={formatINR(quote.total)} className="pt-2 font-bold text-brand" />

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          size="sm"
          loading={paying || Boolean(waiting)}
          disabled={blocked}
          onClick={onPay}
          className="disabled:border-transparent disabled:bg-gray-300 disabled:text-white disabled:opacity-100"
        >
          {paying ? 'Processing...' : waiting ? 'Checking offers...' : 'Payment'}
        </Button>
      </div>
    </section>
  )
}

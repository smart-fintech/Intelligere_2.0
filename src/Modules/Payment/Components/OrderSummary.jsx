import { AlertCircle, Lock, ShieldCheck } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

import { formatINR } from '../pricing'

function Row({ label, detail, value, className, strong }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 text-sm', className)}>
      <span className="min-w-0">
        <span className={cn('block', strong ? 'font-semibold' : 'text-foreground')}>{label}</span>
        {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <span className={cn('shrink-0 tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</span>
    </div>
  )
}

/**
 * The order summary beside the choices: what is being bought, each charge,
 * any discount, GST and the Grand Total - and the Add Payment button.
 *
 *   title         the heading ("Package Summary")
 *   facts         [[label, value]] shown at the top - package, companies ...
 *   quote         pricing.calculateQuote, or premiumFeatures.calculateRechargeQuote
 *   paying        the order is being created; the button spins and locks
 *   waiting       a reason the button must wait (the offer is still being
 *                 checked), shown in place of its label
 *   payLabel      the button's text                 (default "Add Payment")
 *   note          the line under the Grand Total    (default "for 1 year, GST included")
 *
 * With an offer the original amount stays on screen, struck through by the
 * discount line under it, so the user sees exactly what the offer saved.
 * Every figure comes from the quote; nothing is worked out here.
 */
export function OrderSummary({
  title = 'Package Summary',
  facts = [],
  quote,
  paying,
  waiting,
  onPay,
  payLabel = 'Add Payment',
  note = 'for 1 year, GST included',
  className,
}) {
  const blocked = quote.issues.length > 0 || Boolean(waiting)
  const hasOffer = quote.offerDiscount > 0

  return (
    <section
      aria-label={title}
      className={cn('rounded-xl border border-border/70 bg-card shadow-sm lg:sticky lg:top-4', className)}
    >
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-brand uppercase">{title}</h2>
      </div>

      <div className="space-y-4 px-5 py-4">
        {facts.length ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className={cn('space-y-2.5', facts.length && 'border-t border-border pt-4')}>
          {quote.lines.length ? (
            quote.lines.map((line) => (
              <Row
                key={line.key}
                label={line.label}
                detail={line.owned ? `${line.detail} · already paid for` : line.detail}
                value={formatINR(line.amount)}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nothing selected yet.</p>
          )}

          {quote.discount > 0 ? (
            <Row
              label="Multi-company discount"
              value={formatINR(-quote.discount)}
              className="text-emerald-700 dark:text-emerald-400"
            />
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          {hasOffer ? (
            <>
              <Row label="Original amount" value={formatINR(quote.subtotal)} />
              <Row
                label={<span className="capitalize">{quote.offer.title}</span>}
                detail={`${quote.offer.percent}% off`}
                value={formatINR(-quote.offerDiscount)}
                className="text-emerald-700 dark:text-emerald-400"
              />
              <Row label="Payable amount" value={formatINR(quote.payable)} strong />
            </>
          ) : (
            <Row label="Subtotal" value={formatINR(quote.subtotal)} />
          )}
          <Row label={`GST (${quote.gstPercent}%)`} value={formatINR(quote.gst)} />
        </div>

        <div className="rounded-lg bg-brand-soft px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-brand">Grand Total</span>
            <span className="text-2xl font-bold text-brand tabular-nums">{formatINR(quote.total)}</span>
          </div>
          <p className="mt-0.5 text-right text-xs text-muted-foreground">
            {hasOffer ? `You save ${formatINR(quote.offerDiscount)} · ` : ''}
            {note}
          </p>
        </div>

        {quote.issues.length ? (
          <ul className="space-y-1">
            {quote.issues.map((issue) => (
              <li key={issue} className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="w-full border-brand bg-brand text-brand-foreground hover:bg-brand-dark hover:text-brand-foreground"
          icon={Lock}
          loading={paying || Boolean(waiting)}
          disabled={blocked}
          onClick={onPay}
        >
          {paying ? 'Processing payment...' : waiting || payLabel}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Secure checkout by Cashfree
        </p>
      </div>
    </section>
  )
}

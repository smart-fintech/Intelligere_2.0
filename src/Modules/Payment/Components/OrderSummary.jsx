import { AlertCircle, Lock, ShieldCheck } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

import { formatINR } from '../pricing'

/**
 * One line of the summary. `accent` colours the label AND the figure
 * together - brand blue for what is being charged, green for what is coming
 * off. The small line under a label (what the charge is made of) keeps its
 * quiet colour whatever the row is, so the two never compete.
 */
export function SummaryRow({ label, detail, value, className, strong, accent }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 text-sm', accent, className)}>
      <span className="min-w-0">
        <span className={cn('block', strong && 'font-semibold', !accent && !strong && 'text-foreground')}>
          {label}
        </span>
        {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <span className={cn('shrink-0 tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</span>
    </div>
  )
}

/** What a discount reads as, wherever one appears. */
const SAVING = 'text-emerald-700 dark:text-emerald-400'

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
 *   tone          'brand' reads the charges in brand blue, as the payment
 *                 dialog does; anything off the price stays green either way,
 *                 and the small lines under each label stay quiet
 *   details       working that belongs to this order and nowhere else - how
 *                 an upgrade reached its figure, package by package. It is
 *                 drawn INSIDE the summary, under the facts, because the
 *                 summary is the one place such a calculation is shown
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
  tone,
  details,
  className,
}) {
  const blocked = quote.issues.length > 0 || Boolean(waiting)
  const hasOffer = quote.offerDiscount > 0
  const hasUpgradeCredit = quote.upgradeDiscount > 0
  // What comes off the charges before GST: the credit an existing package
  // earns, and any offer. Both are already out of `quote.payable`.
  const deducted = (quote.upgradeDiscount ?? 0) + (quote.offerDiscount ?? 0)
  const accent = tone === 'brand' ? 'text-brand' : undefined

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
                <dd className={cn('truncate font-semibold', accent ?? 'text-foreground')}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {/* The working behind an upgrade, when there is one: it lives here,
            in the summary, and not on the cards. */}
        {details ? <div className={cn(facts.length && 'border-t border-border pt-4')}>{details}</div> : null}

        <div className={cn('space-y-2.5', (facts.length || details) && 'border-t border-border pt-4')}>
          {quote.lines.length ? (
            quote.lines.map((line) => (
              <SummaryRow
                key={line.key}
                label={line.label}
                detail={line.owned ? `${line.detail} · already paid for` : line.detail}
                value={formatINR(line.amount)}
                accent={accent}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nothing selected yet.</p>
          )}

          {quote.discount > 0 ? (
            <SummaryRow label="Multi-company discount" value={formatINR(-quote.discount)} accent={SAVING} />
          ) : null}
        </div>

        {/*
          ONE STORY, TOP TO BOTTOM
          The charges add up to a Total; what comes off is listed under it -
          the credit an existing package earns, then any offer; and Subtotal is
          what is left, which is the figure GST is charged on and the figure
          the Grand Total is built from. With nothing coming off, Total and
          Subtotal are the same, so only Subtotal is drawn.
        */}
        <div className="space-y-2 border-t border-border pt-4">
          {deducted > 0 ? (
            <>
              <SummaryRow label="Total" value={formatINR(quote.subtotal)} accent={accent} />
              {hasUpgradeCredit ? (
                <SummaryRow label="Upgrade credit" value={formatINR(-quote.upgradeDiscount)} accent={SAVING} />
              ) : null}
              {hasOffer ? (
                <SummaryRow
                  label={<span className="capitalize">{quote.offer.title}</span>}
                  detail={`${quote.offer.percent}% off`}
                  value={formatINR(-quote.offerDiscount)}
                  accent={SAVING}
                />
              ) : null}
            </>
          ) : null}

          <SummaryRow
            label="Subtotal"
            // detail="before GST"
            value={formatINR(quote.payable)}
            accent={accent}
            strong={deducted > 0}
          />
          <SummaryRow label={`GST (${quote.gstPercent}%)`} value={formatINR(quote.gst)} accent={accent} />
        </div>

        <div className="rounded-lg bg-brand-soft px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-brand">Grand Total</span>
            <span className="text-2xl text-brand tabular-nums">{formatINR(quote.total)}</span>
          </div>
          <p className="mt-0.5 text-right text-xs text-muted-foreground">
            {/* Everything the user did not have to pay, offer and credit alike. */}
            {deducted > 0 ? `You save ${formatINR(deducted)} · ` : ''}
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
          Secure checkout 
        </p>
      </div>
    </section>
  )
}

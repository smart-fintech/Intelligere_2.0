import { cn } from '@/Library/utils'

import { PACKAGE_MODE, PLAN_STRUCTURE, formatINR, isPricedPerCompany, isTierPurchasable } from '../pricing'

/**
 * The circle that sits on the top edge of a package card - the tier's
 * company count (or the MSME company count). Filled when its card is the
 * selected one.
 */
export function CountBadge({ selected, children }) {
  return (
    <span
      className={cn(
        'absolute -top-7 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full border text-xl font-bold',
        selected ? 'border-brand bg-brand text-brand-foreground' : 'border-brand bg-card text-brand',
      )}
    >
      {children}
    </span>
  )
}

/**
 * One package card per company tier the backend sends (Silver 50, Gold 100,
 * ...), in the look of the old payment page: the count in a circle on the
 * top edge, the name, a rule, and the price underneath. Nothing here knows
 * how many tiers there are or what they are called.
 *
 *   Premium   the tier's "All" price - the TOTAL for the whole tier, per year
 *             (only "per company" if the backend marks it `basis: per_company`)
 *   Custom    the selected tier shows the total of the modules ticked, per year
 *
 *   subscription  the plan already held (payment/userPaymentData/). Only
 *                 upgrades can be picked - see pricing.isTierPurchasable. The
 *                 tier already bought is marked "Purchased".
 *   subtotal      the live subtotal, shown on the selected card in Custom
 */
export function TierCards({ tiers, value, onChange, mode, subscription = null, subtotal = 0 }) {
  return (
    <div role="radiogroup" aria-label="Package" className="grid grid-cols-1 gap-x-4 gap-y-10 pt-8 sm:grid-cols-2 xl:grid-cols-4">
      {tiers.map((tier) => {
        const selected = tier.key === value
        const purchased = Boolean(subscription) && tier.count === subscription.pastQuantity
        const disabled =
          !isTierPurchasable(tier, subscription) || (mode === PACKAGE_MODE.PREMIUM && !tier.bundle)

        return (
          <button
            key={tier.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${tier.name}, ${tier.count} companies`}
            disabled={disabled}
            onClick={() => onChange(tier.key)}
            className={cn(
              'relative flex cursor-pointer flex-col items-center rounded-md border px-4 pt-10 pb-4 text-center shadow-sm transition-colors outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
              selected ? 'border-brand bg-brand-soft' : 'border-border/60 bg-card hover:border-brand',
              disabled && 'cursor-not-allowed opacity-50 hover:border-border/60',
            )}
          >
            <CountBadge selected={selected}>{tier.count}</CountBadge>

            <span className="text-2xl text-brand">{tier.name}</span>
            <span className="mt-3 mb-2 block w-full border-t border-brand" />

            {mode === PACKAGE_MODE.PREMIUM ? (
              <span className="w-full text-xs text-muted-foreground">
                <span className="block">{tier.bundle ? formatINR(tier.bundle.amount) : '--'}</span>
                <span className="block text-right">
                  {tier.bundle && isPricedPerCompany(tier.bundle, PLAN_STRUCTURE.TIERS) ? '/ Company / Year' : '/ Year'}
                </span>
              </span>
            ) : (
              <span className="w-full text-xs text-muted-foreground">
                <span className="block min-h-4">{selected && subtotal > 0 ? formatINR(subtotal) : ''}</span>
                <span className="block text-right">/ Year</span>
              </span>
            )}

            {purchased ? <span className="mt-1 text-xs font-semibold text-brand">Purchased</span> : null}
          </button>
        )
      })}
    </div>
  )
}

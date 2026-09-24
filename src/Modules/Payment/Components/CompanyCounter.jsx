import { MAX_COMPANY_QUANTITY } from '../usePaymentPlan'
import { NumberStepper } from './NumberStepper'
import { CountBadge } from './TierCards'

/**
 * The MSME "Company Count" card of the old payment page: the count in a
 * circle on the top edge, a [-] [n] [+] stepper, and the price under it.
 *
 * The typing and the limits are NumberStepper's; the figure in `price`,
 * `unit` and `caption` comes from the live quote - nothing is worked out here.
 */
export function CompanyCounter({ value, onChange, min = 1, max = MAX_COMPANY_QUANTITY, price, unit, caption }) {
  return (
    <div className="flex justify-center pt-8">
      <div className="relative w-full max-w-xs rounded-md border border-brand bg-brand-soft px-5 pt-10 pb-4 text-center shadow-sm">
        <CountBadge selected>{value}</CountBadge>

        <h3 className="text-2xl text-brand">Company Count</h3>
        <span className="mt-3 mb-3 block w-full border-t border-brand" />

        <NumberStepper
          appearance="classic"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          label="number of companies"
          className="justify-center"
        />

        <div className="mt-3 text-xs text-muted-foreground">
          <span className="block">{price}</span>
          <span className="block text-right">{unit}</span>
          {caption ? <span className="mt-0.5 block text-right">{caption}</span> : null}
        </div>
      </div>
    </div>
  )
}

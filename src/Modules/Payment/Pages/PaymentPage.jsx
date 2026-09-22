import { RefreshCw } from 'lucide-react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'

import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'

import { PaymentHistory } from '../Components/PaymentHistory'
import { PaymentPlanner } from '../Components/PaymentPlanner'

const TABS = [
  { key: 'payment', label: 'Payment' },
  { key: 'history', label: 'Payment History' },
]

/**
 * /payment - choose and pay for a plan, or look back at past payments.
 *
 * The open tab is kept in the address (?tab=history), so a reload or a
 * shared link lands on the same one.
 *
 * A link back from Cashfree that carries ?order_id= is handed to the status
 * page, in case the backend's return_url still points here.
 */
export default function PaymentPage() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  if (params.get('order_id')) {
    return <Navigate to={`${ROUTES.PAYMENT_STATUS}${location.search}`} replace />
  }

  const active = TABS.some((tab) => tab.key === params.get('tab')) ? params.get('tab') : 'payment'

  return (
    <div className="space-y-3 p-4 sm:p-6">
      {/* The old header: title left, the two sections as small radios in
          the middle, and the refresh button right. */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-2xl font-bold text-brand">Payment</h1>

        <div
          role="radiogroup"
          aria-label="Payment sections"
          className="order-3 col-span-2 flex justify-center gap-4 md:order-none md:col-span-1"
        >
          {TABS.map(({ key, label }) => {
            const id = `payment-section-${key}`
            return (
              <label key={key} htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand">
                <input
                  id={id}
                  type="radio"
                  name="payment-section"
                  className="size-3.5 cursor-pointer accent-[var(--brand)]"
                  checked={key === active}
                  onChange={() => setParams(key === 'payment' ? {} : { tab: key }, { replace: true })}
                />
                {label}
              </label>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="icon"
            aria-label="Refresh"
            tooltip="Refresh"
            icon={RefreshCw}
            onClick={() => window.location.reload()}
            className="border-brand bg-brand text-brand-foreground hover:bg-brand-dark hover:text-brand-foreground"
          />
        </div>
      </div>

      <div role="tabpanel">{active === 'history' ? <PaymentHistory /> : <PaymentPlanner />}</div>
    </div>
  )
}

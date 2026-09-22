import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useDispatch } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'

import { Loader } from '@/Components/Common/Loader'
import { Button } from '@/Components/ui/button'
import { Card } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { cn } from '@/Library/utils'
import { openCashfreeCheckout } from '@/Services/cashfreeService'
import {
  PRODUCT_TYPE,
  clearPendingOrder,
  confirmPayment,
  readPendingProductType,
} from '@/Services/paymentService'
import { fetchCompanies } from '@/Store/Slices/companySlice'
import { fetchProfile } from '@/Store/Slices/profileSlice'
import { orDash } from '@/Utils/display'

import { formatINR, toPaise } from '../pricing'

const OUTCOMES = {
  PAID: {
    icon: CheckCircle2,
    tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15',
    title: 'Payment successful',
  },
  ACTIVE: {
    icon: Clock,
    tone: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15',
    title: 'Payment not completed',
    text: 'Taking you back to checkout to finish the payment...',
  },
  FAILED: {
    icon: XCircle,
    tone: 'text-destructive bg-destructive/10',
    title: 'Payment failed',
    text: 'No money was taken for this order. You can try again.',
  },
}

/**
 * The state the confirmation reply describes. Its `order_status` when it
 * sends one (PAID / ACTIVE / anything else = failed); a confirmation that
 * succeeded without one is taken as paid - a failed payment is answered
 * with an error, which lands in the catch below.
 */
const outcomeKey = (reply) => {
  const status = String(reply?.order_status ?? '').toUpperCase()
  if (!status) return 'PAID'
  return status in OUTCOMES ? status : 'FAILED'
}

/**
 * /payment/status?order_id=... - where Cashfree sends the user back.
 *
 * The order is confirmed with the endpoint that matches what was bought -
 * payment/PaymentConfirm/ for a package, payment/PremiumPaymentConfirm/ for
 * a premium feature (the product_type remembered when the order was made;
 * see Services/paymentService). Then the profile and company list are
 * reloaded so the new plan shows everywhere at once.
 */
export default function PaymentStatusPage() {
  const dispatch = useDispatch()
  const [params] = useSearchParams()
  const orderId = params.get('order_id')
  // What the order was for, read ONCE for this visit. Reading it on every
  // render was the bug: a successful confirm clears the remembered order
  // (clearPendingOrder), so the next render fell back to "main product", the
  // effect saw a new productType and confirmed the same order again - through
  // the OTHER endpoint for a premium-feature order.
  const [productType] = useState(() => readPendingProductType(orderId, params.get('product_type')))
  const premium = productType === PRODUCT_TYPE.PREMIUM_FEATURE
  const [state, setState] = useState({ status: orderId ? 'loading' : 'missing', reply: null, error: null })

  // The order already sent for confirmation. React's StrictMode runs this
  // effect twice in development; the ref survives that, so the order is
  // confirmed once. (A `cancelled` flag only ignored the second ANSWER.)
  const confirmRequest = useRef(null)

  useEffect(() => {
    if (!orderId || confirmRequest.current === orderId) return
    confirmRequest.current = orderId

    confirmPayment(orderId, productType)
      .then((response) => {
        if (confirmRequest.current !== orderId) return
        const reply = response?.data && !response?.order_status ? response.data : response
        setState({ status: 'ready', reply, error: null })

        const outcome = outcomeKey(reply)
        if (outcome === 'PAID') {
          clearPendingOrder()
          dispatch(fetchProfile({ force: true }))
          dispatch(fetchCompanies({ force: true }))
        } else if (outcome === 'ACTIVE' && reply?.payment_session_id) {
          openCashfreeCheckout(reply.payment_session_id).catch((error) =>
            setState({ status: 'failed', reply: null, error: error.message }),
          )
        }
      })
      .catch((error) => {
        if (confirmRequest.current === orderId) setState({ status: 'failed', reply: null, error: error.message })
      })
  }, [orderId, productType, dispatch])

  if (state.status === 'loading') {
    return <Loader variant="page" label="Confirming your payment..." />
  }

  const reply = state.reply
  const key = state.status === 'ready' ? outcomeKey(reply) : null
  const outcome = key
    ? {
        ...OUTCOMES[key],
        text:
          OUTCOMES[key].text ??
          (premium
            ? 'Your premium features are active. The receipt is under Payment History → Premium Features.'
            : 'Your plan is active. The receipt is under Payment History.'),
      }
    : {
        icon: AlertCircle,
        tone: 'text-destructive bg-destructive/10',
        title: state.status === 'missing' ? 'No payment to check' : 'Could not confirm the payment',
        text:
          state.status === 'missing'
            ? 'This page needs an order to look up.'
            : `${state.error} If money was taken, it will show in Payment History shortly.`,
      }
  const Icon = outcome.icon
  const amount = toPaise(reply?.order_amount ?? reply?.amount)
  const historyLink = `${ROUTES.PAYMENT}?tab=history${premium ? '&history=premium' : ''}`

  // Only what the customer needs to recognise their order.
  const facts = reply
    ? [
        ['Payment for', premium ? 'Premium features' : 'Plan / package'],
        ['Order', orDash(reply.order_id ?? orderId)],
        ['Amount', amount === null ? '--' : formatINR(amount)],
      ]
    : []

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <Card className="items-center gap-4 px-6 text-center">
        <span className={cn('flex size-16 items-center justify-center rounded-full', outcome.tone)}>
          <Icon className="size-8" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{outcome.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{outcome.text}</p>
        </div>

        {facts.length ? (
          <dl className="w-full divide-y divide-border rounded-lg border border-border text-left text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          {key === 'PAID' ? (
            <Button asChild>
              <Link to={ROUTES.DASHBOARD}>Go to Dashboard</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to={premium ? ROUTES.PREMIUM_PAYMENT : ROUTES.PAYMENT}>Try again</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={historyLink}>Payment History</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}

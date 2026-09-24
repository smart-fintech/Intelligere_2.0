import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Building2, ChevronDown, Download, Package, Receipt, Sparkles } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader, ProgressBar, toPercent } from '@/Components/Common/Loader'
import { Button } from '@/Components/ui/button'
import { ENV } from '@/Config/env'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { getPaymentHistory, getPremiumHistory } from '@/Services/paymentService'
import { fetchProfile, selectProfile, selectProfileDetails, selectProfileStatus } from '@/Store/Slices/profileSlice'
import { compareToToday, formatLongDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'

import { formatINR, toPaise } from '../pricing'

/*
 * WHAT IS SHOWN
 *
 * The history endpoints return the whole payment record, including gateway
 * credentials (appId, secretKey) and internal ids. Only the fields read in
 * this file reach the screen; everything else is ignored.
 */

/*
 * HOW WIDE A PAYMENT CARD IS
 *
 * One card per row, as before - but on a desktop it stops at about half the
 * content area instead of stretching across it. The floor keeps the two
 * columns inside it readable, and below `lg` the card simply fills the width
 * it has: roomier on a tablet, full width on a phone.
 */
const CARD_LIST = 'w-full space-y-4 lg:w-1/2 lg:min-w-[30rem] mx-auto'

const KINDS = [
  { key: 'normal', label: 'Normal Payments', icon: Package },
  { key: 'premium', label: 'Premium Features', icon: Sparkles },
]

/* ---- Small readers ---- */

/**
 * The receipt link, exactly as the backend gave it: `receipt_file` is used
 * as-is when it is a URL. A bare path (older records) is still joined to the
 * media folder, as before. No link at all when the field is empty.
 */
const receiptUrl = (path) => {
  const text = String(path ?? '').trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  return `${ENV.API_BASE_URL}media/${text.replace(/^\/+/, '').replace(/^media\//, '')}`
}

const money = (value) => {
  const paise = toPaise(value)
  return paise === null ? '--' : formatINR(paise)
}

/** "custom" -> "Custom", "platinum" -> "Platinum". */
const titleCase = (text) =>
  String(text ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const STATUS_STYLE = {
  Paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Failed: 'bg-destructive/10 text-destructive',
  Expired: 'bg-muted text-muted-foreground',
}

/**
 * Paid / Pending / Failed / Expired, from the record's own fields: a payment
 * status word when there is one, else is_paid; a paid plan whose renewal date
 * has passed is Expired.
 */
const paymentStatus = (payment) => {
  const word = String(payment.payment_status ?? payment.order_status ?? '').toUpperCase()
  if (['FAILED', 'CANCELLED', 'TERMINATED', 'USER_DROPPED'].includes(word)) return 'Failed'

  const paid = payment.is_paid === true || word === 'PAID' || word === 'SUCCESS'
  if (!paid) return 'Pending'

  const renewal = compareToToday(payment.renew_date)
  return renewal !== null && renewal < 0 ? 'Expired' : 'Paid'
}

/** "Download Receipt" - opens the backend's own `receipt_file`. */
function ReceiptButton({ file, size = 'sm', iconOnly = false }) {
  const url = receiptUrl(file)
  if (!url) return iconOnly ? <span className="text-muted-foreground">--</span> : null

  return (
    <Button asChild size={iconOnly ? 'icon-sm' : size} variant="default" tooltip="Download Receipt">
      <a href={url} target="_blank" rel="noopener noreferrer" download aria-label="Download Receipt">
        <Download />
        {iconOnly ? null : 'Download Receipt'}
      </a>
    </Button>
  )
}

/* ---- Normal payments ---- */

/** One "Label: value" line of the card's two columns. */
function Line({ label, value }) {
  return (
    <p className="text-sm">
      <span className="text-brand">{label}:</span> <span className="font-medium text-foreground">{value}</span>
    </p>
  )
}

/**
 * What was bought, from whichever field the record carries:
 *
 *   premium_features  [{ feature, count }]  a premium payment
 *   module_names      ["Bank Statement"]    a main-product payment
 *
 * A count is only shown when there is one to show: "E-Invoice - 10", but
 * plain "Proforma" when the backend sent an empty count.
 */
const readBought = (payment) => {
  if (Array.isArray(payment.premium_features)) {
    return {
      label: 'Premium Features',
      items: payment.premium_features
        .filter((entry) => entry && entry.feature)
        .map((entry) => {
          const count = Number(entry.count)
          return Number.isFinite(count) && count > 0 ? `${entry.feature} - ${count}` : String(entry.feature)
        }),
    }
  }

  return {
    label: 'Modules',
    items: Array.isArray(payment.module_names) ? payment.module_names.filter(Boolean) : [],
  }
}

/**
 * ONE payment, main-product or premium feature - the same card for both, in
 * the layout of the payment-history design: the invoice details in two
 * columns, then a small table with the company package and the receipt.
 */
function PaymentCard({ payment, includedFeatures = [] }) {
  const status = paymentStatus(payment)
  const bought = readBought(payment)
  const amount = toPaise(payment.amount)
  const gst = toPaise(payment.gstamount)

  return (
    <li className="rounded-md border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
        <Line label="Invoice Number" value={orDash(payment.invoice_number)} />
        <Line label="Order ID" value={orDash(String(payment.orderId ?? payment.order_id ?? '').replace(/^orderid_/, ''))} />
        <Line
          label="Payment Type"
          value={titleCase(payment.package_type) || titleCase(payment.product_type) || '--'}
        />
        <Line label="Taxable Amount" value={money(payment.amount)} />
        <Line label="Payment Date" value={formatLongDate(payment.transaction_date)} />
        <Line label="GST Amount" value={money(payment.gstamount)} />
        <Line label="Renew Date" value={formatLongDate(payment.renew_date)} />
        {payment.company_name ? <Line label="Company" value={payment.company_name} /> : null}
        <Line
          label="Total Paid"
          value={amount === null ? '--' : formatINR(amount + (gst ?? 0))}
        />
      </div>

      <table className="mt-4 w-full table-fixed border-collapse text-center text-sm">
        <thead>
          <tr className="bg-muted/60 text-muted-foreground">
            <th className="border border-border px-3 py-2 font-medium">Company Package</th>
            <th className="border border-border px-3 py-2 font-medium">Receipt</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/30">
            <td className="border border-border px-3 py-2.5 text-brand">{orDash(payment.company_package)}</td>
            <td className="border border-border px-3 py-2.5">
              <div className="flex justify-center">
                <ReceiptButton file={payment.receipt_file} iconOnly />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* A payment that is not simply "Paid" says so - the rest of the card
            already reads as a completed payment. */}
        {status !== 'Paid' ? (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{status}</span>
        ) : null}

        {bought.items.length ? (
          <p className="text-xs text-muted-foreground">
            <span className="text-brand">{bought.label}:</span> {bought.items.join(', ')}
          </p>
        ) : null}
      </div>

      {/* The features this company holds - the same list the Included
          Features section above is drawn from. Nothing is shown when there
          are none. */}
      {includedFeatures.length ? (
        <div className="mt-2">
          <p className="mb-1.5 text-xs text-brand">Included Features:</p>
          <ul className="flex flex-wrap gap-1.5">
            {includedFeatures.map((feature) => (
              <li key={feature} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs text-brand capitalize">
                {feature}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

/* ---- Premium features ---- */

/**
 * The premium reply -> what to draw:
 *
 *   { used: { "E-Invoice": { used, total }, features: [...] }, payment: [...] }
 *
 * usage     every entry of `used` that is a { used, total } pair, in the
 *           order sent. A feature the company has not paid for is not in the
 *           reply, so it is not drawn - nothing is ever filled in for it.
 * features  `used.features`, as sent (never a hardcoded list)
 * payments  `payment`, every record of it
 *
 * A reply that still carries the usage at the top level (the older shape) is
 * read the same way, and so is a feature the backend adds later.
 */
const readPremium = (data) => {
  const record = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const used = record.used && typeof record.used === 'object' && !Array.isArray(record.used) ? record.used : record

  const usage = Object.entries(used)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([name, value]) => ({
      name,
      used: Number(value.used) || 0,
      total: Number(value.total),
    }))
    .filter((entry) => Number.isFinite(entry.total))

  return {
    usage,
    features: Array.isArray(used.features) ? used.features.filter(Boolean) : [],
    payments: Array.isArray(record.payment) ? record.payment : [],
  }
}

/** One counted feature: what is left of what was bought. */
function UsageCard({ entry }) {
  const percent = entry.total > 0 ? toPercent(entry.used, entry.total) : 0
  // const left = Math.max(0, entry.total - entry.used)

  return (
    <li className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-semibold text-brand">{entry.name}</p>
        <p className="shrink-0 text-sm tabular-nums">
          <span className="font-semibold text-foreground">{entry.used}</span>
          <span className="text-muted-foreground"> / {entry.total} used</span>
        </p>
      </div>
      <ProgressBar percent={percent} className="mt-2" />
      {/* <p className="mt-1.5 text-xs text-muted-foreground">{left} remaining</p> */}
    </li>
  )
}

/**
 * The premium tab's body, in this order: the current usage, the features
 * held, then every premium payment - drawn with the same PaymentCard as the
 * Normal Payments tab.
 *
 * The payment history opens and closes and starts closed; the usage above it
 * never does. That open/closed state is this component's own - nothing else
 * needs to know it.
 */
function PremiumPanel({ data }) {
  const { usage, features, payments } = readPremium(data)
  const [showPayments, setShowPayments] = useState(false)

  if (!usage.length && !features.length && !payments.length) {
    return (
      <StateMessage icon={Sparkles} title="No premium features yet.">
        Premium features you buy for this company will appear here.
      </StateMessage>
    )
  }

  return (
    <div className="space-y-5">
      {usage.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-brand">Feature usage</h3>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {usage.map((entry) => (
              <UsageCard key={entry.name} entry={entry} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className='grid w-full place-items-center'>
        {/* The whole row opens and closes the list, not just the arrow. */}
        <button
          type="button"
          aria-expanded={showPayments}
          aria-controls="premium-payment-history"
          onClick={() => setShowPayments((open) => !open)}
          className={cn(
            'flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-4 py-3 text-left transition-colors outline-none',
            'hover:border-brand/50 focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        >
          <span className="text-sm font-semibold text-brand">
            Premium payment history
            {payments.length ? <span className="font-normal text-muted-foreground"> ({payments.length})</span> : null}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 text-brand transition-transform duration-200', showPayments && 'rotate-180')}
          />
        </button>

        {showPayments ? (
          <div id="premium-payment-history" className="mt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            {payments.length ? (
              <ul className={CARD_LIST}>
                {payments.map((payment, index) => (
                  <PaymentCard
                    key={payment.id ?? payment.orderId ?? index}
                    payment={payment}
                    includedFeatures={features}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No premium payments yet.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}

/* ---- Loading one history ---- */

/**
 * Loads one history and hands it to `children`. `blocked` is a reason it
 * cannot be asked for (no company picked), shown instead; `waiting` holds the
 * request back until what it depends on has settled; `isEmpty` says when the
 * reply has nothing to show.
 *
 * When the request FAILS: `onError` is called once with the backend's own
 * message (the shared axios setup puts its `msg` on the error), and
 * `showErrorState` decides whether the failure is also drawn. A caller that
 * reports the failure as a toast passes `showErrorState={false}`, so nothing
 * of that section is rendered - never an empty or default one.
 *
 * ONE REQUEST per key: the ref remembers the key (and attempt) already asked
 * for, so StrictMode's second effect run in development and ordinary
 * re-renders do not ask again - a `cancelled` flag only ignored the second
 * ANSWER. Retry, or a new key (another company), still asks.
 */
function HistoryLoader({ load, loadKey, blocked, waiting, isEmpty, empty, onError, showErrorState = true, children }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const historyRequest = useRef(null)

  useEffect(() => {
    if (blocked || waiting) return
    const requestKey = `${loadKey}#${attempt}`
    if (historyRequest.current === requestKey) return
    historyRequest.current = requestKey

    load()
      .then((data) => {
        if (historyRequest.current === requestKey) setState({ status: 'ready', data, error: null, forKey: loadKey })
      })
      .catch((error) => {
        if (historyRequest.current !== requestKey) return
        // In the catch, not in render: one report per failed request, so
        // StrictMode's second run and re-renders cannot repeat it.
        onError?.(error.message)
        setState({ status: 'failed', data: null, error: error.message, forKey: loadKey })
      })
    // `load` is rebuilt every render; `loadKey` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, attempt, blocked, waiting])

  if (blocked) {
    return (
      <StateMessage icon={Building2} title="No company selected">
        {blocked}
      </StateMessage>
    )
  }

  // A result for an older key (the company changed) is not this list's.
  const current = state.forKey === loadKey ? state : { status: 'loading' }

  if (current.status === 'loading') {
    return <Loader variant="section" label="Loading payment history..." />
  }

  if (current.status === 'failed') {
    // Reported another way (a toast): show nothing at all for this section.
    if (!showErrorState) return null

    return (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        title="Could not load your payments"
        action={
          <RetryButton
            onClick={() => {
              setState((previous) => ({ ...previous, forKey: null }))
              setAttempt((count) => count + 1)
            }}
          />
        }
      >
        {current.error}
      </StateMessage>
    )
  }

  if (isEmpty(current.data)) {
    return (
      <StateMessage icon={Receipt} title="No payment history found.">
        {empty}
      </StateMessage>
    )
  }

  return children(current.data)
}

/* ---- The tab ---- */

/**
 * Payment History: main-product payments (by the user's email) and the
 * premium features of the active company, each in its own sub-tab. The open
 * one is kept in the address as ?history=premium.
 */
export function PaymentHistory() {
  const dispatch = useDispatch()
  const [params, setParams] = useSearchParams()
  const profile = useSelector(selectProfile)
  const details = useSelector(selectProfileDetails)
  const profileStatus = useSelector(selectProfileStatus)
  const { activeCompanyName } = useActiveCompany()

  // The profile is shared app-wide; this is a no-op when it is already loaded.
  useEffect(() => {
    dispatch(fetchProfile())
  }, [dispatch])

  // The history is asked for with the profile's email, so wait until the
  // profile has settled - otherwise the sign-in email is used first and the
  // profile's arriving a moment later asks a second time.
  const profileSettled = profileStatus === 'succeeded' || profileStatus === 'failed'
  const email = details.email ?? profile?.email ?? getEmail()
  const active = params.get('history') === 'premium' ? 'premium' : 'normal'

  const choose = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'premium') next.set('history', 'premium')
    else next.delete('history')
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Payment history" className="flex gap-1 border-b border-border">
        {KINDS.map(({ key, label, icon: Icon }) => {
          const selected = key === active
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => choose(key)}
              className={cn(
                '-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors outline-none',
                'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selected ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-brand',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">
        {active === 'premium' ? (
          <>
            {/* {activeCompanyName ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Premium features of <span className="font-medium text-foreground">{activeCompanyName}</span>
              </p>
            ) : null} */}

            <HistoryLoader
              loadKey={`premium:${activeCompanyName}`}
              load={() => getPremiumHistory(activeCompanyName)}
              blocked={activeCompanyName ? null : 'Select a company in the header to see its premium features.'}
              isEmpty={(data) => !data}
              empty="Premium features you buy for this company will appear here."
              // A failed premium history is reported as a toast and nothing is
              // drawn - no empty cards, no default figures.
              onError={(message) => toast.error(message || 'Could not load premium features.')}
              showErrorState={false}
            >
              {(data) => <PremiumPanel data={data} />}
            </HistoryLoader>
          </>
        ) : (
          <HistoryLoader
            loadKey={`normal:${email}`}
            load={() => getPaymentHistory(email)}
            waiting={!profileSettled}
            isEmpty={(payments) => !payments?.length}
            empty="Your completed payments will appear here."
          >
            {(payments) => (
              <ul className={CARD_LIST}>
                {payments.map((payment, index) => (
                  <PaymentCard key={payment.id ?? index} payment={payment} />
                ))}
              </ul>
            )}
          </HistoryLoader>
        )}
      </div>
    </div>
  )
}

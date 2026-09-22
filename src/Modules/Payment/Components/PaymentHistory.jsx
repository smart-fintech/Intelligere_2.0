import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Building2, CalendarClock, CalendarDays, FileText, Package, Receipt, Sparkles } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Button } from '@/Components/ui/button'
import { ENV } from '@/Config/env'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getEmail } from '@/Library/secureStorage'
import { cn } from '@/Library/utils'
import { getPaymentHistory, getPremiumHistory } from '@/Services/paymentService'
import { fetchProfile, selectProfile, selectProfileDetails, selectProfileStatus } from '@/Store/Slices/profileSlice'
import { compareToToday, formatLongDate } from '@/Utils/date'

import { formatINR, toPaise } from '../pricing'

/*
 * WHAT A HISTORY CARD SHOWS
 *
 * The history endpoints return the whole payment record, including gateway
 * credentials (appId, secretKey) and internal ids. Only the fields named in
 * this file are ever read; everything else is ignored, so nothing internal
 * can reach the screen by accident.
 */

const KINDS = [
  { key: 'normal', label: 'Normal Payments', icon: Package },
  { key: 'premium', label: 'Premium Features', icon: Sparkles },
]

/* ---- Small readers ---- */

/** A receipt path from the backend -> a link that opens it, or null. */
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
 * Paid / Pending / Failed / Expired, from the record's own fields:
 * a payment status word when there is one, else is_paid; a paid plan whose
 * renewal date has passed is Expired.
 */
const paymentStatus = (payment) => {
  const word = String(payment.payment_status ?? payment.order_status ?? '').toUpperCase()
  if (['FAILED', 'CANCELLED', 'TERMINATED', 'USER_DROPPED'].includes(word)) return 'Failed'

  const paid = payment.is_paid === true || word === 'PAID' || word === 'SUCCESS'
  if (!paid) return 'Pending'

  const renewal = compareToToday(payment.renew_date)
  return renewal !== null && renewal < 0 ? 'Expired' : 'Paid'
}

/* ---- One payment ---- */

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand/70" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium text-foreground">{value}</dd>
      </div>
    </div>
  )
}

function HistoryCard({ payment, kind }) {
  const status = paymentStatus(payment)
  const receipt = receiptUrl(payment.receipt_file)
  const modules = Array.isArray(payment.module_names) ? payment.module_names.filter(Boolean) : []
  const amount = toPaise(payment.amount)
  const gst = toPaise(payment.gstamount)
  const total = amount === null ? null : amount + (gst ?? 0)
  const invoice = String(payment.invoice_number ?? '').trim()
  const premium = kind === 'premium'

  const heading =
    status === 'Paid' || status === 'Expired'
      ? premium
        ? 'Premium Feature Purchase'
        : 'Payment Successful'
      : status === 'Failed'
        ? 'Payment Failed'
        : 'Payment Pending'

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      {/* Header: what it was, its status, and what was paid. */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{heading}</p>
          <p className="text-xs text-muted-foreground">
            {formatLongDate(payment.transaction_date)}
            {invoice ? ` · Invoice ${invoice}` : ''}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>
          {status}
        </span>
      </div>

      <div className="flex-1 space-y-4 px-4 py-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {!premium || payment.package_type ? (
            <Fact icon={Package} label="Package" value={titleCase(payment.package_type) || '--'} />
          ) : null}
          {!premium || payment.company_package ? (
            <Fact icon={Building2} label="Companies" value={payment.company_package ?? '--'} />
          ) : null}
          <Fact icon={CalendarDays} label="Payment date" value={formatLongDate(payment.transaction_date)} />
          <Fact icon={CalendarClock} label="Renews on" value={formatLongDate(payment.renew_date)} />
        </dl>

        {modules.length ? (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">{premium ? 'Features' : 'Modules'}</p>
            <ul className="flex flex-wrap gap-1.5">
              {modules.map((name) => (
                <li key={name} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs text-brand">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Footer: the money, and the receipt when there is one. */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
        <dl className="flex gap-5 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Amount</dt>
            <dd className="font-medium tabular-nums">{money(payment.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">GST</dt>
            <dd className="font-medium tabular-nums">{money(payment.gstamount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{status === 'Paid' || status === 'Expired' ? 'Total paid' : 'Total'}</dt>
            <dd className="font-bold text-brand tabular-nums">{total === null ? '--' : formatINR(total)}</dd>
          </div>
        </dl>

        {receipt ? (
          <Button asChild size="sm" variant="outline">
            <a href={receipt} target="_blank" rel="noopener noreferrer">
              <FileText /> View Receipt
            </a>
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/* ---- One list (normal or premium) ---- */

/**
 * Loads one history and draws it. `load` is the request; `blocked` is a
 * reason it cannot be made yet (no company picked), shown instead; `waiting`
 * holds the request back until what it depends on has settled.
 *
 * ONE REQUEST per list and key: the ref remembers the key (and attempt)
 * already asked for, so StrictMode's second effect run in development and
 * ordinary re-renders do not ask again - a `cancelled` flag only ignored the
 * second ANSWER. Retry (a new attempt) or a new key (another company) still does.
 */
function HistoryList({ kind, load, loadKey, blocked, waiting }) {
  const [state, setState] = useState({ status: 'loading', payments: [], error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const historyRequest = useRef(null)

  useEffect(() => {
    if (blocked || waiting) return
    const requestKey = `${loadKey}#${attempt}`
    if (historyRequest.current === requestKey) return
    historyRequest.current = requestKey

    load()
      .then((payments) => {
        if (historyRequest.current === requestKey) setState({ status: 'ready', payments, error: null, forKey: loadKey })
      })
      .catch((error) => {
        if (historyRequest.current === requestKey) {
          setState({ status: 'failed', payments: [], error: error.message, forKey: loadKey })
        }
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

  if (!current.payments.length) {
    return (
      <StateMessage icon={Receipt} title="No payment history found.">
        Your completed payments will appear here.
      </StateMessage>
    )
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {current.payments.map((payment, index) => (
        <HistoryCard key={payment.id ?? index} payment={payment} kind={kind} />
      ))}
    </ul>
  )
}

/* ---- The tab ---- */

/**
 * Payment History: main-product payments (by the user's email) and premium
 * feature payments (by the active company's name), each in its own sub-tab.
 * The open one is kept in the address as ?history=premium.
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
                selected
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted-foreground hover:text-brand',
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
            {activeCompanyName ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Premium features bought for <span className="font-medium text-foreground">{activeCompanyName}</span>
              </p>
            ) : null}
            <HistoryList
              kind="premium"
              loadKey={`premium:${activeCompanyName}`}
              load={() => getPremiumHistory(activeCompanyName)}
              blocked={activeCompanyName ? null : 'Select a company in the header to see its premium feature payments.'}
            />
          </>
        ) : (
          <HistoryList
            kind="normal"
            loadKey={`normal:${email}`}
            load={() => getPaymentHistory(email)}
            waiting={!profileSettled}
          />
        )}
      </div>
    </div>
  )
}

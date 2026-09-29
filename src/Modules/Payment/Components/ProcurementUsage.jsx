import { CalendarClock, Wallet } from 'lucide-react'

import { ProgressBar, toPercent } from '@/Components/Common/Loader'
import { cn } from '@/Library/utils'
import { compareToToday, formatLongDate } from '@/Utils/date'

/**
 * ONE PROCUREMENT PLAN THE USER ALREADY HOLDS
 *
 * Everything on it is payment/userPaymentData/ `procurement_used`
 * (pricing.parseProcurementUsage): how many events of the plan have been
 * used, when it was paid for and when it runs out. A plan whose end date has
 * passed is still shown, marked Expired, rather than hidden - the user paid
 * for it. A plan with no counted total is an unlimited one, so it gets no
 * bar and no percentage instead of a made-up 0 / 0.
 */
function UsageCard({ record }) {
  const counted = record.total !== null
  const percent = counted ? toPercent(record.used, record.total) : null
  const expired = compareToToday(record.endDate) === -1

  return (
    <li className="rounded-lg border border-border/70 bg-card p-4 text-left shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums text-brand">
          {record.used}
          {counted ? <span className="text-muted-foreground"> / {record.total}</span> : null}
        </p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            expired
              ? 'bg-muted text-muted-foreground'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
          )}
        >
          {expired ? 'Expired' : 'Active'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{counted ? 'events used' : 'events used · unlimited plan'}</p>

      {counted ? (
        <>
          <ProgressBar percent={percent} className="mt-2.5" />
          <p className="mt-1 text-right text-xs text-muted-foreground">{percent}% used</p>
        </>
      ) : null}

      <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="size-3.5" /> Payment Date
          </dt>
          <dd className="font-medium tabular-nums">{formatLongDate(record.paymentDate)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="size-3.5" /> Valid Until
          </dt>
          <dd className="font-medium tabular-nums">{formatLongDate(record.endDate)}</dd>
        </div>
      </dl>
    </li>
  )
}

/**
 * What the user already holds, shown above the Procurement plans on sale.
 * Nothing is drawn when the reply carried no `procurement_used` - someone
 * who never bought Procurement sees the plans alone, not an empty meter.
 * Every record is shown, the plan running the longest first, so a user with
 * more than one never loses sight of any of them.
 */
export function ProcurementUsage({ records = [], className }) {
  if (!records.length) return null

  return (
    <section className={cn('w-full', className)}>
      <h4 className="mb-2 text-sm font-semibold text-foreground">Your Procurement Automation usage</h4>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {records.map((record, index) => (
          <UsageCard key={`${record.endDate ?? 'plan'}-${index}`} record={record} />
        ))}
      </ul>
    </section>
  )
}

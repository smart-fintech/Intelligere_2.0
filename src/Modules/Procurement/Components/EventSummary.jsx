import { Paperclip } from 'lucide-react'

import { cn } from '@/Library/utils'
import { bidGapLabel, fileName, showAmount } from '@/Modules/Procurement/procurement'

/**
 * The master details the card does not show, read only - the top of the details
 * view. Its number, status and dates are on the card already.
 */

/** Cancelled, or the stage it is in. */
export function EventStatusBadge({ event }) {
  const tone = event.cancelled
    ? 'bg-destructive/10 text-destructive'
    : event.stage === 'Ongoing'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
      : event.stage === 'Upcoming'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
        : 'bg-muted text-muted-foreground'

  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {event.cancelled ? 'Cancelled' : event.stage}
    </span>
  )
}

/**
 * A cancelled event's card stamped CANCELLED, corner to corner - from its
 * bottom left up to its top right, at whatever size the card is (the
 * .cancelled-watermark rules in index.css). Drawn over the card but faint, and
 * never in the way of a click; the status badge still says Cancelled for a
 * screen reader. Nothing for an event that is not cancelled.
 *
 * The card it sits in must be `relative` (and clip what overflows).
 */
export function CancelledWatermark({ event }) {
  if (!event?.cancelled) return null
  return (
    <div aria-hidden="true" className="cancelled-watermark pointer-events-none absolute inset-0 z-10 overflow-hidden select-none">
      <span className="rounded-md border-[0.06em] border-current px-[0.3em] py-[0.12em] leading-none font-black tracking-[0.15em] whitespace-nowrap text-destructive/20 uppercase dark:text-destructive/30">
        Cancelled
      </span>
    </div>
  )
}

function Item({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-brand-muted">{label}</p>
      <p className="mt-0.5 text-sm break-words text-foreground">{children}</p>
    </div>
  )
}

const yesNo = (value) => (value === true ? 'Yes' : 'No')

export default function EventSummary({ event }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Item label="Starting Bid Amount">{showAmount(event.starting_bid_amount)}</Item>
        <Item label="Bid Gap">{bidGapLabel(event)}</Item>
        <Item label="Extra Time">
          {event.add_extra_time === true && Number(event.extra_time) > 0 ? `${event.extra_time} minutes` : 'No'}
        </Item>
        <Item label="Hide Vendor Details">{yesNo(event.hide_vendor)}</Item>
        <Item label="Hide Bid Amount">{yesNo(event.hide_lowest_bid_amount)}</Item>
      </div>

      {event.file.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-brand-muted">Files</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {event.file.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-64 items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs text-brand hover:bg-brand-soft"
                  title={fileName(url)}
                >
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate">{fileName(url)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

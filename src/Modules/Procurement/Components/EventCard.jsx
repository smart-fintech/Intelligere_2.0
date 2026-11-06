import { Fragment, useEffect, useRef, useState } from 'react'
import { Ban, ChevronDown, Eye, EyeOff, MessagesSquare, Pencil } from 'lucide-react'

import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { EVENT_KIND, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { cn } from '@/Library/utils'
import { CancelledWatermark, EventStatusBadge } from '@/Modules/Procurement/Components/EventSummary'
import ProductVendors from '@/Modules/Procurement/Components/ProductVendors'
import VendorProfileModal from '@/Modules/Procurement/Components/VendorProfileModal'
import { amountsHidden, isEditable, showAmount, skuDetailList, vendorBidsHidden } from '@/Modules/Procurement/procurement'
import { orDash } from '@/Utils/display'

/**
 * One Bid or Pre Bid as a card: its number at the top left, its window(s) at the
 * top right, its products in a short table. A product's arrow opens the vendors
 * invited for it (ProductVendors) under its row; "Show All Vendors" opens or
 * closes every product's at once.
 *
 * The buttons are only those that can work for it: Edit and Cancel until it has
 * closed or been cancelled; Chat on a Pre Bid once its vendors have been invited.
 */

const DANGER_MS = 30 * 60 * 1000

const productKey = (product, index) => String(product.sr_no ?? index)

const pad = (number) => String(number).padStart(2, '0')

const showLeft = (ms) => {
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const clock = `${pad(Math.floor((seconds % 86400) / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  return days > 0 ? `${days}d ${clock}` : clock
}

/**
 * Time left until `until`. When it runs out `onExpire` is called once - the
 * list is read again, so the event moves on to Completed.
 */
export function Countdown({ until, onExpire }) {
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const left = Math.max(0, until - now)
  const over = until > 0 && left === 0

  useEffect(() => {
    if (over && !fired.current) {
      fired.current = true
      onExpire?.()
    }
  }, [over, onExpire])

  if (!until) return null
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[11px] font-medium tracking-wide text-brand-muted uppercase">Time Remaining</span>
      <span
        role="timer"
        className={cn(
          'mt-0.5 text-2xl leading-none font-bold tabular-nums sm:text-3xl',
          left <= DANGER_MS ? 'text-destructive' : 'text-brand',
        )}
      >
        {showLeft(left)}
      </span>
    </div>
  )
}

/** "Starts  05-11-2026 | 09:45", the label muted, the moment in the brand colour. */
function When({ label, date, time }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap sm:justify-end">
      <dt className="text-brand-muted">{label}</dt>
      <dd className="font-semibold text-brand tabular-nums">
        {date ? (
          <>
            {date}
            <span className="mx-1 text-brand-muted">|</span>
            {time || '--'}
          </>
        ) : (
          '--'
        )}
      </dd>
    </div>
  )
}

export function Windows({ event }) {
  if (event.kind === EVENT_KIND.PRE_BID) {
    return (
      <dl className="space-y-0.5 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <div>

            <When label="Technical Starts" date={event.pre_starting_date} time={event.pre_starting_time} />
            <When label="Financial Starts" date={event.starting_date} time={event.starting_time} />
          </div>
          <div>
            <When label="Technical Closes" date={event.pre_closing_date} time={event.pre_closing_time} />
            <When label="Financial Closes" date={event.closing_date} time={event.closing_time} />
          </div>
        </div>
      </dl>
    )
  }
  return (
    <dl className="space-y-0.5 text-xs">
      <When label="Starts" date={event.starting_date} time={event.starting_time} />
      <When label="Closes" date={event.closing_date} time={event.closing_time} />
    </dl>
  )
}

/** Why a running Bid's vendors are not shown (Hide Vendor Details). */
function VendorsHidden() {
  return (
    <p className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <EyeOff className="size-3.5" /> Vendor details are hidden while this bid runs (Hide Vendor Details).
    </p>
  )
}

/**
 * The products, one row each; the arrow in a row's Action column opens its
 * vendors in a row under it (`opened` holds the open rows' keys).
 */
function ProductTable({ event, opened, onToggle, onProfile }) {
  const showLowest = event.kind === EVENT_KIND.BID && event.stage !== EVENT_STAGE.UPCOMING
  const hidden = amountsHidden(event)
  const columns = 8 + (showLowest ? 1 : 0)

  return (
    <Table containerClassName="rounded-md border border-border">
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          <TableHead width={40}>#</TableHead>
          <TableHead>Product</TableHead>
          <TableHead width={100}>HSN</TableHead>
          <TableHead width={90}>Unit</TableHead>
          <TableHead width={80}>Qty</TableHead>
          <TableHead width={110}>Delivery Days</TableHead>
          {showLowest ? <TableHead width={130}>Lowest Bid</TableHead> : null}
          <TableHead width={80}>Vendors</TableHead>
          <TableHead width={70} className="text-center">
            Action
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {event.product.map((product, index) => {
          const key = productKey(product, index)
          const isOpen = opened.has(key)
          const name = product.product_name || `product ${index + 1}`
          return (
            <Fragment key={key}>
              <TableRow data-state={isOpen ? 'selected' : undefined}>
                <TableCell className="align-top">{orDash(product.sr_no ?? index + 1)}</TableCell>
                <TableCell wrap className="align-top">
                  <span className="font-medium">{orDash(product.product_name)}</span>
                  {product.sku_code ? (
                    <SkuDetailsTooltip details={skuDetailList(product.sku_details)}>
                      <span tabIndex={0} className="ml-2 cursor-help rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">
                        {product.sku_code}
                      </span>
                    </SkuDetailsTooltip>
                  ) : null}
                  {product.Description ? (
                    <span className="block text-xs text-muted-foreground">
                      <span className="text-brand-muted">Desc:</span> {product.Description}
                    </span>
                  ) : null}
                  {product.Specification ? (
                    <span className="block text-xs text-muted-foreground">
                      <span className="text-brand-muted">Spec:</span> {product.Specification}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">{orDash(product.hsn)}</TableCell>
                <TableCell className="align-top">{orDash(product.Per)}</TableCell>
                <TableCell className="align-top tabular-nums">{orDash(product.qty)}</TableCell>
                <TableCell className="align-top tabular-nums">{orDash(product.delivery_days)}</TableCell>
                {showLowest ? (
                  <TableCell className="align-top font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                    {hidden ? 'Hidden' : showAmount(product.last_bid)}
                  </TableCell>
                ) : null}
                <TableCell className="align-top tabular-nums">{Array.isArray(product.vendor) ? product.vendor.length : 0}</TableCell>
                <TableCell className="text-center align-top">
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-sm"
                    icon={ChevronDown}
                    className={cn('[&_svg]:transition-transform', isOpen && 'text-brand [&_svg]:rotate-180')}
                    tooltip={isOpen ? 'Hide vendors' : 'Show vendors'}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} vendors of ${name}`}
                    aria-expanded={isOpen}
                    onClick={() => onToggle(key)}
                  />
                </TableCell>
              </TableRow>
              {isOpen ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="bg-muted/30 p-2 whitespace-normal">
                    {vendorBidsHidden(event) ? (
                      <VendorsHidden />
                    ) : (
                      <ProductVendors event={event} product={product} onProfile={onProfile} />
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default function EventCard({ event, onView, onEdit, onCancel, onChat, onExpire }) {
  const [opened, setOpened] = useState(() => new Set())
  const [profileOf, setProfileOf] = useState(null)

  const preBid = event.kind === EVENT_KIND.PRE_BID
  const label = preBid ? 'Pre Bid' : 'Bid'
  const running = event.stage === EVENT_STAGE.ONGOING && !event.cancelled
  const canChat = preBid && event.stage !== EVENT_STAGE.UPCOMING
  const editable = isEditable(event)
  // For the "Show All Vendors" button below, commented out with it - uncomment both together.
  // const allOpen = event.product.length > 0 && event.product.every((product, index) => opened.has(productKey(product, index)))

  const toggle = (key) =>
    setOpened((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // const toggleAll = () => setOpened(allOpen ? new Set() : new Set(event.product.map(productKey)))

  return (
    <article className="relative overflow-hidden rounded-lg border border-brand/30 bg-card shadow-xs">
      <CancelledWatermark event={event} />
      {/* Number left, time remaining in the middle (while it runs), dates right; stacked on a phone. */}
      <header className="grid grid-cols-1 items-center gap-x-6 gap-y-2 border-b border-border bg-muted/40 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-brand-muted">{label} No</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-brand" title={event.Auction_no}>
              {event.Auction_no || '--'}
            </h3>
            <EventStatusBadge event={event} />
          </div>
        </div>
        {running ? <Countdown until={event.closes_at} onExpire={onExpire} /> : <div aria-hidden="true" className="hidden sm:block" />}
        <div className="sm:justify-self-end">
          <Windows event={event} />
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-3 sm:px-4">
        {event.product.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product.</p>
        ) : (
          <>
            <ProductTable event={event} opened={opened} onToggle={toggle} onProfile={setProfileOf} />
            {/* <div>
               <Button type="button" variant="link" size="sm" className="h-7 px-0" aria-expanded={allOpen} onClick={toggleAll}>
                {allOpen ? 'Hide All Vendors' : `Show All Vendors (${event.vendor_count})`}
                <ChevronDown className={cn('size-3.5 transition-transform', allOpen && 'rotate-180')} />
              </Button> 
            </div> */}
          </>
        )}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-3 py-2 sm:px-4">
        <Button type="button" variant="outline" size="sm" icon={Eye} onClick={() => onView(event)}>
          Details
        </Button>
        {canChat ? (
          <Button type="button" variant="outline" size="sm" icon={MessagesSquare} onClick={() => onChat(event)}>
            Chat
          </Button>
        ) : null}
        {editable ? (
          <>
            <Button type="button" variant="outline" size="sm" icon={Pencil} onClick={() => onEdit(event)}>
              Edit
            </Button>
            <Button type="button" variant="destructive" size="sm" icon={Ban} onClick={() => onCancel(event)}>
              Cancel {label}
            </Button>
          </>
        ) : null}
      </footer>

      {profileOf ? <VendorProfileModal vendor={profileOf} event={event} onClose={() => setProfileOf(null)} /> : null}
    </article>
  )
}

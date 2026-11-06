import { Fragment, useState } from 'react'
import { ChevronDown, IdCard } from 'lucide-react'

import { StarRating } from '@/Components/Common/StarRating'
import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { EVENT_KIND, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { cn } from '@/Library/utils'
import { showSentAt } from '@/Modules/Procurement/preBidChat'
import { amountsHidden, overallRating, showAmount, sortVendorsByBid, vendorKey } from '@/Modules/Procurement/procurement'
import { orDash } from '@/Utils/display'

/**
 * The vendors invited for one product.
 *
 * A Bid that has started also shows each vendor's latest bid, its delivery days
 * and its position, lowest bid first; a vendor row opens out into its bid
 * history, its changes of delivery days and its notes (vendor_bid). A Pre Bid
 * has no bids - its vendors are listed as invited.
 */

const asList = (value) => (Array.isArray(value) ? value : [])

export function VendorHistory({ vendor, showAmounts }) {
  const bids = asList(vendor.bid_history)
  const deliveries = asList(vendor.delivery_days_history)
  const notes = asList(vendor.notes).filter((note) => String(note ?? '').trim())

  return (
    <div className="grid grid-cols-1 gap-4 bg-muted/30 p-3 text-xs md:grid-cols-3">
      <div>
        <p className="mb-1 font-semibold text-brand">Bid History</p>
        {bids.length === 0 ? (
          <p className="text-muted-foreground">No bid yet.</p>
        ) : (
          <ol className="space-y-1">
            {bids.map((bid, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-1">
                <span className="tabular-nums">{showAmounts ? showAmount(bid?.bid_amount) : 'Hidden'}</span>
                <span className="text-muted-foreground">
                  {showSentAt(bid?.bid_time)}
                  {bid?.delivery_days ? ` · ${bid.delivery_days} days` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <p className="mb-1 font-semibold text-brand">Delivery Days Changes</p>
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground">No change.</p>
        ) : (
          <ol className="space-y-1">
            {deliveries.map((change, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-1">
                <span>
                  {orDash(change?.old_delivery_days)} &rarr; {orDash(change?.delivery_days)}
                </span>
                <span className="text-muted-foreground">{orDash(change?.updated_time)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <p className="mb-1 font-semibold text-brand">Notes</p>
        {notes.length === 0 ? (
          <p className="text-muted-foreground">No notes.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4">
            {notes.map((note, index) => (
              <li key={index} className="break-words">
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function ProductVendors({ event, product, onProfile }) {
  const [opened, setOpened] = useState(null)

  const withBids = event.kind === EVENT_KIND.BID && event.stage !== EVENT_STAGE.UPCOMING
  const showAmounts = !amountsHidden(event)
  const vendors = withBids ? sortVendorsByBid(product.vendor) : asList(product.vendor)
  const columns = 4 + (withBids ? 3 : 0) + 1

  if (vendors.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">No vendor is invited for this product.</p>
  }

  return (
    <Table containerClassName="rounded-md border border-border">
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          <TableHead width={40}>#</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Email</TableHead>
          {withBids ? (
            <>
              <TableHead width={130}>Last Bid</TableHead>
              <TableHead width={110}>Delivery Days</TableHead>
              <TableHead width={80}>Position</TableHead>
            </>
          ) : null}
          <TableHead width={withBids ? 150 : 110} className="text-right">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendors.map((vendor, index) => {
          const key = vendorKey(vendor) || String(index)
          const isOpen = opened === key
          const rating = overallRating(vendor.rating)
          return (
            <Fragment key={key}>
              <TableRow>
                <TableCell>{index + 1}</TableCell>
                <TableCell wrap>
                  <span className="font-medium">{orDash(vendor.name)}</span>
                  {vendor.company ? <span className="block text-xs text-muted-foreground">{vendor.company}</span> : null}
                  {rating ? <StarRating value={rating} readOnly half size="sm" label={`${vendor.name} rating`} /> : null}
                </TableCell>
                <TableCell wrap>
                  {orDash(vendor.contact)}
                  {vendor.whatsapp && vendor.whatsapp !== vendor.contact ? (
                    <span className="block text-xs text-muted-foreground">WhatsApp {vendor.whatsapp}</span>
                  ) : null}
                </TableCell>
                <TableCell title={vendor.email}>{orDash(vendor.email)}</TableCell>
                {withBids ? (
                  <>
                    <TableCell className="tabular-nums">{showAmounts ? showAmount(vendor.last_vender_bid) : 'Hidden'}</TableCell>
                    <TableCell className="tabular-nums">{orDash(vendor.delivery_days)}</TableCell>
                    <TableCell className="tabular-nums">{orDash(vendor.bid_rank)}</TableCell>
                  </>
                ) : null}
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={IdCard}
                      tooltip="Vendor profile"
                      aria-label={`Profile of ${vendor.name}`}
                      onClick={() => onProfile(vendor)}
                    />
                    {withBids ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={isOpen}
                        onClick={() => setOpened(isOpen ? null : key)}
                      >
                        History
                        <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
              {isOpen ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="p-0 whitespace-normal">
                    <VendorHistory vendor={vendor} showAmounts={showAmounts} />
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

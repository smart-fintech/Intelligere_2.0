import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { EVENT_KIND, EVENT_KINDS } from '@/Constants/procurementAutomation'
import EventSummary, { EventStatusBadge } from '@/Modules/Procurement/Components/EventSummary'
import { TechnicalBidView } from '@/Modules/Procurement/Components/TechnicalBid'

/**
 * What a Bid or Pre Bid's card does not show, read only: its settings and files,
 * and a Pre Bid's technical bid. The number, status, dates, products and vendors
 * are on the card it is opened from, so they are not repeated here.
 */

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-border pb-1.5 text-sm font-semibold text-brand">{title}</h3>
      {children}
    </section>
  )
}

export default function EventDetailsModal({ event, onClose }) {
  const { label } = EVENT_KINDS[event.kind]
  const preBid = event.kind === EVENT_KIND.PRE_BID

  return (
    <Modal
      open
      onOpenChange={onClose}
      size={preBid ? 'xl' : 'lg'}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {label} {event.Auction_no}
          <EventStatusBadge event={event} />
        </span>
      }
      autoFocus={false}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5 pr-1">
        <Section title="Settings">
          <EventSummary event={event} />
        </Section>

        {preBid ? (
          <Section title="Technical Bid">
            <TechnicalBidView event={event} />
          </Section>
        ) : null}
      </div>
    </Modal>
  )
}

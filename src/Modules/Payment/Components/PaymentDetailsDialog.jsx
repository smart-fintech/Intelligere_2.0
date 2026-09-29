import { Modal } from '@/Components/Common/Modal'

import { OrderSummary } from './OrderSummary'

/**
 * THE LAST LOOK BEFORE PAYING
 *
 * Pay Now on the page opens this; Pay Now inside it starts the payment that
 * has always been started - the order is created, the offer is marked used
 * and Cashfree opens, all from `onConfirm`. Nothing is created by merely
 * opening the dialog.
 *
 * Every figure is the quote's, drawn by the same OrderSummary the other
 * payment pages use, so what is reviewed here cannot differ from what is
 * charged: the plans taken, the company count, any discount, GST and the
 * total. Nothing is worked out again.
 */
export function PaymentDetailsDialog({ open, onOpenChange, quote, facts, paying, waiting, onConfirm }) {
  if (!open) return null

  return (
    <Modal open onOpenChange={onOpenChange} size="md" title="Payment Details">
      <OrderSummary
        // title="Your selection"
        facts={facts}
        quote={quote}
        paying={paying}
        waiting={waiting}
        onPay={onConfirm}
        payLabel="Pay Now"
        note="for 1 year, GST included"
        // Read in brand blue here, with anything coming off in green.
        tone="brand"
        className="border-0 shadow-none lg:static"
      />
    </Modal>
  )
}

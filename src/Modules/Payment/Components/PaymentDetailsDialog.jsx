import { Modal } from '@/Components/Common/Modal'

// import { formatINR } from '../pricing'
import { OrderSummary,
  //  SummaryRow
   } from './OrderSummary'

/** What a discount reads as, here and in the summary's own rows. */
// const SAVING = 'text-emerald-700 dark:text-emerald-400'

/**
 * HOW AN UPGRADE REACHED ITS FIGURE
 *
 * Read inside the summary, in the summary's own rows, so it is part of the one
 * calculation rather than a card of its own. Only for a package the user
 * already holds, and only the lines that say something:
 *
 *   the credit its existing package puts towards this one
 *   what the change of plan costs, when the plan changed
 *   what the companies added on top cost, when any were added
 *   the package's own total, when it is made of more than one of those
 *
 * Every figure is the quote's `upgrades` - nothing is worked out here.
 */
// function UpgradeBreakdown({ upgrades = [], accent }) {
//   if (!upgrades.length) return null

//   return (
//     <div className="space-y-3">
//       {upgrades.map((entry) => {
//         const parts = [entry.packageUpgradeAmount > 0, entry.additionalCompanyAmount > 0].filter(Boolean).length
//         const from = entry.replacing ?? entry.from

//         return (
//           <div key={entry.key} className="space-y-2">
//             <p className="text-xs font-semibold tracking-wide text-brand uppercase">
//               {entry.name}
//               {from ? <span className="font-normal text-muted-foreground"> · from {from}</span> : null}
//             </p>

//             {entry.credit > 0 ? (
//               <SummaryRow label="Upgrade credit" value={formatINR(-entry.credit)} accent={SAVING} />
//             ) : null}

//             {entry.packageUpgradeAmount > 0 ? (
//               <SummaryRow
//                 label={entry.to ? `Move to ${entry.to}` : 'Plan upgrade'}
//                 value={formatINR(entry.packageUpgradeAmount)}
//                 accent={accent}
//               />
//             ) : null}

//             {entry.additionalCompanyAmount > 0 ? (
//               <SummaryRow
//                 label={`Companies ${entry.paidCompanies} → ${entry.companies}`}
//                 value={formatINR(entry.additionalCompanyAmount)}
//                 accent={accent}
//               />
//             ) : null}

//             {parts > 1 ? (
//               <SummaryRow label="Package total" value={formatINR(entry.upgradeAmount)} accent={accent} strong />
//             ) : null}
//           </div>
//         )
//       })}
//     </div>
//   )
// }

/**
 * THE LAST LOOK BEFORE PAYING
 *
 * Pay Now on the page opens this; Pay Now inside it starts the payment that
 * has always been started - the order is created, the offer is marked used
 * and Cashfree opens, all from `onConfirm`. Nothing is created by merely
 * opening the dialog, and it never opens on a selection with nothing to pay.
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
        // Every figure of an upgrade is read here, inside the summary - the
        // cards outside show only what a plan costs.
        // details={<UpgradeBreakdown upgrades={quote.upgrades} accent="text-brand" />}
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

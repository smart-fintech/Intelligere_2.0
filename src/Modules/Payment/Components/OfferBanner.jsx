import { Loader } from '@/Components/Common/Loader'
import { formatLongDate } from '@/Utils/date'

/**
 * The offer open to this user, as the old payment page showed it: one line
 * of brand-blue text across the top of the plans. While payment/checkOffer is
 * still answering, a small "checking" note; nothing when there is no offer to
 * apply (see ../offer for when that is).
 */
export function OfferBanner({ offer, status }) {
  if (status === 'loading') {
    return <Loader variant="inline" size="xs" label="Checking available offers..." className="justify-center" />
  }
  if (!offer) return null

  return (
    <p role="status" className="text-center text-lg text-brand">
      <span aria-hidden="true">🎉 </span>
      <span className="font-bold capitalize">{offer.title}</span> — {offer.percent}% OFF
      {offer.endDate ? (
        <span className="text-sm text-muted-foreground"> · valid until {formatLongDate(offer.endDate)}</span>
      ) : null}
    </p>
  )
}

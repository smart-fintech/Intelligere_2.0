import { useQuery } from '@/Library/queryCache'
import { readVendorEvents, vendorEventsKey } from '@/Modules/VendorPortal/vendorPortal'
import { getVendorEvents } from '@/Services/Procurement/vendorPortalService'

/** The vendor's Bids or Pre Bids, by stage (readVendorEvents) - nothing while signed out. */
export default function useVendorEvents(email, kind) {
  return useQuery({
    key: email ? vendorEventsKey(email, kind) : null,
    fetch: () => getVendorEvents(kind, email).then((reply) => readVendorEvents(reply, kind)),
  })
}

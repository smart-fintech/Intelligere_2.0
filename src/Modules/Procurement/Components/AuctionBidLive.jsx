import { fetchQuery, updateQueryData } from '@/Library/queryCache'
import { applyBidUpdate } from '@/Modules/Procurement/procurement'
import useLiveSocket from '@/Modules/Procurement/useLiveSocket'
import { auctionBidSocketUrl } from '@/Services/Procurement/procurementAutomationService'

/**
 * One running bid's live socket (ws/auction_bid/<id>/, the company's login
 * token) - nothing on screen. Mounted once per ongoing bid of the list, keyed
 * by its id, so a bid that closes or leaves the list closes its socket.
 *
 *   connected    the list is loaded again, to catch bids placed while the
 *                socket was down (a load already on its way is shared, so
 *                several bids connecting at once ask once)
 *   bid_update   applied to the cached list (applyBidUpdate) - the cards
 *                update at once; one it cannot be applied to loads the list
 *
 *   listKey / loadList   the bid list's cache key and its load (ProcurementScreen)
 */
export default function AuctionBidLive({ auctionId, listKey, loadList }) {
  const refresh = () => fetchQuery(listKey, loadList).catch(() => {})

  useLiveSocket({
    id: `bid:${auctionId}`,
    url: () => auctionBidSocketUrl(auctionId),
    onConnected: refresh,
    onMessage: (data) => {
      if (data?.type !== 'bid_update') return
      if (!updateQueryData(listKey, (events) => applyBidUpdate(events, data))) refresh()
    },
  })

  return null
}

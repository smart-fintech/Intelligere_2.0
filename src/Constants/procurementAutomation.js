/**
 * The Procurement Automation module's fixed names.
 *
 *   EVENT_KIND          the two things the module runs: a Bid (an auction) and
 *                        a Pre Bid (a technical bid window before the auction)
 *   EVENT_KINDS          what differs between the two, so no screen has to
 *                        branch on the kind for a URL or a key name
 *   EVENT_STAGES         the stages a list reply is grouped in, in tab order
 *   LIVE_SOCKET          Procurement's live sockets' keep-alive and close codes (useLiveSocket)
 */

export const EVENT_KIND = Object.freeze({
  BID: 'bid',
  PRE_BID: 'preBid',
})

/**
 *   label        what the screens call it
 *   url          its endpoint: POST { company_id } lists, POST with more creates,
 *                PUT updates, DELETE cancels
 *   idKey        the id each record of the list carries
 *   cancelKey    the flag a cancelled record carries, and the DELETE sends
 *   listSuffix   the list reply's keys are "<stage> <listSuffix>"
 *   vendorListUrl  the vendor portal's list: POST { email } -> the same keys,
 *                Ongoing and Completed only, each product with this vendor alone
 */
export const EVENT_KINDS = Object.freeze({
  [EVENT_KIND.BID]: {
    label: 'Bid',
    url: 'procurement/auction_create/',
    vendorListUrl: 'procurement/vendor_auction_list/',
    idKey: 'auction_id',
    cancelKey: 'auction_cancel',
    listSuffix: 'Auction',
  },
  [EVENT_KIND.PRE_BID]: {
    label: 'Pre Bid',
    url: 'procurement/pre_bid_create/',
    vendorListUrl: 'procurement/vendor_pre_bid_list/',
    idKey: 'pre_bid_id',
    cancelKey: 'pre_bid_cancel',
    listSuffix: 'Pre Bid',
  },
})

export const EVENT_STAGE = Object.freeze({
  ONGOING: 'Ongoing',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Completed',
})

export const EVENT_STAGES = [EVENT_STAGE.ONGOING, EVENT_STAGE.UPCOMING, EVENT_STAGE.COMPLETED]

/**
 * The vendor portal reads its running bids again this often: nothing pushes
 * another vendor's lower bid to it, and the close moves when extra time is added.
 */
export const VENDOR_REFRESH_MS = 20 * 1000

export const LIVE_SOCKET = Object.freeze({
  PING_MS: 25 * 1000,
  RETRY_MAX_MS: 30 * 1000,
  // Tries in a row that fail before the socket waits for the network or the
  // tab to come back (after 1s, 2s, 4s, 8s) - a server that will not take it
  // is not asked forever.
  RETRY_LIMIT: 4,
  // The login was refused (a missing or expired token): tried again only with a new one.
  LOGIN_CLOSE_CODE: 4401,
  // Refused for good (not allowed, no such bid) - asking again would be refused again.
  FINAL_CLOSE_CODES: [4403, 4404],
})

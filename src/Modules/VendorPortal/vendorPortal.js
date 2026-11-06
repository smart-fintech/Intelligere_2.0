/**
 * The vendor portal's plain logic - no React, no requests.
 *
 * The vendor lists (payload_res: vendor_auction_list/, vendor_pre_bid_list/)
 * are the company's lists cut down to one vendor: the same records, Ongoing and
 * Completed only, each product carrying this vendor alone in `vendor` and the
 * product's lowest bid in `last_bid`. So they are read with the Procurement
 * module's readEvents, and only what is the vendor's own is worked out here.
 *
 *   readVendorEvents   a list reply -> { Ongoing: [event], Completed: [event] }
 *   myEntry            this vendor's record on a product (its bid, rank, history)
 *   bidRules           the most this vendor may bid now, and why
 *   bidErrors          { field: message } for the bid form - empty when it can be sent
 *   buildBidBody       the vendor_bid payload
 *
 * THE BID RULES. The backend saves any bid and only ranks them, so the rules a
 * reverse auction runs on are checked here, before anything is sent:
 *   - a bid is above 0, at most 2 decimals, and not more than the starting amount
 *   - it beats the vendor's own last bid by at least the bid gap (a % of that
 *     bid, or a ₹ amount) - as the old portal's DisplayAuctionData did, whether
 *     or not the company hides the bid amounts; a vendor's first bid has only
 *     the starting amount above it
 *   - delivery days are whole days above 0; a note is added to the vendor's notes
 * A bid, new delivery days or a note can each be sent on its own.
 */

import { EVENT_KIND, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { QUERY } from '@/Constants/queryKeys'
import { readEvents, showAmount } from '@/Modules/Procurement/procurement'

const asList = (value) => (Array.isArray(value) ? value : [])
const asText = (value) => (value === null || value === undefined ? '' : String(value).trim())
const sameEmail = (a, b) => asText(a).toLowerCase() === asText(b).toLowerCase()

export const VENDOR_STAGES = [EVENT_STAGE.ONGOING, EVENT_STAGE.COMPLETED]

export const readVendorEvents = (reply, kind) => {
  const events = readEvents(reply, kind)
  return Object.fromEntries(VENDOR_STAGES.map((stage) => [stage, events[stage]]))
}

export const vendorEventsKey = (email, kind) => [QUERY.VENDOR_EVENTS, asText(email).toLowerCase(), kind]

/** This vendor's record on a product - the list sends only it, matched by email to be sure. */
export const myEntry = (product, email) => {
  const vendors = asList(product?.vendor)
  return vendors.find((vendor) => sameEmail(vendor?.email, email)) ?? vendors[0] ?? null
}

/** This vendor's record anywhere in the lists - its id, name and `Profile` - or null before any bid invites it. */
export const findMyRecord = (lists, email) => {
  for (const list of lists) {
    for (const stage of VENDOR_STAGES) {
      for (const event of asList(list?.[stage])) {
        for (const product of event.product) {
          const mine = asList(product?.vendor).find((vendor) => sameEmail(vendor?.email, email))
          if (mine) return mine
        }
      }
    }
  }
  return null
}

/** Whether a vendor can bid on it now: a running, uncancelled Bid. */
export const canBid = (event) =>
  event.kind === EVENT_KIND.BID && event.stage === EVENT_STAGE.ONGOING && !event.cancelled && event.auction_end !== true

/** Whether its chat can be written in: a running, uncancelled Pre Bid. */
export const canChat = (event) =>
  event.kind === EVENT_KIND.PRE_BID && event.stage === EVENT_STAGE.ONGOING && !event.cancelled

const floor2 = (value) => Math.floor(value * 100 + 1e-6) / 100

/**
 *   lowest      the product's lowest bid (0: none yet)
 *   own         this vendor's last bid (0: none yet)
 *   hidden      the company hides the bid amounts - `lowest` is not shown
 *   reference   what a new bid must beat: `own` (0: no bid yet)
 *   gapAmount   the bid gap in ₹ against that reference
 *   max         the most that may be bid now (Infinity: no limit), 0 when no lower bid is possible
 *   starting    the starting amount (0: none)
 */
export const bidRules = (event, product, mine) => {
  const lowest = Number(product?.last_bid) > 0 ? Number(product.last_bid) : 0
  const own = Number(mine?.last_vender_bid) > 0 ? Number(mine.last_vender_bid) : 0
  const hidden = event?.hide_lowest_bid_amount === true
  const reference = own
  const gap = Number(event?.gap) > 0 ? Number(event.gap) : 0
  const gapAmount = reference > 0 ? (event?.bid_gap_percentage ? (reference * gap) / 100 : gap) : 0
  const starting = Number(event?.starting_bid_amount) > 0 ? Number(event.starting_bid_amount) : 0

  let max = reference > 0 ? floor2(reference - gapAmount) : Infinity
  if (starting > 0) max = Math.min(max, starting)
  return {
    lowest,
    own,
    hidden,
    reference,
    gapAmount,
    max: Math.max(0, max),
    starting,
  }
}

/** What the most allowed bid is, in words - for the hint under the box and the error. */
export const bidLimitText = (rules) => {
  if (rules.max === 0) return 'No lower bid is possible with this bid gap.'
  if (!Number.isFinite(rules.max)) return 'Any amount above 0.'
  if (rules.reference === 0) return `At most ${showAmount(rules.max)} (the starting amount).`
  return `At most ${showAmount(rules.max)} - your last bid less the bid gap.`
}

export const emptyBidForm = () => ({ amount: '', delivery_days: '', note: '' })

export const BID_FORM_ERROR = 'form'

export const bidErrors = (form, rules, mine) => {
  const errors = {}
  const amount = asText(form.amount)
  const days = asText(form.delivery_days)
  const note = asText(form.note)

  if (amount !== '') {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) errors.amount = 'Enter an amount above 0.'
    else if (!/^\d+(\.\d{1,2})?$/.test(amount)) errors.amount = 'At most 2 decimals.'
    else if (rules.own > 0 && value === rules.own) errors.amount = 'This is already your bid.'
    else if (value > rules.max) errors.amount = bidLimitText(rules)
  }
  if (days !== '' && !(/^\d+$/.test(days) && Number(days) > 0)) errors.delivery_days = 'Whole days above 0.'

  const daysChanged = days !== '' && days !== asText(mine?.delivery_days)
  if (!errors.amount && !errors.delivery_days && amount === '' && !daysChanged && note === '') {
    errors[BID_FORM_ERROR] = 'Enter a bid, new delivery days or a note.'
  }
  return errors
}

/** The vendor_bid payload: only what changed is sent, so the backend keeps the rest as it is. */
export const buildBidBody = ({ event, product, mine, form }) => {
  const amount = asText(form.amount)
  const days = asText(form.delivery_days)
  const note = asText(form.note)

  const entry = { id: mine.id }
  if (amount !== '') entry.last_vender_bid = String(Number(amount))
  if (days !== '' && days !== asText(mine.delivery_days)) entry.delivery_days = days
  // The backend replaces the notes with what is sent, so the earlier ones go too.
  if (note !== '') entry.notes = [...asList(mine.notes).filter((item) => asText(item) !== ''), note]

  return {
    auction_id: event.id,
    product: [{ sr_no: product.sr_no, vendor: [entry] }],
  }
}

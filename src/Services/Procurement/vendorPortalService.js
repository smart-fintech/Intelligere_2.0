/**
 * THE VENDOR PORTAL - every URL a vendor uses (payload_res: procurement/).
 *
 * A vendor is not an app user. It has no token: it signs in with its email and
 * password, and every later call names it by that email. So each call here goes
 * out without the app user's token and is never read as an app sign-in
 * (VENDOR_CALL) - a buyer signed in in the same browser is neither sent along
 * nor signed out by a vendor's failure.
 *
 *   POST  procurement/vendor_login/            { email, password }
 *         -> { msg: "Login successful" }, or { msg: "Password is empty" } (HTTP 200)
 *            when the vendor has none yet; 400 "Invalid password", 404 "Vendor not found"
 *   PUT   procurement/vendor_login/            { email, password } -> sets the first password
 *   POST  procurement/vendor_forgot_password/  { email } -> mails a reset link; the reset page
 *         then opens the portal at /?email=...&pass=... (see AppRoutes)
 *
 *   POST  procurement/vendor_auction_list/     { email } -> { "Ongoing Auction": [...], "Completed Auction": [...] }
 *   POST  procurement/vendor_pre_bid_list/     { email } -> { "Ongoing Pre Bid": [...], "Completed Pre Bid": [...] }
 *   POST  procurement/vendor_bid/              { auction_id, product: [{ sr_no, vendor: [{ id,
 *                                               last_vender_bid?, delivery_days?, notes? }] }] }
 *
 *   POST  procurement/pre_bid_chat/            { pre_bid_id, email } -> { "<email>": [message] }
 *   POST  procurement/pre_bid_chat/            { pre_bid_id, vendor_email, send_by: "vendor", send_to: "user", message }
 *   WS    ws/pre_bid_chat/<pre_bid_id>/?email=<email>
 *
 *   PUT   inventory/vendor_create/            multipart: action "profile_save", email, vendor_id,
 *         vendor_profile (JSON text) - the vendor's profile (Modules/Procurement/vendorProfile).
 *         vendor_id is the vendor's id as the bid lists carry it (the Vendor row's id,
 *         findMyRecord) - sent with the email, never in its place.
 *         A document picked in the form goes as its own part: its place in vendor_profile
 *         holds "__file__<n>" and the part is named the same (the old portal's
 *         vendorProfileApi); a document already stored stays its URL.
 *
 * A failure is an Error carrying the backend's text (Services/Global/apiService).
 */

import { ENV } from '@/Config/env'
import { EVENT_KINDS } from '@/Constants/procurementAutomation'
import { api } from '@/Services/Global/apiService'

const VENDOR_LOGIN_URL = 'procurement/vendor_login/'
const PRE_BID_CHAT_URL = 'procurement/pre_bid_chat/'

const VENDOR_CALL = { skipAuth: true, skipSession: true }

/** What vendor_login answers with 200 for a vendor that has no password yet. */
export const PASSWORD_EMPTY_MSG = 'Password is empty'

export const vendorLogin = ({ email, password }) => api.post(VENDOR_LOGIN_URL, { email, password }, VENDOR_CALL)

export const setVendorPassword = ({ email, password }) => api.put(VENDOR_LOGIN_URL, { email, password }, VENDOR_CALL)

export const vendorForgotPassword = (email) => api.post('procurement/vendor_forgot_password/', { email }, VENDOR_CALL)

export const getVendorEvents = (kind, email) => api.post(EVENT_KINDS[kind].vendorListUrl, { email }, VENDOR_CALL)

/** `body` is buildBidBody's (Modules/VendorPortal/vendorPortal). */
export const placeVendorBid = (body) => api.post('procurement/vendor_bid/', body, VENDOR_CALL)

export const getVendorPreBidChat = (preBidId, email) =>
  api.post(PRE_BID_CHAT_URL, { pre_bid_id: preBidId, email }, VENDOR_CALL)

/** The vendor always writes as "vendor", to the company ("user"). */
export const sendVendorPreBidChat = ({ preBidId, vendorEmail, message }) =>
  api.post(
    PRE_BID_CHAT_URL,
    {
      pre_bid_id: preBidId,
      vendor_email: vendorEmail,
      send_by: 'vendor',
      send_to: 'user',
      message,
    },
    VENDOR_CALL,
  )

/** The vendor's live socket of one pre bid's chat, or null without a socket base URL. */
export const vendorPreBidChatSocketUrl = (preBidId, email) => {
  if (!ENV.WS_BASE_URL || !email || preBidId === null || preBidId === undefined) return null
  return `${ENV.WS_BASE_URL}ws/pre_bid_chat/${encodeURIComponent(preBidId)}/?email=${encodeURIComponent(email)}`
}

const VENDOR_PROFILE_URL = 'inventory/vendor_create/'

// The instance's default type is JSON, which would turn a FormData into JSON; for a
// FormData axios then drops this header and the browser writes the multipart type
// with its own boundary.
const VENDOR_MULTIPART = { ...VENDOR_CALL, headers: { 'Content-Type': 'multipart/form-data' } }

/** What a picked document is replaced by in vendor_profile, and the name of its part. */
export const FILE_TOKEN_PREFIX = '__file__'

const extractFiles = (value, files) => {
  if (typeof File !== 'undefined' && value instanceof File) {
    files.push(value)
    return `${FILE_TOKEN_PREFIX}${files.length - 1}`
  }
  if (Array.isArray(value)) return value.map((item) => extractFiles(item, files))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extractFiles(item, files)]))
  }
  return value
}

/**
 * `profile` is buildVendorProfile's; `vendorId` the vendor's id from the bid
 * lists. A record without one (none is known to the frontend) sends no
 * vendor_id rather than a made-up one - the email still names the vendor.
 */
export const buildVendorProfileFormData = ({ email, vendorId, profile }) => {
  const files = []
  const body = new FormData()
  body.append('action', 'profile_save')
  body.append('email', email)
  if (vendorId !== null && vendorId !== undefined && String(vendorId).trim() !== '') {
    body.append('vendor_id', String(vendorId).trim())
  }
  body.append('vendor_profile', JSON.stringify(extractFiles(profile, files)))
  files.forEach((file, index) => body.append(`${FILE_TOKEN_PREFIX}${index}`, file))
  return body
}

export const saveVendorProfile = ({ email, vendorId, profile }) =>
  api.put(VENDOR_PROFILE_URL, buildVendorProfileFormData({ email, vendorId, profile }), VENDOR_MULTIPART)

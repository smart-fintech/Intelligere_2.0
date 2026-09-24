/**
 * Everything the Payment module says to the backend.
 *
 *   POST   payment/userPaymentData/        the current subscription, or "new payment"
 *   GET   payment/priceList/              the whole price list (source of truth)
 *   POST  payment/checkOffer/             { email }      the offer open to this user
 *   PUT   payment/checkOffer/             { id }         mark that offer as used
 *   POST  payment/paymentDetail/         create the order -> payment_session_id
 *   POST  payment/PaymentConfirm/         { order_id }   confirm a main-product order
 *   POST  payment/PremiumPaymentConfirm/  { order_id }   confirm a premium-feature order
 *   POST  payment/paymentHistory/         { email }      main-product payments
 *   POST  payment/premiumHistory/          { comp_name }  premium-feature payments
 *
 * Each URL is written once, in PAYMENT_ENDPOINTS.
 *
 * Nothing here catches an error unless it says so: the shared axios setup
 * (Services/authService) already turns a failure into an Error carrying the
 * backend's own text.
 */

import { getEmail } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

export const PAYMENT_ENDPOINTS = Object.freeze({
  SUBSCRIPTION: 'payment/userPaymentData/',
  PRICE_LIST: 'payment/priceList/',
  CHECK_OFFER: 'payment/checkOffer/',
  PAYMENT_DETAILS: 'payment/paymentDetail/',
  CONFIRM: 'payment/paymentConfirm/',
  PREMIUM_CONFIRM: 'payment/premiumPaymentConfirm/',
  HISTORY: 'payment/paymentHistory/',
  PREMIUM_HISTORY: 'payment/premiumHistory/',
})

/**
 * What an order is for. It is sent as `product_type` when the order is made,
 * and it decides which confirmation endpoint is called when the user returns.
 */
export const PRODUCT_TYPE = Object.freeze({
  MAIN: 'main_product',
  PREMIUM_FEATURE: 'premium_feature',
})

/** Pulls a list out of a bare array, `{ data: [...] }` or `{ results: [...] }`. */
const toList = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.results)) return response.results
  return []
}

/** An object reply, unwrapped from `{ data: {...} }` when it comes wrapped. */
const toRecord = (response) =>
  response?.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data
    : response

/* ------------------------------------------------------------------ */
/* Before a payment                                                   */
/* ------------------------------------------------------------------ */

/**
 * The user's current plan:
 *
 *   { payment: "new payment" }                        never paid -> full price list
 *   { payment_date, module: [...], company_package,   an existing plan
 *     package_type, amount }
 *
 * A failure is not fatal - it is read as a new payment, so the whole price
 * list is still offered. The backend decides at payment time either way.
 */
export const getSubscription = async (email = getEmail()) => {
  try {
    return toRecord(await api.post(PAYMENT_ENDPOINTS.SUBSCRIPTION, { email }))
  } catch (error) {
    console.warn('[Payment] Could not read the current subscription:', error.message)
    return null
  }
}

/** The raw price list. Parsing it is Modules/Payment/pricing's job. */
export const getPriceList = () => api.get(PAYMENT_ENDPOINTS.PRICE_LIST)

/**
 * The offer open to this user, raw - Modules/Payment/offer decides whether
 * it applies. A failure means "no offer": prices are shown undiscounted,
 * which is never more than the backend will charge.
 */
export const checkOffer = async (email = getEmail()) => {
  if (!email) return null
  try {
    return toRecord(await api.post(PAYMENT_ENDPOINTS.CHECK_OFFER, { email }))
  } catch (error) {
    console.warn('[Payment] Could not check for offers:', error.message)
    return null
  }
}

/**
 * Marks an offer as used - sent when the user pays with its discount applied,
 * so the backend can set dis_apply and not give it again. Unlike checkOffer
 * above, a failure here is thrown: the payment must not go ahead with a
 * discount the backend was not told about.
 */
export const applyOffer = (offerId) => api.put(PAYMENT_ENDPOINTS.CHECK_OFFER, { id: offerId })

/**
 * Creates the order. The backend re-prices the selection itself - modules,
 * company count, offer and GST - and must reject an amount that does not
 * match. The figures sent here are only what the user was shown.
 */
export const createPaymentOrder = (payload) => api.post(PAYMENT_ENDPOINTS.PAYMENT_DETAILS, payload)

/* ------------------------------------------------------------------ */
/* After Cashfree                                                     */
/* ------------------------------------------------------------------ */

/**
 * Confirms an order with the endpoint that matches what was bought. A
 * premium-feature order is never sent to the main confirmation, or the
 * other way round.
 */
export const confirmPayment = (orderId, productType) =>
  api.post(
    productType === PRODUCT_TYPE.PREMIUM_FEATURE ? PAYMENT_ENDPOINTS.PREMIUM_CONFIRM : PAYMENT_ENDPOINTS.CONFIRM,
    { order_id: orderId },
  )

/*
 * THE ORDER IN FLIGHT
 *
 * Checkout leaves the app, and Cashfree sends the user back with only an
 * order_id in the URL. What the order was FOR (main product or premium
 * feature) is written to sessionStorage just before leaving and read back on
 * return - it is the product_type that was sent, not something guessed from
 * the page. sessionStorage belongs to this tab, which is the tab Cashfree
 * returns to.
 */
const PENDING_ORDER_KEY = 'intelligere.payment.pending'

export const rememberPendingOrder = ({ orderId, productType }) => {
  try {
    sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ orderId: orderId ?? null, productType }))
  } catch {
    // Storage switched off: the return URL's product_type (if the backend
    // adds one) is the only other source - see readPendingProductType.
  }
}

/**
 * What the returning order was for:
 *   1. ?product_type= on the return URL, when the backend puts it there
 *   2. the order remembered above, when its id matches (or it had none)
 *   3. otherwise a main-product order - the old flow's only kind
 */
export const readPendingProductType = (orderId, urlProductType) => {
  if (Object.values(PRODUCT_TYPE).includes(urlProductType)) return urlProductType
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_ORDER_KEY) || 'null')
    if (pending && (!pending.orderId || pending.orderId === orderId)) return pending.productType
  } catch {
    // Unreadable - fall through.
  }
  return PRODUCT_TYPE.MAIN
}

export const clearPendingOrder = () => {
  try {
    sessionStorage.removeItem(PENDING_ORDER_KEY)
  } catch {
    // Nothing to clear.
  }
}

/* ------------------------------------------------------------------ */
/* History                                                            */
/* ------------------------------------------------------------------ */

/** Main-product payments of the signed-in user. */
export const getPaymentHistory = async (email = getEmail()) => {
  if (!email) return []
  return toList(await api.post(PAYMENT_ENDPOINTS.HISTORY, { email }))
}

/**
 * One company's premium features - what it holds, not a list of payments:
 *
 *   {
 *     "E-Invoice": { used: 0, total: 100 },   one entry per counted feature
 *     "GSTR 1":    { used: 20, total: 100 },  the company actually has
 *     features: ["quotation", "challan", ...] the other features it holds
 *     receipt_file: "https://.../receipt.pdf" optional
 *   }
 *
 * Handed back as it came: a feature the company has not paid for is simply
 * not in it, and the screen shows only what is there.
 */
export const getPremiumHistory = async (companyName) => {
  if (!companyName) return null
  return toRecord(await api.post(PAYMENT_ENDPOINTS.PREMIUM_HISTORY, { company_name: companyName }))
}

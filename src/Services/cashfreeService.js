/**
 * Opening the Cashfree checkout for an order the backend has created.
 *
 *   await openCashfreeCheckout(response.payment_session_id)
 *
 * The page leaves for Cashfree and comes back to the backend's `return_url`
 * (/paymentsuccess/?order_id=...), so a successful call never really
 * "returns".
 *
 * ------------------------------------------------------------------
 * THE SDK
 * ------------------------------------------------------------------
 * Cashfree's v2 UI SDK, one script per environment. Which one is loaded is
 * ENV.CASHFREE_SDK_URL - sandbox or production, from REACT_APP_CASHFREE_ENV
 * in .env (see Config/env.js). It is added to the page on the first payment
 * only, and only ever that one script.
 *
 * The v2 SDK is a CLASS and must be called with `new`:
 *
 *   new Cashfree(paymentSessionId).redirect()
 *
 * The constructor keeps the session id; redirect() sends the browser to
 * Cashfree's checkout for the environment the script was built for.
 * Calling it without `new` - Cashfree({ ... }), the v3 SDK's style - is
 * what throws "Cannot call a class as a function".
 */

import { ENV } from '@/Config/env'

let sdkPromise = null

/** Adds the configured SDK <script> once and resolves with window.Cashfree. */
const loadSdk = () => {
  if (window.Cashfree) return Promise.resolve(window.Cashfree)

  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = ENV.CASHFREE_SDK_URL
      script.async = true
      script.onload = () =>
        window.Cashfree ? resolve(window.Cashfree) : reject(new Error('Cashfree did not load.'))
      script.onerror = () => {
        script.remove()
        // Let the next click try again rather than failing for good.
        sdkPromise = null
        reject(new Error('Could not reach Cashfree. Please check your connection and try again.'))
      }
      document.head.appendChild(script)
    })
  }

  return sdkPromise
}

export const openCashfreeCheckout = async (paymentSessionId) => {
  if (!paymentSessionId) {
    throw new Error('The payment could not be started: no payment session was returned.')
  }

  const Cashfree = await loadSdk()
  return new Cashfree(paymentSessionId).redirect()
}

/**
 * The one way a payment starts, for packages and premium features alike:
 *
 *   await startCheckout(payload)
 *
 *   1. POST payment/paymentDetail/        -> order_id, payment_session_id
 *   2. remember what the order is for     (payload.product_type)
 *   3. `beforeRedirect`, if given          (the package flow marks its offer
 *                                           used here - PUT payment/checkOffer/)
 *   4. open Cashfree                       -> the user leaves the app
 *
 * A failure at any step stops there: Cashfree is not opened.
 *
 * Cashfree sends them back to ROUTES.PAYMENT_STATUS with ?order_id=, where
 * the remembered product_type picks the confirmation endpoint.
 */

import { openCashfreeCheckout } from '@/Services/cashfreeService'
import { createPaymentOrder, rememberPendingOrder } from '@/Services/paymentService'

export async function startCheckout(payload, { beforeRedirect } = {}) {
  const response = await createPaymentOrder(payload)
  const body = response?.payment_session_id ? response : response?.data ?? response

  rememberPendingOrder({ orderId: body?.order_id ?? null, productType: payload.product_type })
  if (beforeRedirect) await beforeRedirect(body)
  await openCashfreeCheckout(body?.payment_session_id)
}

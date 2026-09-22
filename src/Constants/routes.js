/**
 * Every URL of the app, written down in ONE place.
 *
 * Why bother with this file?
 *   - If a URL ever changes ("/register" -> "/signup") you edit it here only,
 *     and every <Link>, <Route> and navigate() in the project follows along.
 *   - Your editor autocompletes ROUTES. so typos like "/reigster" cannot happen.
 *
 * Rule for the rest of the project: never type a path as a raw string,
 * always import ROUTES and use ROUTES.SOMETHING.
 */

export const ROUTES = {
  // The bare domain, e.g. http://localhost:5173/
  // It does not show a page of its own - it forwards to LOGIN (see AppRoutes).
  ROOT: '/',

  // ---- Auth pages (public - no token needed to see them) ----
  LOGIN: '/login',
  REGISTER: '/register',

  // The same page, reached through somebody's referral link. The uuid on
  // the end says who invited them - see buildReferralLink in
  // Store/Slices/referralSlice.js.
  REGISTER_WITH_REFERRAL: '/register/:referralBy',
  FORGOT_PASSWORD: '/forgot-password',

  // ---- After a successful login (these sit inside the app shell:
  //      header + sidebar + footer) ----

  // The Modules & Features grid - the landing page of the app, and the
  // parent of every module page below it.
  DASHBOARD: '/dashboard',

  // ---- The dashboard modules ----
  // Bank Details is built; the other three show the Coming Soon page. All
  // four are listed in Constants/dashboardModules.js, which is what draws
  // both the cards on the grid and the sidebar inside a module.
  BANK_DETAILS: '/dashboard/bank-details',
  COMPANY_DETAILS: '/dashboard/company-details',
  LEDGER_DETAILS: '/dashboard/ledger-details',
  INVENTORY_DETAILS: '/dashboard/inventory-details',

  // ---- The product modules ----
  // The base every product module lives under: /modules/bank-statement,
  // /modules/gst-compare, ... Each module's full path is built from its key
  // in Constants/dashboardModules (PRODUCT_MODULES), so there is no
  // per-module line here to keep in step with that list.
  PRODUCT_MODULES: '/modules',

  // ---- Account pages in the sidebar ----
  PAYMENT: '/payment',

  // Where Cashfree sends the user back after a checkout, with
  // ?order_id=... on the end. PAYMENT_SUCCESS is the backend's `return_url`
  // (/paymentsuccess/?order_id=...); PAYMENT_STATUS is the same page, used
  // by the app's own links. Both confirm the order.
  PAYMENT_SUCCESS: '/paymentsuccess',
  PAYMENT_STATUS: '/payment/status',

  // Premium feature recharge (E-Invoice, E-Way Bill ...), reached from the
  // Premium Features card on the Dashboard. Separate from the package payment.
  PREMIUM_PAYMENT: '/payment/premium-feature',

  CREATE_SUB_USER: '/sub-users/create',

  // Opened from the profile icon in the header.
  PROFILE: '/profile',

  // Reached from the "Report an Issue" link in the footer.
  ISSUE: '/issue',
}

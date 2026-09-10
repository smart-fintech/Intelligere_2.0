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
  DASHBOARD: '/dashboard',

  // Opened from the profile icon in the header.
  PROFILE: '/profile',

  // Reached from the "Report an Issue" link in the footer.
  ISSUE: '/issue',
}

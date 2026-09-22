/**
 * Every environment value the app needs, read in ONE place.
 *
 * Nothing else in the project should touch `import.meta.env` directly.
 * That way, if a variable is renamed you only change this file.
 *
 * Note for anyone coming from the old Create React App code:
 * `process.env.REACT_APP_X` is now `import.meta.env.VITE_X`.
 */

// Makes sure the base URL always ends with exactly one "/",
// so joining it with an endpoint path can never produce "//" or "apixyz".
const withTrailingSlash = (url) => (url.endsWith('/') ? url : `${url}/`)

// Makes a path safe to glue onto a base URL that already ends in "/":
// no leading slash (that would give "//"), exactly one trailing slash
// (the user's uuid is added after it).
const asPath = (path) => {
  const trimmed = String(path || '').replace(/^\/+/, '')
  return trimmed ? withTrailingSlash(trimmed) : ''
}

// Reads a number from the env file, falling back if it is missing or invalid.
const readNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const rawBaseUrl = import.meta.env.VITE_API_END_POINT
const rawWsUrl = import.meta.env.VITE_API_WEBSOCKET_URL
const rawWsPath = import.meta.env.VITE_API_WEBSOCKET_PATH

// Fail loudly during development instead of sending requests to "undefined/...".
if (!rawBaseUrl && import.meta.env.DEV) {
  console.error(
    '[env] VITE_API_END_POINT is not set. Copy .env.example to .env and fill it in.',
  )
}

if (!rawWsUrl && import.meta.env.DEV) {
  console.error('[env] VITE_API_WEBSOCKET_URL is not set.')
}

// Cashfree's v2 checkout SDK - one script per environment. See CASHFREE_ENV below.
const CASHFREE_SDK_URLS = {
  sandbox: 'https://sdk.cashfree.com/js/ui/2.0.0/cashfree.sandbox.js',
  production: 'https://sdk.cashfree.com/js/ui/2.0.0/cashfree.prod.js',
}

const cashfreeEnv =
  String(import.meta.env.REACT_APP_CASHFREE_ENV || '').trim().toLowerCase() === 'production'
    ? 'production'
    : 'sandbox'

export const ENV = {
  // Base URL every API request is built on top of.
  API_BASE_URL: withTrailingSlash(rawBaseUrl || '/'),

  // WebSocket Base URL: ws://127.0.0.1:8000/ or wss://...
  WS_BASE_URL: withTrailingSlash(rawWsUrl || ''),

  // What comes after the base URL, before the user's uuid. Kept in the .env
  // file so switching consumer never means editing a .js file:
  //   WS_BASE_URL + WS_PATH + uuid + "/"
  WS_PATH: asPath(rawWsPath || 'ws/allinoneconsumer-socket-server/'),

  // How many times socketService retries a refused/dropped connection before
  // it stops (default 3). The socket is only opened when a screen really
  // needs it, so these are the only attempts a switched-off backend ever
  // sees - keeping the number small is what keeps the console readable.
  WS_MAX_RETRIES: readNumber(import.meta.env.VITE_API_WEBSOCKET_RETRIES, 3),

  // Browser-console debug lines for the WebSockets and the company list
  // ("[Header Tally WS] ...", "[Footer Tally WS] ...", "[Company List] ...").
  // Off unless VITE_DEBUG_LOGS=true, so the console stays clean by default.
  DEBUG_LOGS: String(import.meta.env.VITE_DEBUG_LOGS ?? 'false').trim().toLowerCase() === 'true',

  // Key used to scramble what we keep in localStorage.
  STORAGE_SECRET: import.meta.env.VITE_STORAGE_SECRET || 'intelligere-dev-key',

  // Request timeout in milliseconds (default 5 minutes).
  API_TIMEOUT: readNumber(import.meta.env.VITE_API_TIMEOUT, 1000 * 60 * 5),

  // Auto-logout after this long with no user activity (default 1 day).
  IDLE_LOGOUT_MS:
    readNumber(import.meta.env.VITE_IDLE_LOGOUT_MINUTES, 1440) * 60 * 1000,

  /* ---- Looking a company up by its GST number ----
     Used by Services/gstService.

     Alankit's server sends no CORS headers, so the browser cannot call it
     directly. In development this points at /gst-api, which the Vite dev
     server forwards on (see the proxy in vite.config.js); in production it
     must point at our own backend, which does the same job.

     The subscription key is deliberately NOT here. It lives in the
     un-prefixed GST_SUBSCRIPTION_KEY, which only the dev proxy reads, so
     it never reaches the bundle. VITE_GST_SUBSCRIPTION_KEY is still read
     below for anyone who really does want to call Alankit straight from
     the browser - but it would be readable by every visitor, so don't. */
  GST_LOOKUP_URL:
    import.meta.env.VITE_GST_LOOKUP_URL || '/gst-api/commonapi/v1.1/search',

  // 'get' for the GSP endpoint (gstin and action as query parameters),
  // 'post' for our own backend (a { gstin } body). See gstService.
  GST_LOOKUP_METHOD:
    String(import.meta.env.VITE_GST_LOOKUP_METHOD || 'get').toLowerCase() === 'post'
      ? 'post'
      : 'get',

  GST_SUBSCRIPTION_KEY: import.meta.env.VITE_GST_SUBSCRIPTION_KEY || '',

  /* ---- Cashfree checkout ----
     REACT_APP_CASHFREE_ENV in .env picks the environment:

       REACT_APP_CASHFREE_ENV=sandbox       testing (also the default)
       REACT_APP_CASHFREE_ENV=production    live

     Cashfree's v2 SDK has one script per environment - the script itself
     decides where checkout goes - so the environment is simply which URL
     below is loaded (by Services/cashfreeService, only when a payment
     starts). Only an explicit "production" goes live; anything else,
     including a missing value, stays on sandbox. The backend's Cashfree keys
     must be for the same environment. */
  CASHFREE_ENV: cashfreeEnv,
  CASHFREE_SDK_URL: CASHFREE_SDK_URLS[cashfreeEnv],

  // True while running `npm run dev`.
  IS_DEV: import.meta.env.DEV,
}

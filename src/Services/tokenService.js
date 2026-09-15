/**
 * Centralised token management.
 *
 * Everything about the login session lives here: reading and writing the
 * tokens, the inactivity timer, and clearing the session on logout.
 *
 * ------------------------------------------------------------------
 * THERE IS NO TOKEN REFRESH
 * ------------------------------------------------------------------
 * The backend's `useraccount/token/refresh/` endpoint is not used by this
 * project, so nothing here renews an access token and there is no background
 * timer counting down to one. A token that the server rejects means the
 * session is over: authService clears it and sends the user to the login
 * page (see the 401 handling there).
 *
 * The REFRESH TOKEN itself is still saved at sign-in - `useraccount/logout/`
 * needs it to end the session on the server. See logout() at the bottom.
 *
 * Nothing here imports the shared axios instance. logout() uses a bare axios
 * call on purpose: the shared instance would react to a 401 by clearing the
 * session mid-logout, which is the very thing logout is doing anyway.
 */

import axios from 'axios'

import { ENV } from '@/Config/env'
import { ROUTES } from '@/Constants/routes'
import {
  STORAGE_KEYS,
  clearAll,
  getItem,
  isAdmin,
  setItem,
} from '@/Library/secureStorage'

/* ------------------------------------------------------------------ */
/* Reading and writing tokens                                         */
/* ------------------------------------------------------------------ */

export const getAccessToken = () => getItem(STORAGE_KEYS.ACCESS_TOKEN)
export const getRefreshToken = () => getItem(STORAGE_KEYS.REFRESH_TOKEN)

/** True when there is a token on hand, i.e. the user looks logged in. */
export const isLoggedIn = () => Boolean(getAccessToken())

/**
 * Saves the tokens returned by a sign-in.
 * `refresh` is optional - it is kept only so logout() can end the session on
 * the server; nothing in this project trades it for a new access token.
 */
export const setTokens = ({ access, refresh }) => {
  if (access) setItem(STORAGE_KEYS.ACCESS_TOKEN, access)
  if (refresh) setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh)

  // Let anything that cares (see onTokensChanged below) know.
  notifyTokenListeners(access)
}

/* ------------------------------------------------------------------ */
/* Saving a whole sign-in response                                    */
/* ------------------------------------------------------------------ */

/**
 * The fields a sign-in response may carry, and the storage key each one
 * goes to. Everything the backend sends is optional - only what arrives
 * gets written.
 *
 * Only fields something actually READS are kept. The response also carries
 * role, is_salesman, tm_user_type and free_trial_date; no screen uses them
 * (the free-trial date shown on Profile comes from the profile API), so they
 * are not written to the browser.
 *
 * TO SUPPORT A NEW FIELD: add one line here (and its key in
 * Library/secureStorage.js) - once there is code that reads it.
 */
const SESSION_FIELDS = {
  email: STORAGE_KEYS.EMAIL,
  tally_category: STORAGE_KEYS.TALLY_CATEGORY,
  erp: STORAGE_KEYS.ERP,
  uuid: STORAGE_KEYS.UUID,
}

/**
 * Stores a sign-in: the tokens plus whatever user details came with them.
 *
 * This is called automatically for EVERY response (see authService), so no
 * page ever has to save a token itself. A response with no access token in
 * it is not a sign-in, so it is left alone and false is returned.
 */
export const saveSession = (data) => {
  if (!data || typeof data !== 'object') return false

  // The backend nests the pair under `tokens`; older builds returned them
  // flat, so both shapes are accepted.
  const access = data.tokens?.access ?? data.access
  const refresh = data.tokens?.refresh ?? data.refresh

  // No token means this was an ordinary response, not a sign-in.
  if (!access) return false

  setTokens({ access, refresh })

  Object.entries(SESSION_FIELDS).forEach(([field, key]) => {
    // Compared against null/undefined rather than truthiness, because
    // `false` and 0 are real answers that must still be saved.
    const value = data[field]
    if (value !== undefined && value !== null) setItem(key, value)
  })

  return true
}

/* ------------------------------------------------------------------ */
/* Letting other code react to a new token                            */
/* ------------------------------------------------------------------ */

// The old project mirrored every new token into Firebase. Rather than tying
// this file to Firebase, anything that needs to know can subscribe here.
//
// Example (in your app start-up file, once Firebase is installed):
//   onTokensChanged((token) => writeTokenToFirebase(token))
const tokenListeners = new Set()

/** Subscribe to token changes. Returns a function that unsubscribes. */
export const onTokensChanged = (listener) => {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

const notifyTokenListeners = (accessToken) => {
  tokenListeners.forEach((listener) => {
    // One broken listener must not stop the others or break the request.
    try {
      listener(accessToken)
    } catch (error) {
      console.error('[tokenService] a token listener failed', error)
    }
  })
}

/* ------------------------------------------------------------------ */
/* Reading the expiry out of a JWT                                    */
/*                                                                    */
/* Both readers below are pure and have no caller today - the timer   */
/* that used them went with the refresh endpoint. They are kept       */
/* because they answer a question a session guard may well ask later, */
/* and they depend on nothing.                                        */
/* ------------------------------------------------------------------ */

/**
 * Pulls the payload out of a JWT without any library.
 * A JWT is three base64 chunks separated by dots; the middle one is the data.
 * Returns null if the token is missing or malformed.
 */
export const decodeToken = (token) => {
  if (!token) return null

  try {
    const payload = token.split('.')[1]
    // JWT uses a URL-safe base64 variant, so swap those two characters back.
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalised))
  } catch {
    return null
  }
}

/** When the current token expires, in milliseconds. Null if unknown. */
export const getTokenExpiry = (token = getAccessToken()) => {
  const payload = decodeToken(token)
  // `exp` is in seconds; JavaScript works in milliseconds.
  return payload?.exp ? payload.exp * 1000 : null
}

/* ------------------------------------------------------------------ */
/* Inactivity timer                                                   */
/* ------------------------------------------------------------------ */

let idleTimer = null
let idleCleanup = null

const IDLE_EVENTS = ['click', 'scroll', 'keydown', 'mousemove', 'mouseup', 'touchstart']

/**
 * Logs the user out after a stretch with no activity.
 *
 * The old version replaced window.onclick / window.onscroll and so on, which
 * silently wiped out any other handler on those events. This uses
 * addEventListener and hands back a cleanup function.
 */
export const startInactivityWatch = () => {
  // Never install two watchers at once.
  stopInactivityWatch()

  const resetTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      console.info('[tokenService] logging out after inactivity')
      forceLogout()
    }, ENV.IDLE_LOGOUT_MS)
  }

  // `passive` tells the browser we will not block scrolling, which keeps
  // mousemove/scroll from slowing the page down.
  IDLE_EVENTS.forEach((eventName) =>
    window.addEventListener(eventName, resetTimer, { passive: true }),
  )

  resetTimer()

  idleCleanup = () => {
    clearTimeout(idleTimer)
    IDLE_EVENTS.forEach((eventName) =>
      window.removeEventListener(eventName, resetTimer),
    )
  }

  return idleCleanup
}

/** Stops the inactivity watcher. */
export const stopInactivityWatch = () => {
  if (idleCleanup) {
    idleCleanup()
    idleCleanup = null
  }
}

/* ------------------------------------------------------------------ */
/* Ending the session                                                 */
/* ------------------------------------------------------------------ */

/**
 * Wipes the session and sends the user to the login page.
 *
 * This does NOT call the logout API - it is the "something went wrong,
 * get out now" path, used when the server rejects the token or the user
 * goes idle. For a normal logout button use `logout()` below, which tells
 * the server first and then calls this.
 */
export const forceLogout = () => {
  // Read this BEFORE clearing storage, or we lose which page to land on.
  const adminUser = isAdmin()

  stopInactivityWatch()
  clearAll()
  notifyTokenListeners(null)

  // Both of these are real routes now - see Routes/AppRoutes.jsx.
  const loginPath = adminUser ? '/adminlogin' : ROUTES.LOGIN

  // Only redirect if we are not already sitting on the login page,
  // otherwise a failed request there puts the page in a reload loop.
  if (window.location.pathname !== loginPath) {
    window.location.href = loginPath
  }
}

/* ------------------------------------------------------------------ */
/* The logout button                                                  */
/* ------------------------------------------------------------------ */

/**
 * Signs the user out properly: tells the server, then clears everything.
 *
 * This lives here rather than in authService because signing out is not
 * really an API call - it is the end of the session, and the session is
 * what this file manages. authService holds the api setup and nothing else.
 *
 * Bare axios again, for the reason at the top of this file: a 401 from the
 * shared instance would clear the session and redirect on its own, in the
 * middle of the request that is meant to end it.
 *
 * Storage is cleared even when the server call fails - the user asked to
 * leave, so they leave either way.
 */
export const logout = async () => {
  const refresh = getRefreshToken()
  const access = getAccessToken()

  try {
    if (refresh) {
      await axios.post(
        `${ENV.API_BASE_URL}useraccount/logout/`,
        { refresh },
        {
          timeout: ENV.API_TIMEOUT,
          headers: access ? { Authorization: `Bearer ${access}` } : {},
        },
      )
    }
  } catch (error) {
    console.error('[tokenService] logout request failed', error)
  } finally {
    // Clears localStorage, stops both timers, and redirects to login.
    forceLogout()
  }
}

/**
 * THE API SETUP FOR THE WHOLE PROJECT.
 *
 * This file holds one axios instance and the five methods every screen uses.
 * There are no per-screen functions here (no login, no register, no logout)
 * and no endpoint list - a screen writes the URL it wants, right where it
 * calls it:
 *
 *   import { api } from '@/Services/authService'
 *
 *   const data = await api.post('useraccount/login/', { email, password })
 *   const data = await api.post('useraccount/profile/', { identifier })
 *   const data = await api.get('useraccount/profile/')
 *   const data = await api.put('useraccount/profile/', { name })
 *   const data = await api.delete('company/' + id + '/')
 *
 * URLs are written WITHOUT a leading slash - the base URL below already ends
 * in one.
 *
 * Done for you here, so no screen ever repeats it:
 *
 *   1. the base URL, from VITE_API_END_POINT
 *   2. the Authorization header on every call
 *   3. the activecompanyid header for Gold Tally / repository users
 *   4. a sign-in: any response carrying tokens is written to localStorage
 *      automatically, so a login screen calls api.post and is finished
 *   5. a rejected token: the session is cleared and the user sent to login
 *   6. a failure: thrown as a plain Error whose `message` is the text the
 *      backend sent - so a screen only ever needs `error.message`
 *
 * Nothing is displayed from this file. The screen that made the call decides
 * what to show, success and failure alike:
 *
 *   try {
 *     const data = await api.post('useraccount/login/', form)
 *     toast.success(data?.msg || 'Logged in.')
 *   } catch (error) {
 *     toast.error(error.message)
 *   }
 *
 * Every method takes an optional last argument of axios options:
 *   { params: { page: 2 } }   adds a query string
 *   { headers: { ... } }      adds headers for that one call
 *   { skipAuth: true }        sends the call without a token
 */

import axios from 'axios'

import { ENV } from '@/Config/env'
import { getActiveCompanyId, getERP, getTC } from '@/Library/secureStorage'
import {
  forceLogout,
  getAccessToken,
  saveSession,
} from '@/Services/tokenService'

/* ------------------------------------------------------------------ */
/* The instance                                                       */
/* ------------------------------------------------------------------ */

export const apiSetup = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
})

/* ------------------------------------------------------------------ */
/* Before every request                                               */
/* ------------------------------------------------------------------ */

apiSetup.interceptors.request.use((config) => {
  // The token is attached whenever there is one. On a public call (login,
  // register) the user is signed out, so there is nothing to attach and the
  // request goes out bare - the screen does not have to say so.
  // `{ skipAuth: true }` forces it off, for the rare call that must never
  // carry a token.
  if (!config.skipAuth) {
    const token = getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      // Noted so the response side knows this call was authenticated, and
      // that a 401 coming back from it is about the session, not about the
      // credentials someone just typed.
      config._sentWithAuth = true
    }
  }

  // Gold Tally and repository users work inside one company at a time,
  // and the backend needs to know which one.
  if (getTC() === 'g' || getERP() === 'repository') {
    config.headers.activecompanyid = getActiveCompanyId() || 0
  }

  return config
})

/* ------------------------------------------------------------------ */
/* Reading the error message the backend sent                         */
/* ------------------------------------------------------------------ */

/**
 * Returns ONLY the message text, nothing else.
 *
 * This backend answers with { msg: "email: This field is required." },
 * so `msg` is checked first. The other shapes are there in case a different
 * endpoint replies the way Django REST normally does.
 */
const getErrorMessage = (error) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (typeof data?.msg === 'string') return data.msg
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.message === 'string') return data.message

  // Field errors like { email: ["already taken"] } - show the first one.
  if (data && typeof data === 'object') {
    const first = Object.values(data)[0]
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0]
  }

  // No response at all means the request never reached the server.
  if (!error?.response) return 'Cannot reach the server. Please check your connection.'

  return 'Something went wrong. Please try again.'
}

/* ------------------------------------------------------------------ */
/* After every response                                               */
/* ------------------------------------------------------------------ */

apiSetup.interceptors.response.use(
  (response) => {
    // A response carrying tokens is a sign-in, whichever path produced it.
    // Saving it here is what lets a screen call the login endpoint and do
    // nothing else. Every other response is left untouched.
    saveSession(response.data)

    return response
  },

  async (error) => {
    const request = error.config

    // ---- The server rejected our token: the session is over ----
    // There is no refresh endpoint in this project (see tokenService), so a
    // token the backend will not accept cannot be renewed. The only honest
    // thing left is to clear the session and send the user to the login page.
    const tokenRejected =
      error?.response?.status === 401 ||
      error?.response?.data?.code === 'token_not_valid'

    // `_sentWithAuth` matters: a 401 from a login with the wrong password is
    // a wrong password, not an expired session. Clearing the session there
    // would bounce the browser back to the login page mid-typing.
    if (tokenRejected && request?._sentWithAuth) {
      // Wipes storage and redirects - see forceLogout in tokenService.
      forceLogout()

      return Promise.reject(new Error('Your session has expired.'))
    }

    // ---- Everything else ----
    // Nothing is shown from here. The message is simply handed back, and the
    // screen that made the call decides what to do with it in its `catch`.
    const failure = new Error(getErrorMessage(error))
    failure.status = error?.response?.status ?? null
    return Promise.reject(failure)
  },
)

/* ------------------------------------------------------------------ */
/* The five methods                                                   */
/* ------------------------------------------------------------------ */

// Each one hands back the response body directly, so a screen never writes
// `.then(res => res.data)` or reaches for `response.data` itself.
export const api = {
  get: (url, config) => apiSetup.get(url, config).then((r) => r.data),
  post: (url, body, config) => apiSetup.post(url, body, config).then((r) => r.data),
  put: (url, body, config) => apiSetup.put(url, body, config).then((r) => r.data),
  patch: (url, body, config) => apiSetup.patch(url, body, config).then((r) => r.data),
  delete: (url, config) => apiSetup.delete(url, config).then((r) => r.data),
}

/**
 * The small helpers every service shares - one copy each, rather than the
 * same few lines repeated in every file:
 *
 *   MULTIPART        the axios options of an upload. The shared instance
 *                    sends JSON by default, and with that header axios would
 *                    turn a FormData into a JSON body; naming multipart stops
 *                    that, and axios then leaves the header (with its
 *                    boundary) to the browser.
 *   toList(reply)    a list out of a bare array, `{ data: [...] }` or
 *                    `{ results: [...] }` - anything else is an empty list
 *                    rather than a crash in a `.map()`.
 *   text(value)      '' for nothing, otherwise trimmed text.
 *   sharedRequest    one request at a time per question (see below).
 *   fileUrlOf(value) a file the backend links to, as a URL the browser opens.
 */

import { ENV } from '@/Config/env'

export const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

export const toList = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.results)) return response.results
  return []
}

export const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/* ------------------------------------------------------------------ */
/* One request at a time per question                                 */
/* ------------------------------------------------------------------ */

const inFlight = new Map()

/**
 * Runs `request` - unless the very same request (same URL, same body) is
 * already on its way, in which case its answer is shared. React's Strict
 * Mode runs every effect twice as a screen mounts (in development), and
 * without this both runs asked the server. Only a request still pending is
 * shared: once it settles it is forgotten, so the next ask - another
 * company or document type, or a refresh after a change - goes to the
 * server as it should.
 */
export const sharedRequest = (url, body, request) => {
  const key = `${url}|${JSON.stringify(body)}`
  if (inFlight.has(key)) return inFlight.get(key)
  const pending = request().finally(() => inFlight.delete(key))
  inFlight.set(key, pending)
  return pending
}

/**
 * A file the backend links to, as a URL the browser can open: a full URL as
 * it is, a path read against the API's own origin. null for nothing ("",
 * null, "null") or for something that is not a link at all.
 */
export const fileUrlOf = (value) => {
  const raw = text(value)
  if (!raw || ['null', 'none', 'undefined'].includes(raw.toLowerCase())) return null
  try {
    return /^(https?:|data:|blob:)/i.test(raw)
      ? raw
      : new URL(raw.startsWith('/') ? raw : `/${raw}`, new URL(ENV.API_BASE_URL, window.location.href).origin).href
  } catch {
    return null
  }
}

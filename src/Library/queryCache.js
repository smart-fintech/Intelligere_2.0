/**
 * THE SHARED DATA CACHE - one copy of a server list for every screen that
 * shows it, fetched once and reused until it changes.
 *
 *   const products = useQuery({
 *     key: companyName ? [QUERY.PRODUCTS, companyName] : null,   // null: not now
 *     fetch: () => getProducts(companyName),
 *     staleTime: 5 * 60 * 1000,
 *   })
 *   products.status   'idle' | 'loading' | 'ready' | 'failed'
 *   products.data     the answer (undefined until the first one is in)
 *   products.error    the message of the last failure
 *   products.reload() asks again now, whatever the cache holds
 *
 * WHY NOT REDUX
 *   Ledgers, banks and countries live in Redux and stay there. A list as big
 *   as the products one does not belong in it: Redux Toolkit's development
 *   checks walk the whole state on every action, and Immer deep-freezes
 *   every answer put in. This keeps the answer exactly as it arrived.
 *
 * THE RULES
 *   - A key is an array; its first part names the resource (QUERY in
 *     Constants/queryKeys), the rest says whose - always the company, so one
 *     company's data can never be shown for another.
 *   - Asked while an answer is still fresh: no request. Asked while one is
 *     on its way: that same request is shared (also what keeps React Strict
 *     Mode's double effects from asking twice).
 *   - Asked after `staleTime`, or after invalidateQueries said the data
 *     changed: fetched again; the old answer is kept on screen meanwhile.
 *   - reload() always asks. A newer request wins: an older answer that
 *     arrives late is dropped.
 *   - A failure is never kept as an answer. The last good answer stays (a
 *     list on screen is not emptied by a failed refresh), the status says
 *     'failed', and the next screen to ask tries again.
 *   - Only a few entries per resource are kept (MAX_ENTRIES): a company
 *     visited long ago is dropped once nothing shows it, rather than
 *     keeping its products in memory for the whole session.
 *   - clearQueryCache() empties it - on logout.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'

/** Entries kept per resource; the least recently used one nothing shows goes first. */
const MAX_ENTRIES = 3

const entries = new Map()

const IDLE = Object.freeze({ status: 'idle', data: undefined, error: null })

const keyText = (key) => JSON.stringify(key)

const entryFor = (key) => {
  const text = keyText(key)
  let entry = entries.get(text)
  if (!entry) {
    entry = {
      key,
      resource: key[0],
      snapshot: { status: 'idle', data: undefined, error: null },
      hasData: false,
      updatedAt: 0,
      stale: false,
      request: 0,
      promise: null,
      fetch: null,
      listeners: new Set(),
    }
    entries.set(text, entry)
    evict(entry.resource)
  }
  // Map order is the use order: a touched entry moves to the back.
  entries.delete(text)
  entries.set(text, entry)
  return entry
}

/** Drops the oldest unwatched entries of a resource beyond MAX_ENTRIES. */
const evict = (resource) => {
  const own = [...entries.entries()].filter(([, entry]) => entry.resource === resource)
  let extra = own.length - MAX_ENTRIES
  for (const [text, entry] of own) {
    if (extra <= 0) break
    if (entry.listeners.size === 0 && !entry.promise) {
      entries.delete(text)
      extra -= 1
    }
  }
}

const publish = (entry, changes) => {
  entry.snapshot = { ...entry.snapshot, ...changes }
  entry.listeners.forEach((listener) => listener())
}

const isFresh = (entry, staleTime) =>
  entry.hasData && !entry.stale && entry.snapshot.status !== 'failed' && Date.now() - entry.updatedAt < staleTime

/**
 * The data for `key` - from the cache when it is fresh, from the request
 * already on its way, or from a new one. `force` always starts a new one.
 */
export const fetchQuery = (key, fetch, { force = false, staleTime = 0 } = {}) => {
  const entry = entryFor(key)
  entry.fetch = fetch
  if (!force && entry.promise) return entry.promise
  if (!force && isFresh(entry, staleTime)) return Promise.resolve(entry.snapshot.data)

  const request = ++entry.request
  publish(entry, { status: 'loading' })

  const promise = Promise.resolve()
    .then(fetch)
    .then(
      (data) => {
        if (entry.request === request) {
          entry.promise = null
          entry.hasData = true
          entry.updatedAt = Date.now()
          entry.stale = false
          publish(entry, { status: 'ready', data, error: null })
        }
        return data
      },
      (failure) => {
        if (entry.request === request) {
          entry.promise = null
          publish(entry, { status: 'failed', error: failure?.message || 'The request failed.' })
        }
        throw failure
      },
    )
  entry.promise = promise
  return promise
}

/**
 * "This data changed on the server." Every entry of `resource` (and, with
 * `whose`, only that company's) is marked stale: the next screen to ask
 * fetches it again. With `refetchActive`, entries on screen right now are
 * fetched again at once.
 */
export const invalidateQueries = (resource, { whose, refetchActive = false } = {}) => {
  // Over a copy: fetchQuery moves the entry it fetches to the back of
  // `entries` (the use order), and a forEach over the Map itself would
  // reach it again there - and again, for ever.
  ;[...entries.values()].forEach((entry) => {
    if (entry.resource !== resource) return
    if (whose !== undefined && keyText(entry.key.slice(1)) !== keyText([].concat(whose))) return
    entry.stale = true
    if (refetchActive && entry.listeners.size > 0 && entry.fetch) {
      fetchQuery(entry.key, entry.fetch, { force: true }).catch(() => {})
    }
  })
}

/** Empties the cache - on logout, so nothing of one session reaches the next. */
export const clearQueryCache = () => {
  entries.forEach((entry) => {
    entry.request += 1 // an answer still on its way lands nowhere
  })
  entries.clear()
}

/** A screen's view of one cached resource - see the top of this file. */
export function useQuery({ key, fetch, staleTime = 0, enabled = true }) {
  const active = enabled && Array.isArray(key)
  const text = active ? keyText(key) : null

  const subscribe = useCallback(
    (listener) => {
      if (!text) return () => {}
      const entry = entries.get(text) ?? entryFor(JSON.parse(text))
      entry.listeners.add(listener)
      return () => entry.listeners.delete(listener)
    },
    [text],
  )
  const read = () => (text ? (entries.get(text)?.snapshot ?? IDLE) : IDLE)
  const snapshot = useSyncExternalStore(subscribe, read, read)

  // Fetched when a screen first needs it (or its company changes) - never
  // because a screen re-rendered: the effect runs for a new key only.
  useEffect(() => {
    if (!text) return
    fetchQuery(JSON.parse(text), fetch, { staleTime }).catch(() => {})
    // `fetch` is a new function every render; the key decides when to ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, staleTime])

  const reload = useCallback(() => {
    if (!text) return Promise.resolve(undefined)
    return fetchQuery(JSON.parse(text), fetch, { force: true }).catch(() => undefined)
  }, [text, fetch])

  if (!active) return { ...IDLE, reload }
  // Nothing asked yet for this key (the first render, before the effect).
  const status = snapshot.status === 'idle' ? 'loading' : snapshot.status
  return { status, data: snapshot.data, error: snapshot.error, reload }
}

/**
 * A CODE LIST - a long list of codes, each with what it describes, fetched
 * once and kept for as long as the app is open.
 *
 * Two of them exist today and they differ only in where they come from and
 * what the reply calls its two columns:
 *
 *   HSN   GET inventory/product_hsn_list/  { hsn, product_name }   Products
 *   SAC   GET inventory/sac_list/          { sac, description }    Ledgers
 *
 * so the fetching, the caching, the index and the search are written here
 * once and both are made from it:
 *
 *   const sac = createCodeList({ url: 'inventory/sac_list/',
 *                               codeField: 'sac', nameField: 'description' })
 *
 *   sac.load()            the list - from memory once it is in; otherwise
 *                         the one request, shared by everyone who asks while
 *                         it is on its way. A failed request is forgotten, so
 *                         the next call (Retry) asks again.
 *   sac.cached()          the list if it is already in, else null
 *   sac.find(code)        one code's entry, or null - from an index built
 *                         once with the list, never per screen
 *   sac.search(list, text, limit)   the codes starting with what is typed
 *
 * Each list is one entry per CODE: a code the reply sends twice, with two
 * descriptions, keeps both (`names`) - nothing is dropped for repeating.
 * Codes are text throughout, so "01" stays "01".
 *
 * The lists are kept in this module's memory rather than in Redux: they are
 * reference data of tens of thousands of rows that no screen edits, and
 * nothing re-renders when they arrive except the field that asked.
 */

import { api } from '@/Services/authService'

const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

export const createCodeList = ({ url, codeField, nameField }) => {
  let list = null
  let byCode = new Map()
  let pending = null

  /** The reply as a Map of code -> { code, names }, in the reply's order. */
  const read = (rows) => {
    const map = new Map()

    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      const code = textOf(row?.[codeField])
      if (!code) return

      const name = textOf(row?.[nameField])
      const entry = map.get(code) ?? { code, names: [] }
      if (name && !entry.names.includes(name)) entry.names.push(name)
      map.set(code, entry)
    })

    return map
  }

  const cached = () => list

  const find = (code) => byCode.get(code) ?? null

  const load = () => {
    if (list) return Promise.resolve(list)

    if (!pending) {
      pending = api
        .get(url)
        .then((rows) => {
          byCode = read(rows)
          list = [...byCode.values()]
          return list
        })
        .finally(() => {
          pending = null
        })
    }

    return pending
  }

  /**
   * The codes that START with `text`, at most `limit` of them, in the list's
   * own order - "0101" finds 0101, 010121, 01012100, never 990101. No text:
   * the first `limit`.
   */
  const search = (source, text, limit = 50) => {
    // Codes are compared as they are (digits) - nothing is re-cased per record.
    const term = textOf(text)
    if (!term) return source.slice(0, limit)

    const found = []

    for (const entry of source) {
      if (entry.code.startsWith(term)) found.push(entry)
      if (found.length >= limit) break
    }

    return found
  }

  return { cached, find, load, search }
}

/**
 * KEYWORD MAPPING - "this name in the file is that ledger in Tally", one
 * mapping per source (accounting_entries/keyword_b2b/). Applied on screen, to
 * what is shown AND what is sent, as the old screen did - nothing is saved
 * back to the entries.
 *
 *   renamerOf(mapping)          name -> its ledger when a keyword IS the name
 *                               (trimmed, any case), else the name unchanged
 *   mapPartyName(name, mapping) name -> the ledger of the first keyword the
 *                               name CONTAINS (any case), or null
 *
 * Which names each view maps (the old rules):
 *   Multi Ledger    the party ledger (contains), and the ledger-line and GST
 *                   ledger names (is)
 *   Single Ledger   the GST ledger names (is)
 *   With Inventory  each product's GST ledger names (is)
 */

import { text } from '@/Modules/SalesEntries/shared/ledgerLists'

const normalize = (value) => text(value).toLowerCase()

export const NO_MAPPING = Object.freeze({})

/** Keyword -> ledger pairs with both halves filled in, in their saved order. */
export const mappingEntries = (mapping) =>
  Object.entries(mapping ?? {})
    .map(([keyword, ledger]) => [text(keyword), text(ledger)])
    .filter(([keyword, ledger]) => keyword && ledger)

export const renamerOf = (mapping) => {
  const byName = new Map(mappingEntries(mapping).map(([keyword, ledger]) => [normalize(keyword), ledger]))
  return byName.size === 0 ? (name) => name : (name) => byName.get(normalize(name)) ?? name
}

export const mapPartyName = (name, mapping) => {
  const value = normalize(name)
  if (!value) return null
  const found = mappingEntries(mapping).find(([keyword]) => value.includes(normalize(keyword)))
  return found ? found[1] : null
}

/** The mapping the API answered with: an object, or its JSON text. */
export const readMapping = (reply) => {
  let value = reply
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : NO_MAPPING
}

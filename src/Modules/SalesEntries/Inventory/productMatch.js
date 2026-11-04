/**
 * WHICH STOCK ITEM A PRODUCT LINE IS - Tally takes a product line only under
 * the name of a stock item it has. The old screen's rules, in its order:
 *
 *   one stock item with the line's HSN            -> that item          'hsn'
 *   several with the HSN: one named exactly so    -> that item          'exact'
 *                         else one whose name CONTAINS the line's name   'partial'
 *                         else none - pick one of them                   null
 *   none with the HSN:    one whose name CONTAINS the line's name        'partial'
 *                         else none - pick one, or create it             null
 *
 * The old screen renamed silently; here the result says how it matched, so
 * the screen shows it and the user can choose another (CHOSEN).
 *
 *   stock   [{ name, hsn }] - the company's products (useProducts)
 *   -> { name: string | null, how, candidates: the stock items with the line's HSN }
 */

import { text } from '@/Modules/SalesEntries/shared/ledgerLists'

export const MATCH = Object.freeze({
  HSN: 'hsn',
  EXACT: 'exact',
  PARTIAL: 'partial',
  CHOSEN: 'chosen',
})

export const MATCH_LABEL = Object.freeze({
  [MATCH.HSN]: 'Matched by HSN',
  [MATCH.EXACT]: 'Matched by name',
  [MATCH.PARTIAL]: 'Matched by part of the name',
  [MATCH.CHOSEN]: 'Chosen',
})

const lower = (value) => text(value).toLowerCase()

export const matchProduct = (product, stock) => {
  const name = lower(product.name)
  const byHsn = product.hsn ? stock.filter((item) => text(item.hsn) === product.hsn) : []
  // An empty name would be "contained" in every item.
  const partial = () => (name ? stock.find((item) => lower(item.name).includes(name)) : undefined)
  const found = (item, how) => ({ name: item.name, how, candidates: byHsn })

  if (byHsn.length === 1) return found(byHsn[0], MATCH.HSN)
  if (byHsn.length > 1) {
    const exact = byHsn.find((item) => lower(item.name) === name)
    if (exact) return found(exact, MATCH.EXACT)
  }
  const near = partial()
  return near ? found(near, MATCH.PARTIAL) : { name: null, how: null, candidates: byHsn }
}

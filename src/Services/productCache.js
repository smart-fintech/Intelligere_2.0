/**
 * "The products changed on the server" - for the shared cache.
 *
 * The product list (and the units drawn from it) is kept in the shared
 * cache (Library/queryCache) and reused across screens, so anything that
 * changes a product, its stock, or what the list derives from must say so:
 *
 *   createProduct(...)                      wrapped once, in the service:
 *   export const createProduct = (...) => changesProducts(api.post(...))
 *
 * A successful request marks every cached product list and unit list stale
 * - the next screen to show one asks again. A failed one changes nothing.
 * Screens that reload their own list after a save (reload()) still do, so
 * what is on screen is current at once; this covers the screens that are
 * not on screen at that moment.
 */

import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'

/**
 * `refetchActive`: also read again, at once, the lists a screen is showing
 * right now (one request per company's list, however many screens show it -
 * see invalidateQueries) - for a change that adds products wholesale, which
 * the screens already open must show without a reload.
 */
export const markProductsChanged = ({ refetchActive = false } = {}) => {
  invalidateQueries(QUERY.PRODUCTS, { refetchActive })
  invalidateQueries(QUERY.PRODUCT_UNITS, { refetchActive })
}

/** Passes `request`'s answer on unchanged, marking the products stale once it succeeded. */
export const changesProducts = (request) =>
  request.then((reply) => {
    markProductsChanged()
    return reply
  })

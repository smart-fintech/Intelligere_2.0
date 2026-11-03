/**
 * The Payable Receivable module's fixed names.
 *
 *   PAYABLE_RECEIVABLE_MODULE   its entry in `active_modules` - its key in
 *                               Constants/dashboardModules
 *   PR_SOURCE                   the two lists, as the API names them: `source`
 *                               when reading, `type` when changing an entry
 *   PR_VIEW_OPTIONS             the radio buttons at the top of the page, in
 *                               order. Ledger Export has no `source`: it has
 *                               its own screen (LedgerExport/).
 */

export const PAYABLE_RECEIVABLE_MODULE = 'Payable Receivable'

export const PR_SOURCE = Object.freeze({
  PAYABLE: 'payable',
  RECEIVABLE: 'receivable',
})

export const PR_VIEW = Object.freeze({
  ...PR_SOURCE,
  LEDGER_EXPORT: 'ledger_export',
})

export const PR_VIEW_OPTIONS = Object.freeze([
  { value: PR_VIEW.PAYABLE, label: 'Payable' },
  { value: PR_VIEW.RECEIVABLE, label: 'Receivable' },
  { value: PR_VIEW.LEDGER_EXPORT, label: 'Ledger Export' },
])

/** The heading of each list. */
export const PR_SOURCE_TITLE = Object.freeze({
  [PR_SOURCE.PAYABLE]: 'A/c Payable',
  [PR_SOURCE.RECEIVABLE]: 'A/c Receivable',
})

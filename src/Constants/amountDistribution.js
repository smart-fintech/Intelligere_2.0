/**
 * The Amount Distribution module's fixed names.
 *
 *   AMOUNT_DISTRIBUTION_MODULE   its entry in `active_modules` - its key in
 *                                Constants/dashboardModules
 *   AD_SOURCE                    the two kinds, as the API names them (`source`)
 *   AD_SOURCE_OPTIONS            the radio buttons at the top of the page
 *   AD_MODE_OPTIONS,             the form's two dropdowns, sent as they read
 *   AD_VOUCHER_TYPE_OPTIONS
 */

export const AMOUNT_DISTRIBUTION_MODULE = 'Amount Distribution'

export const AD_SOURCE = Object.freeze({
  FIXED: 'fixed',
  VARIABLE: 'variable',
})

export const AD_SOURCE_OPTIONS = Object.freeze([
  { value: AD_SOURCE.FIXED, label: 'Fixed Entry' },
  { value: AD_SOURCE.VARIABLE, label: 'Variable Entry' },
])

export const AD_MODE_OPTIONS = Object.freeze([
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Weekly', label: 'Weekly' },
])

export const AD_VOUCHER_TYPE_OPTIONS = Object.freeze([
  { value: 'Payment', label: 'Payment' },
  { value: 'Receipt', label: 'Receipt' },
])

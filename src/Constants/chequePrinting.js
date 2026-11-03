/**
 * The Cheque Printing module's fixed names.
 *
 *   CHEQUE_PRINTING_MODULE   its entry in `active_modules` - its key in
 *                            Constants/dashboardModules
 *   CHEQUE_VIEW              the three views, and what the API calls the two
 *                            that are lists (`type`)
 *   CHEQUE_VIEW_OPTIONS      the radio buttons at the top of the page
 *   CHEQUE_ENTRY             one cheque typed in, or many from a CSV (`type`)
 *   CHEQUE_ENTRY_OPTIONS     the radio buttons above the form
 *   CHEQUE_PAGE_SIZE_HINT    the printer setting a cheque needs
 */

export const CHEQUE_PRINTING_MODULE = 'Cheque Printing'

export const CHEQUE_VIEW = Object.freeze({
  PRINT: 'print',
  VOUCHER: 'voucher',
  PAST: 'pastData',
})

export const CHEQUE_VIEW_OPTIONS = Object.freeze([
  { value: CHEQUE_VIEW.PRINT, label: 'Cheque Printing' },
  { value: CHEQUE_VIEW.VOUCHER, label: 'View Voucher' },
  { value: CHEQUE_VIEW.PAST, label: 'Past Data' },
])

export const CHEQUE_ENTRY = Object.freeze({
  FORM: 'form',
  CSV: 'csv',
})

export const CHEQUE_ENTRY_OPTIONS = Object.freeze([
  { value: CHEQUE_ENTRY.FORM, label: 'Single Cheque' },
  { value: CHEQUE_ENTRY.CSV, label: 'Multiple Cheques (CSV)' },
])

export const CHEQUE_PAGE_SIZE_HINT = 'Set the printer page size to 93.13 mm wide and 202.0 mm high.'

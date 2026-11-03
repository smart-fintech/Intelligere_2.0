/**
 * The Journal Voucher module's fixed names.
 *
 *   JOURNAL_VOUCHER_MODULE   its entry in `active_modules` - its key in
 *                            Constants/dashboardModules
 *   JV_VIEW                  the three views at the top of the page
 *   JV_VIEW_OPTIONS          their radio buttons
 *   JV_WORKSPACE             what the right of the Journal Entries view shows
 *   JV_VOUCHER_ENTRY         one voucher typed in, or many from the template's Excel
 *   JV_VOUCHER_ENTRY_OPTIONS their radio buttons
 *   JV_SIDE                  the two sides of a voucher, as the API writes them
 *   JV_BANK_SOURCE           the two lists of bank entries (`source`)
 *   JV_LEDGER_ENTRY          JV ledgers picked from the list, or from a CSV
 *   JV_LEDGER_ENTRY_OPTIONS  their radio buttons
 */

export const JOURNAL_VOUCHER_MODULE = 'Journal Voucher'

export const JV_VIEW = Object.freeze({
  ENTRIES: 'entries',
  DETECT: 'detect',
  HISTORY: 'history',
})

export const JV_VIEW_OPTIONS = Object.freeze([
  { value: JV_VIEW.ENTRIES, label: 'Journal Entries' },
  { value: JV_VIEW.DETECT, label: 'Detect Bank Entries' },
  { value: JV_VIEW.HISTORY, label: 'History' },
])

export const JV_WORKSPACE = Object.freeze({
  BANK_ENTRIES: 'bankEntries',
  TEMPLATE: 'template',
  LEDGERS: 'ledgers',
  VOUCHER: 'voucher',
})

export const JV_VOUCHER_ENTRY = Object.freeze({
  FORM: 'form',
  EXCEL: 'excel',
})

export const JV_VOUCHER_ENTRY_OPTIONS = Object.freeze([
  { value: JV_VOUCHER_ENTRY.FORM, label: 'Voucher' },
  { value: JV_VOUCHER_ENTRY.EXCEL, label: 'Upload Excel' },
])

export const JV_SIDE = Object.freeze({
  DR: 'Dr',
  CR: 'Cr',
})

export const JV_BANK_SOURCE = Object.freeze({
  SINGLE: 'single',
  MULTI: 'multi',
})

export const JV_LEDGER_ENTRY = Object.freeze({
  PICK: 'pick',
  CSV: 'csv',
})

export const JV_LEDGER_ENTRY_OPTIONS = Object.freeze([
  { value: JV_LEDGER_ENTRY.PICK, label: 'Add JV Ledgers' },
  { value: JV_LEDGER_ENTRY.CSV, label: 'Upload JV Ledgers' },
])

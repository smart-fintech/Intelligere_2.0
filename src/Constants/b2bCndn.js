/**
 * The B2B / CNDN module's fixed names.
 *
 *   B2B_CNDN_MODULE          its key in Constants/dashboardModules
 *   B2B_CNDN_SOURCE          the `source` every b2b_cndn_data/ and keyword_b2b/ call
 *                            carries - the view chosen at the top of the page
 *   B2B_CNDN_VIEW_OPTIONS    the two views, as the page's radio buttons
 *   B2B_MODULE_NAMES,        the names `active_modules` may give each half - the
 *   CNDN_MODULE_NAMES        backend's plans call them "B2B Entries" and
 *                            "Credit Note Debit Note" (tallyapp/models.py)
 *   B2B_GST_SLABS,           the GST rates the backend rounds each row to
 *   CNDN_GST_SLABS           (B2B_GST_RATES / CNDN_GST_RATES in accounting_entries)
 *   B2B_CNDN_PAGE_SIZE       rows per page of the list
 *   B2B_CNDN_UPLOAD_MAX_MB   the largest GSTR-2B workbook the upload takes
 */

export const B2B_CNDN_MODULE = 'B2B/CNDN'

export const B2B_CNDN_SOURCE = Object.freeze({ B2B: 'b2b', CNDN: 'cndn' })

export const B2B_CNDN_VIEW_OPTIONS = Object.freeze([
  { value: B2B_CNDN_SOURCE.B2B, label: 'B2B' },
  { value: B2B_CNDN_SOURCE.CNDN, label: 'Credit Note Debit Note' },
])

export const B2B_MODULE_NAMES = Object.freeze(['B2B Entries', 'B2B'])
export const CNDN_MODULE_NAMES = Object.freeze(['Credit Note Debit Note', 'CNDN'])

export const B2B_GST_SLABS = Object.freeze([0, 3, 5, 12, 18, 28, 40])
export const CNDN_GST_SLABS = Object.freeze([0, 5, 12, 18, 28])

export const B2B_CNDN_PAGE_SIZE = 10

export const B2B_CNDN_UPLOAD_MAX_MB = 10

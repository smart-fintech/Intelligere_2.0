/**
 * JOURNAL VOUCHER - every URL of the module. Each one is POST to list, and
 * takes `company_id` in every body: the Owner and the sub users of a company
 * share one set of ledgers, templates, vouchers and bank entries.
 *
 *   journal_vouchers/jv-ledgers/
 *     POST   { company_id }                      -> [{ id, ledeger_name }]
 *     POST   multipart { company_id, file }      column "Ledger Name" -> those become JV ledgers
 *     PUT    { company_id, data: [{ id, jv }] }  marks or unmarks ledgers
 *
 *   journal_vouchers/jv-templates/
 *     POST   { company_id }                      -> { name: { dr: [ledger], cr: [ledger], party_name? } }
 *     POST   { company_id, templates }           adds them; a name already used is refused (400)
 *     PUT    { company_id, templates }           adds or replaces them
 *     DELETE { company_id, template_names }
 *
 *   journal_vouchers/jv-templates-export/   { company_id, template_name } -> the Excel's URL
 *   journal_vouchers/jv-vouchers-upload/    multipart { company_id, template_name, file }
 *          -> [{ sr_no, date, narration, entries: [{ type, ledger, amount, date }] }] - nothing saved
 *
 *   journal_vouchers/jv-vouchers/
 *     POST   { company_id }                      -> { template_name: [voucher] }, deleted ones left out
 *     POST   { company_id, vouchers: [voucher] } saves them
 *     DELETE { company_id, template_name, id }   a soft delete
 *   journal_vouchers/jv-vouchers-export/    { company_id, template_name? } -> the Excel's URL
 *
 *   journal_vouchers/jv-bank-entries/
 *     POST   { company_id }  -> { single: { template_name: [entry] }, multi: [row] }
 *     PUT    { company_id, source, assign: [{ sr_no, template }] }  moves rows to the other list
 *     DELETE { company_id, source, sr_no: [n] }
 *
 * A save or a delete answers only { msg } - the list is read again for the
 * rows. Nothing here shows a message: a failure is an Error carrying the
 * backend's own text (Services/authService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGE TO TALLY (a Tally user's Send to Tally, and Resend)
 * ------------------------------------------------------------------
 * Sent on the app's shared socket, in the envelope every Tally message uses:
 *
 *   { "payload": { "module_name": "journal_vouchers",
 *                  "company_name": "<active company>",
 *                  "data": [ { gst_number, state, voucher_type: "Journal", template_name,
 *                              voucher_date: "YYYY-MM-DD", narration,
 *                              dr: [{ ledger_name, amount }], cr: [...] } ] } }
 *
 * one row per voucher (toTallyJournalRow, Modules/JournalVoucher), and
 * answered as `return_module_name` with a stop_loader - see useJvTallySend.
 */

import { JOURNAL_VOUCHER_MODULE } from '@/Constants/journalVoucher'
import { hasActiveModule } from '@/Services/accessService'
import { api } from '@/Services/authService'

const LEDGERS_URL = 'journal_vouchers/jv-ledgers/'
const TEMPLATES_URL = 'journal_vouchers/jv-templates/'
const TEMPLATE_EXPORT_URL = 'journal_vouchers/jv-templates-export/'
const VOUCHERS_URL = 'journal_vouchers/jv-vouchers/'
const VOUCHER_EXPORT_URL = 'journal_vouchers/jv-vouchers-export/'
const VOUCHER_UPLOAD_URL = 'journal_vouchers/jv-vouchers-upload/'
const BANK_ENTRIES_URL = 'journal_vouchers/jv-bank-entries/'

// Named so axios sends the FormData as it is - see Services/bankService.
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

/** The name this Tally operation goes by, in both directions (old project: journalVouchers). */
export const TALLY_JV_MODULE = 'journal_vouchers'

/** The vouchers, ready to send to Tally - `rows` as toTallyJournalRow makes them. */
export const buildJvTallyMessage = (companyName, rows) => ({
  payload: {
    module_name: TALLY_JV_MODULE,
    company_name: companyName,
    data: rows,
  },
})

/** The CSV to fill in with JV ledger names - see LEDGER_CSV_FORMAT_FILE on why it is `?raw`. */
export const JV_LEDGER_CSV_FORMAT_FILE = 'JV_Ledger_Format.csv'
export { default as JV_LEDGER_CSV_FORMAT_CONTENT } from '@/Assets/format/JV_Ledger_Format.csv?raw'

/** Whether the company's `active_modules` lists the module (Services/accessService). */
export const hasJournalVoucherModule = (company) => hasActiveModule(company, JOURNAL_VOUCHER_MODULE)

/* ---- JV ledgers ---- */

export const getJvLedgers = (companyId) => api.post(LEDGERS_URL, { company_id: companyId })

/** `changes` is [{ id, jv }]: true makes a ledger a JV ledger, false takes it off. */
export const setJvLedgers = (companyId, changes) => api.put(LEDGERS_URL, { company_id: companyId, data: changes })

export const uploadJvLedgers = (companyId, file) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('file', file)
  return api.post(LEDGERS_URL, body, MULTIPART)
}

/* ---- Templates ---- */

export const getJvTemplates = (companyId) => api.post(TEMPLATES_URL, { company_id: companyId })

/** `templates` is { name: { dr, cr, party_name? } }. */
export const addJvTemplates = (companyId, templates) => api.post(TEMPLATES_URL, { company_id: companyId, templates })

export const updateJvTemplates = (companyId, templates) => api.put(TEMPLATES_URL, { company_id: companyId, templates })

export const deleteJvTemplates = (companyId, names) =>
  api.delete(TEMPLATES_URL, { data: { company_id: companyId, template_names: names } })

/** The URL of the template's blank Excel. */
export const exportJvTemplate = (companyId, templateName) =>
  api.post(TEMPLATE_EXPORT_URL, { company_id: companyId, template_name: templateName })

/** The filled Excel read back as vouchers, for a look before they are saved. */
export const readJvVoucherExcel = (companyId, templateName, file) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('template_name', templateName)
  body.append('file', file)
  return api.post(VOUCHER_UPLOAD_URL, body, MULTIPART)
}

/* ---- Vouchers ---- */

export const getJvVouchers = (companyId) => api.post(VOUCHERS_URL, { company_id: companyId })

/** Each voucher is { template_name, voucher_date: 'YYYY-MM-DD', narration, dr, cr }. */
export const saveJvVouchers = (companyId, vouchers) => api.post(VOUCHERS_URL, { company_id: companyId, vouchers })

/** `id` counts within its template, so both are needed. */
export const deleteJvVoucher = (companyId, templateName, id) =>
  api.delete(VOUCHERS_URL, { data: { company_id: companyId, template_name: templateName, id } })

/** The URL of an Excel of the saved vouchers - one template's, or with no name every template's. */
export const exportJvVouchers = (companyId, templateName) =>
  api.post(VOUCHER_EXPORT_URL, templateName ? { company_id: companyId, template_name: templateName } : { company_id: companyId })

/* ---- Bank entries ---- */

export const getJvBankEntries = (companyId) => api.post(BANK_ENTRIES_URL, { company_id: companyId })

/** Moves rows out of `source` (JV_BANK_SOURCE) to the other list, each with its chosen template. */
export const assignJvBankEntries = (companyId, source, assign) =>
  api.put(BANK_ENTRIES_URL, { company_id: companyId, source, assign })

/** `srNos` are numbers within `source`; the rows left are numbered again from 1. */
export const deleteJvBankEntries = (companyId, source, srNos) =>
  api.delete(BANK_ENTRIES_URL, { data: { company_id: companyId, source, sr_no: srNos } })

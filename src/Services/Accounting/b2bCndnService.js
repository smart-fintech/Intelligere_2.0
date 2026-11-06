/**
 * B2B / CNDN - one API for both, accounting_entries/b2b_cndn_data/, the half
 * chosen by `source` ("b2b" / "cndn"). The spec: the backend's
 * accounting_entries/cndn_payload.txt. Each body takes `company_id`.
 *
 * B2B
 *   POST   multipart { source, company_id, file }  -> 201 the first batch + { msg }. Replaces
 *                                                    EVERY B2B row this user uploaded before
 *   POST   { source, company_id }                  -> 200 the batch: { matchedList, unMatchedList,
 *                                                       "similar_ledger_GSTNO.", total_len,
 *                                                       batch_size, Remaining }
 *          A batch is the first 100 rows not yet sent (never splitting an invoice). It
 *          moves on only as rows are marked sent - asked again, it answers the same rows.
 *   PUT    [{ company_id, source, gst_number, Vouchernumber, taxable_value,
 *             purchaseLedgerName }]                 marks those rows sent (is_verified)
 *
 * CNDN
 *   POST   multipart { source, company_id, file }  -> 201 { matchedList, unMatchedList,
 *                                                       "similar_ledger_GSTNO." } - the notes
 *          of the sheet. Only matched notes are saved; the last row of matchedList is
 *          always { duplicate_data }. There is NO batch: a POST without a file is an
 *          upload that fails - after the backend has already removed this user's notes.
 *   PUT    [the note as uploaded + purchaseLedgerName, source, company_id]  marks them sent.
 *          A row that finds no saved note updates the row before it, so only saved notes go.
 *
 *   accounting_entries/new_b2b_cdnr_matched/
 *     POST { source: "cndn", company_id, gstno, note_no, note_date, note_value, gst_rate }
 *          saves an unmatched note once its ledger exists -> 201 saved, 226 already saved.
 *          The backend waits up to ~30 s for a ledger still on its way from Tally.
 *          (B2B has no need of it: its upload saves the unmatched rows too.)
 *
 *   gst_portal_integration/gstr2b/ with source "B2B" - the months' GSTR-2B from the GST
 *          portal REPLACE the B2B rows; read back as a batch. Signing in first:
 *          Hooks/useGstPortalAuth.
 *
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/Global/apiService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGES TO TALLY - on the app's shared socket (EXE_intelligere.py)
 * ------------------------------------------------------------------
 *   { payload: { module_name: "b2b_data",  company_name, data: [row] } }   (old module b2b_purchase)
 *   { payload: { module_name: "cndn_data", company_name, data: [row] } }   (old module cndn_payment)
 *   Both answered { res: { return_module_name, action_status: "stop_loader", status, msg } },
 *   `status` "success" only when Tally created every voucher. The rows: toB2BTallyRow /
 *   toCndnTallyRow (Modules/B2BCNDN).
 */

import { B2B_CNDN_MODULE, B2B_CNDN_SOURCE, B2B_MODULE_NAMES, CNDN_MODULE_NAMES } from '@/Constants/b2bCndn'
import { hasActiveModule, listsModule } from '@/Services/Auth/accessService'
import { api } from '@/Services/Global/apiService'
import { GSTR_2B_PREMIUM } from '@/Services/Gst/gstCompareService'
import { MULTIPART } from '@/Services/Global/apiHelpers'

const DATA_URL = 'accounting_entries/b2b_cndn_data/'
const MATCHED_URL = 'accounting_entries/new_b2b_cdnr_matched/'
const GSTR_2B_URL = 'gst_portal_integration/gstr2b/'

// Named so axios sends the FormData as it is - see Services/Company/bankService.

/** The names these Tally operations go by, in both directions. */
export const TALLY_SEND_B2B_MODULE = 'b2b_data'
export const TALLY_SEND_CNDN_MODULE = 'cndn_data'

/** Whether the company has either half - the page opens for one of them. */
export const hasB2BCndnModule = (company) =>
  hasActiveModule(company, B2B_CNDN_MODULE) || hasB2BModule(company) || hasCndnModule(company)

/** Each half on its own; the module's own key counts for both. */
export const hasB2BModule = (company) => listsModule(company?.active_modules, [B2B_CNDN_MODULE, ...B2B_MODULE_NAMES])
export const hasCndnModule = (company) => listsModule(company?.active_modules, [B2B_CNDN_MODULE, ...CNDN_MODULE_NAMES])

/**
 * A list answer as an object. Some answers come as JSON TEXT, and "Your Free
 * Trial Period is Over" comes as a 200 of { msg } (CNDN even as text) - an
 * answer without the lists is thrown with its message, as a failure is.
 */
const readListReply = (reply) => {
  let value = reply
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'matchedList' in value) return value
  const failure = new Error(typeof value?.msg === 'string' ? value.msg : '')
  failure.data = value
  throw failure
}

/** A 2xx whose body is the JSON TEXT of { msg } is a refusal ("Your Free Trial Period is Over"). */
const refuseTextReply = (reply) => {
  if (typeof reply !== 'string' || !reply.trim().startsWith('{')) return reply
  let message
  try {
    message = JSON.parse(reply)?.msg
  } catch {
    return reply
  }
  if (message) throw new Error(message)
  return reply
}

/** Upload a GSTR-2B workbook - the B2B sheet or the B2B-CDNR sheet, by `source`. */
export const uploadB2BCndnFile = async (source, companyId, file) => {
  const body = new FormData()
  body.append('source', source)
  body.append('company_id', companyId)
  body.append('file', file)
  return readListReply(await api.post(DATA_URL, body, MULTIPART))
}

/** B2B only - see the note above on why CNDN must never be asked this. */
export const getB2BBatch = async (companyId) =>
  readListReply(await api.post(DATA_URL, { source: B2B_CNDN_SOURCE.B2B, company_id: companyId }))

/**
 * `rows` are full PUT rows (toB2BSentRow / toCndnSentRow); ?source= routes the PUT
 * whatever the rows hold. CNDN answers 202 with no body - or, its trial over, a
 * 200 of JSON text, which is a failure.
 */
export const markB2BCndnSent = async (source, rows) => refuseTextReply(await api.put(`${DATA_URL}?source=${source}`, rows))

/** 201 saved, 226 already saved - both with no body; the trial over is a 200 of JSON text. */
export const saveCndnAsMatched = async (companyId, note) =>
  refuseTextReply(await api.post(MATCHED_URL, { source: B2B_CNDN_SOURCE.CNDN, company_id: companyId, ...note }))

/** The months' GSTR-2B, saved as B2B rows - the fetch GST Compare makes, with source "B2B". */
export const fetchGstr2bIntoB2B = ({ companyId, startMonth, endMonth, year }) =>
  api.post(GSTR_2B_URL, {
    company_id: companyId,
    start_month: Number(startMonth),
    end_month: Number(endMonth),
    year: String(year),
    source: 'B2B',
    premium_name: GSTR_2B_PREMIUM,
  })

export const buildSendB2BMessage = (companyName, rows) => ({
  payload: { module_name: TALLY_SEND_B2B_MODULE, company_name: companyName, data: rows },
})

export const buildSendCndnMessage = (companyName, rows) => ({
  payload: { module_name: TALLY_SEND_CNDN_MODULE, company_name: companyName, data: rows },
})

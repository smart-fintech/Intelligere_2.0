/**
 * PAYABLE RECEIVABLE - every URL of the module, and its message to Tally.
 *
 * ONE endpoint, with the body and the method saying what to do:
 *
 *   POST    tally/receivable_payable/   { company_name }
 *             -> "27-10-2026 11:42:05"  when it last came from Tally
 *             -> { msg: "company name not exist" }
 *   POST    tally/receivable_payable/   { company_name, source }
 *             -> { "<ledger>": [{ amount, duedate, billdate, invoice_no,
 *                                 credit_days, partial: [...] }] }
 *   PUT     tally/receivable_payable/   { company_name, type, ledger_name,
 *                                         invoice_no, amount, billdate, payment_date }
 *             -> { msg }                 a partial payment
 *   PUT     tally/receivable_payable/   { company_name, type, data: { "<ledger>": [invoice_no] } }
 *             -> { msg }                 a full payment: the invoice leaves the list
 *   PUT     tally/receivable_payable/   { company_name, type, ledger_name, invoice_no, credit_days }
 *             -> { msg }                 an invoice's credit days
 *   DELETE tally/receivable_payable/   { company_name, type, ledger_name, invoice_no }
 *             -> { msg }
 *
 * and one more for the opening balance:
 *
 *   POST    tally/Save_opening_balance/ { company_id, ledger_name, opening_balance, date }
 *             -> { msg }
 *
 * `source` and `type` are both 'payable' or 'receivable' (PR_SOURCE). Nothing
 * here shows a message: a failure is an Error carrying the backend's own text
 * (Services/Global/apiService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGE TO TALLY
 * ------------------------------------------------------------------
 * Sent on the app's shared socket, in the envelope every Tally message uses:
 *
 *   { "payload": { "module_name": "receivable_payable",
 *                  "company_name": "<active company>",
 *                  "loging_user": "<signed-in user's email>" } }
 *
 * and answered as `return_module_name` - see useTallySync.
 */

import { PAYABLE_RECEIVABLE_MODULE } from '@/Constants/payableReceivable'
import { getEmail } from '@/Library/secureStorage'
import { hasActiveModule } from '@/Services/Auth/accessService'
import { api } from '@/Services/Global/apiService'

const RECEIVABLE_PAYABLE_URL = 'tally/receivable_payable/'
const OPENING_BALANCE_URL = 'tally/Save_opening_balance/'

/** The name this Tally operation goes by, in both directions. */
export const TALLY_RECEIVABLE_PAYABLE_MODULE = 'receivable_payable'

/** Whether the company's `active_modules` lists the module (Services/Auth/accessService). */
export const hasPayableReceivableModule = (company) => hasActiveModule(company, PAYABLE_RECEIVABLE_MODULE)

/** The sync, ready to send. `loging_user` is spelt as the Tally agent reads it. */
export const buildReceivablePayableSyncMessage = (companyName) => ({
  payload: {
    module_name: TALLY_RECEIVABLE_PAYABLE_MODULE,
    company_name: companyName,
    loging_user: getEmail() || '',
  },
})

/**
 * "This company has nothing here yet" is an answer, not a failure, whichever
 * HTTP status it comes with - so it is handed on as the { msg } it is, and the
 * screen says so instead of offering a Retry that cannot help.
 */
const keepNoCompanyReply = (failure) => {
  if (/not exist/i.test(failure?.message ?? '')) return { msg: failure.message }
  throw failure
}

/** When this company's data last came from Tally: the text, or { msg } - see readLastSync. */
export const getLastSync = (companyName) =>
  api.post(RECEIVABLE_PAYABLE_URL, { company_name: companyName }).catch(keepNoCompanyReply)

/** One list, `source` being 'payable' or 'receivable' - see readOutstanding. */
export const getOutstanding = (companyName, source) =>
  api.post(RECEIVABLE_PAYABLE_URL, { company_name: companyName, source }).catch(keepNoCompanyReply)

/** Records a payment against one invoice, or saves its credit days - the body says which. */
export const updateEntry = (payload) => api.put(RECEIVABLE_PAYABLE_URL, payload)

/** Removes one invoice from the list. */
export const deleteEntry = (payload) => api.delete(RECEIVABLE_PAYABLE_URL, { data: payload })

/** Saves a ledger's opening balance. */
export const saveOpeningBalance = (payload) => api.post(OPENING_BALANCE_URL, payload)

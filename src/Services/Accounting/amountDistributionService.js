/**
 * AMOUNT DISTRIBUTION - every URL of the module, and its message to Tally.
 *
 *   POST accounting_entries/amount_distribution/
 *          { source: 'fixed' | 'variable', mode, total_amount, entries, date, end_date,
 *            opposite_ledger, Voucher_type, narration: { "<ledger>": text }, company_id,
 *            ledger: ["<ledger>", ...] }
 *          -> { id, data: [{ active_company, mode, ledger, narration, amount: [...],
 *                            ind_days: [...], total_amount, date: [...], entries,
 *                            opposite_ledger, Voucher_type }],
 *               file: "<complete URL of the CSV>" }
 *
 *   POST accounting_entries/save_amount_distribution/   { id }
 *          -> { msg: "Entries saved successfully" }
 *
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/Global/apiService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGE TO TALLY
 * ------------------------------------------------------------------
 * Sent on the app's shared socket, in the envelope every Tally message uses,
 * with the rows exactly as the API returned them:
 *
 *   { "payload": { "module_name": "amount_distribution",
 *                  "company_name": "<active company>",
 *                  "data": [ ...rows ] } }
 *
 * and answered as `return_module_name` - see useTallySync.
 */

import { AMOUNT_DISTRIBUTION_MODULE } from '@/Constants/amountDistribution'
import { hasActiveModule } from '@/Services/Auth/accessService'
import { api } from '@/Services/Global/apiService'

const GENERATE_URL = 'accounting_entries/amount_distribution/'
const SAVE_URL = 'accounting_entries/save_amount_distribution/'

/** The name this Tally operation goes by, in both directions. */
export const TALLY_AMOUNT_DISTRIBUTION_MODULE = 'amount_distribution'

/** Whether the company's `active_modules` lists the module (Services/Auth/accessService). */
export const hasAmountDistributionModule = (company) => hasActiveModule(company, AMOUNT_DISTRIBUTION_MODULE)

/** Works out the entries - the same call for both kinds, `source` says which. */
export const generateAmountDistribution = (payload) => api.post(GENERATE_URL, payload)

/** Saves the entries of one generated distribution. */
export const saveAmountDistribution = (id) => api.post(SAVE_URL, { id })

/** The entries, ready to send to Tally. */
export const buildAmountDistributionTallyMessage = (companyName, rows) => ({
  payload: {
    module_name: TALLY_AMOUNT_DISTRIBUTION_MODULE,
    company_name: companyName,
    data: rows,
  },
})

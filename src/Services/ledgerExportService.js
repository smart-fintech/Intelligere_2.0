/**
 * LEDGER EXPORT - every URL of the module, and its message to Tally.
 *
 * For a Tally user:
 *
 *   POST    tally/ledger_export/       { company_name }  -> "27-10-2026 11:42:05"  when it last came from Tally
 *   POST    tally/general_ledger/      { company_id, ledger_name: "<one>", from_date, to_date }
 *   POST    tally/party_wise_ledger/   { company_id, ledger_name: ["<one or more>"], from_date, to_date }
 *             -> { "<group>": { "<ledger>": { "1": { Date, "Invoice No.", Particulars, type, amount, balance } } } }
 *
 * Dates there are DD-MMM-YYYY (toLedgerDate).
 *
 * For a user on another ERP:
 *
 *   POST    tally/ERP_ledger_export/   { financial_year: "2026-2027" }
 *             -> { "<ledger>": [{ date, voucher_no, vouchertype, narration, particular, debit, credit, balance, ... }] }
 *   PUT     tally/ERP_ledger_export/   { id, position, from_ledger, to_ledger: { "<ledger>": [row] }, module_name }
 *   DELETE  tally/ERP_ledger_export/   { id, ledger_name, position, vouchertype, module_name, object_id }
 *   POST    tally/save_bank_entry/     { leader_name, date, amount, narration, particular, vouchertype, company_id }
 *
 * `leader_name` is spelt as the backend reads it. A failure is an Error carrying
 * the backend's own text (Services/authService), for the screen to show. An
 * opening balance goes through saveOpeningBalance (payableReceivableService).
 *
 * ------------------------------------------------------------------
 * THE MESSAGE TO TALLY
 * ------------------------------------------------------------------
 *   { "payload": { "module_name": "ledger_export",
 *                  "company_name": "<active company>",
 *                  "loging_user": "<signed-in user's email>",
 *                  "data": { start_month, start_year, end_month, end_year } } }
 *
 * and answered as `return_module_name` - see useTallySync.
 */

import { getEmail } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

const LEDGER_EXPORT_URL = 'tally/ledger_export/'
const GENERAL_LEDGER_URL = 'tally/general_ledger/'
const PARTY_WISE_LEDGER_URL = 'tally/party_wise_ledger/'
const ERP_LEDGER_URL = 'tally/ERP_ledger_export/'
const BANK_ENTRY_URL = 'tally/save_bank_entry/'

/** The name this Tally operation goes by, in both directions. */
export const TALLY_LEDGER_EXPORT_MODULE = 'ledger_export'

/** The sync, ready to send. `range` is four numbers. `loging_user` is spelt as the Tally agent reads it. */
export const buildLedgerExportSyncMessage = (companyName, range) => ({
  payload: {
    module_name: TALLY_LEDGER_EXPORT_MODULE,
    company_name: companyName,
    loging_user: getEmail() || '',
    data: range,
  },
})

/**
 * "Nothing has come from Tally for this company yet" is an answer, not a
 * failure, whichever HTTP status it comes with.
 */
const keepNoDataReply = (failure) => {
  if (/not exist|no ledger data/i.test(failure?.message ?? '')) return { msg: failure.message }
  throw failure
}

/** When this company's ledgers last came from Tally: the text, or { msg } - see readLastSync. */
export const getLedgerLastSync = (companyName) =>
  api.post(LEDGER_EXPORT_URL, { company_name: companyName }).catch(keepNoDataReply)

/** One ledger's transactions. */
export const getGeneralLedger = (payload) => api.post(GENERAL_LEDGER_URL, payload)

/** The transactions of one or more ledgers. */
export const getPartyWiseLedger = (payload) => api.post(PARTY_WISE_LEDGER_URL, payload)

/** Every ledger for a financial year - see readErpLedgers. */
export const getErpLedgers = (financialYear, companyId) => api.post(ERP_LEDGER_URL, { financial_year: financialYear, company_id: companyId })

/** Moves one entry to another ledger. */
export const updateErpEntry = (payload) => api.put(ERP_LEDGER_URL, payload)

/** Removes one entry. */
export const deleteErpEntry = (payload) => api.delete(ERP_LEDGER_URL, { data: payload })

/** Adds a bank entry to a ledger. */
export const saveBankEntry = (payload) => api.post(BANK_ENTRY_URL, payload)

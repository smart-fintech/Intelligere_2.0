/**
 * The bank accounts of the company the user is working in.
 *
 * Every bank URL in the project is written here and nowhere else, so a screen
 * calls a named function and never an endpoint:
 *
 *   import { getBankDetails, addBank } from '@/Services/bankService'
 *
 *   const banks = await getBankDetails(companyId)
 *   await addBank({ ... })
 *
 * Nothing in this file catches an error or shows a message. The shared axios
 * setup (see Services/authService) has already turned a failure into a plain
 * Error carrying the backend's own text, so the screen that made the call
 * writes one `catch` and shows `error.message` - see BankDetails.jsx.
 *
 * ONE endpoint does four of the five jobs:
 *
 *   GET     bank_statement/bankDetails/    list them
 *   POST    bank_statement/bankDetails/    add one
 *   PUT     bank_statement/bankDetails/    change one     (identified by id)
 *   DELETE  bank_statement/bankDetails/    remove one     (identified by id)
 *
 * and the fifth fills the Bank name dropdown:
 *
 *   GET     bank_statement/allbanklist/    every bank that can be chosen
 *
 * The Bank Ledger dropdown has no endpoint here: it lists the company's
 * ledgers, which the ledger module already loads (Store/Slices/ledgerSlice),
 * so the Bank form reads that same list instead of asking again.
 */

import { api } from '@/Services/authService'

const BANK_DETAILS_URL = 'bank_statement/bankDetails/'
const ALL_BANKS_URL = 'bank_statement/allbanklist/'

/**
 * Both endpoints answer with a bare array today. Being wrapped in
 * `{ data: [...] }` or `{ results: [...] }` later is the sort of change that
 * arrives without warning, so all three are accepted and anything else
 * becomes an empty list rather than a crash in a `.map()`.
 */
const toList = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.results)) return response.results
  return []
}

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

/**
 * The bank accounts of one company.
 *
 * The company id is passed as a query parameter because bank accounts are
 * company-specific and the caller already knows which company is selected -
 * see Store/Slices/companySlice. It is sent as `comp_id`, the same name the
 * POST body uses, so the backend reads one name everywhere.
 *
 * With no company id the parameter is left off entirely and the backend
 * falls back to the session (authService also sends the selected company as
 * the `activecompanyid` header for the user types that work that way).
 */
export const getBankDetails = async () =>
  toList(
    await api.get(BANK_DETAILS_URL),
    // await api.get(BANK_DETAILS_URL, companyId ? { params: { comp_id: companyId } } : undefined),
  )

/**
 * Every bank that can be picked in the Bank name dropdown:
 *
 *   { id: 1, bank_name: "HDFC Bank", bank_id: "1" }
 *
 * The list is the same for every company, so it does not take a company id.
 */
export const getBankList = async () => toList(await api.get(ALL_BANKS_URL))

/* ------------------------------------------------------------------ */
/* Writing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Adds a bank account.
 *
 * The payload is exactly what the backend asks for, named as it names it:
 *   { bank_name, bank_ledger_name, account_no, ifsc_code, comp_id }
 *
 * `comp_id` comes from the selected company - the form fills it in, so the
 * user is never asked to type a company id. Checking the rest of the fields
 * is the form's job, not this file's.
 */
export const addBank = (payload) => api.post(BANK_DETAILS_URL, payload)

/**
 * Changes a bank account.
 *
 * The backend identifies the row by `id` and updates only the fields that
 * come with it, so the form sends the id plus whatever the user actually
 * edited:
 *   { id, ifsc_code: "343333xx" }
 */
export const updateBank = (payload) => api.put(BANK_DETAILS_URL, payload)

/**
 * Removes a bank account.
 *
 * A DELETE with a body is unusual, and axios only sends one when it is put
 * under `data` - hence the wrapper here rather than at every call site.
 *
 * A row that is already gone comes back as a 404, which arrives at the
 * caller as an ordinary Error carrying the backend's "Bank details not
 * found" text (`error.status` is 404 if a screen wants to tell the two
 * apart).
 */
export const deleteBank = (id) => api.delete(BANK_DETAILS_URL, { data: { id } })

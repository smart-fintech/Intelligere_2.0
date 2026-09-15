/**
 * The ledgers of the company the user is working in.
 *
 * Every ledger URL in the project is written here and nowhere else, so a
 * screen calls a named function and never an endpoint:
 *
 *   import { getLedgers, createLedger } from '@/Services/ledgerService'
 *
 *   const ledgers = await getLedgers(companyId)
 *   await createLedger({ ... })
 *
 * Nothing in this file catches an error or shows a message. The shared axios
 * setup (see Services/authService) has already turned a failure into a plain
 * Error carrying the backend's own text, so the screen that made the call
 * writes one `catch` and shows `error.message`.
 *
 * ------------------------------------------------------------------
 * ONE URL DOES FOUR JOBS - AND THE LIST IS A **POST**
 * ------------------------------------------------------------------
 *   POST    tally/create-ledger/   list them   { company }
 *   POST    tally/create-ledger/   add one     the whole ledger
 *   PUT     tally/create-ledger/   change one  { id, company, ...changed }
 *   DELETE  tally/create-ledger/   remove one  { id, company, delete: true }
 *
 * Listing and creating are the same method on the same URL; only the body
 * tells them apart - a body with just `company` is a query, a full one is a
 * new ledger. That is why they are two named functions here: no screen
 * should have to remember which shape means what.
 *
 * and the fifth fills the Ledger Group dropdown:
 *
 *   GET     tally/intelligere_group_list/
 */

import { getEmail, getERP } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

const LEDGER_URL = 'tally/create-ledger/'
const GROUP_LIST_URL = 'tally/intelligere_group_list/'

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
/* Which ledger is which                                              */
/* ------------------------------------------------------------------ */

/**
 * A ledger's identifier.
 *
 * The list API sends each ledger with `ledger_obj_id` - there is no `id`
 * field on these rows:
 *
 *   { "ledger_obj_id": 1, "ledeger_name": "Demo Ledger 1",
 *     "ledeger_group": 1, "ledeger_group_name": "Primary", ... }
 *
 * Every screen reads it through here - as a React key, to know which row is
 * being edited, as the value of a ledger dropdown, and for the update and
 * delete calls - so if the API ever renames it again, this is the one line
 * that changes.
 */
export const getLedgerId = (ledger) => ledger?.ledger_obj_id ?? null

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

/**
 * The ledgers of one company.
 *
 * A POST, not a GET - the backend takes the company in the body. The id is
 * passed in by the caller, which reads it from the selected company in the
 * store, so it is never written down anywhere.
 *
 * Without a company there is nothing to ask for, and an empty list reads the
 * same to every caller as a request that found nothing.
 */
export const getLedgers = async (companyId) => {
  if (!companyId) return []

  return toList(await api.post(LEDGER_URL, { company_id: companyId }))
}

/**
 * Every group a ledger can belong to:
 *
 *   { id: 5, user_show_group: "Bank" }
 *
 * The groups are the same for every company, so this takes no company id.
 *
 * They fill the Ledger Group dropdown on the form. (The table does not need
 * them: each ledger row arrives with its own `ledeger_group_name`.)
 */
export const getLedgerGroups = async () => toList(await api.get(GROUP_LIST_URL))

/* ------------------------------------------------------------------ */
/* Writing                                                            */
/* ------------------------------------------------------------------ */

/**
 * The fields the backend fills in from the session rather than from the form.
 *
 * They are added here, in one place, so no form has to know about them and
 * no screen can hardcode an email or an ERP name. Both are read from storage,
 * where they were saved at sign-in.
 *
 * `erp` is lower-cased because registration saves it as "Intelligere" while
 * this endpoint expects "intelligere". `platform` is sent empty, as the API's
 * own example does.
 */
const systemFields = () => ({
  created_by: getEmail() || '',
  erp: (getERP() || 'intelligere').toLowerCase(),
  platform: '',
})

/**
 * Adds a ledger.
 *
 * The caller passes the form's own fields plus the company id; the session
 * fields above are added here. Checking what the user typed is the form's
 * job, not this file's.
 */
export const createLedger = (payload) => api.post(LEDGER_URL, { ...payload, ...systemFields() })

/**
 * Changes a ledger.
 *
 * The backend identifies the row by the `id` field of the body and updates
 * only the fields that come with it, so the form sends the ledger's id (its
 * `ledger_obj_id` - see getLedgerId) and company plus whatever the user
 * actually edited.
 */
export const updateLedger = (payload) => api.put(LEDGER_URL, { ...payload, ...systemFields() })

/**
 * Removes a ledger.
 *
 * This is a SOFT delete: `delete: true` tells the backend to mark the row
 * hidden, and the row is not erased. Nothing on the frontend deletes data.
 *
 * A DELETE with a body is unusual, and axios only sends one when it is put
 * under `data` - hence the wrapper here rather than at the call site.
 *
 * `id` is the ledger's `ledger_obj_id` (see getLedgerId).
 */
export const deleteLedger = (id, companyId) =>
  api.delete(LEDGER_URL, { data: { id, company_id: companyId, delete: true } })

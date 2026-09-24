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
const LEDGER_DELETEALL_URL = 'tally/delete_all_ledger/'
const GROUP_LIST_URL = 'tally/intelligere_group_list/'
const TALLY_GROUP_LIST_URL = 'tally/ledger_groups/'

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

/** Where the ledger groups come from - one endpoint per ERP, never both. */
export const LEDGER_GROUP_SOURCE = Object.freeze({
  INTELLIGERE: 'intelligere',
  TALLY: 'tally',
})

/**
 * Every group a ledger can belong to:
 *
 *   { id: 5, user_show_group: "Bank" }
 *
 *   Intelligere   GET  tally/intelligere_group_list/   the same for every
 *                                                     company; used as it comes
 *   Tally         POST tally/ledger_groups/            { company_id } ->
 *                 [{ id, group_name }] - `group_name` is copied to
 *                 `user_show_group`, the field the form reads, so the UI
 *                 needs no change. No company, no request.
 *
 * They fill the Ledger Group dropdown on the form. (The table does not need
 * them: each ledger row arrives with its own `ledeger_group_name`.)
 */
export const getLedgerGroups = async (source = LEDGER_GROUP_SOURCE.INTELLIGERE, companyId = null) => {
  if (source === LEDGER_GROUP_SOURCE.TALLY) {
    if (!companyId) return []

    return toList(await api.post(TALLY_GROUP_LIST_URL, { company_id: companyId }))
      .filter((group) => group && group.id != null)
      .map((group) => ({ ...group, user_show_group: group.user_show_group ?? group.group_name }))
  }

  return toList(await api.get(GROUP_LIST_URL))
}

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
  api.delete(LEDGER_URL, {
    data: { ledger_obj_id: id, company_id: companyId, delete: true }
  })


export const deleteAllLedgers = (companyId) =>
  api.delete(LEDGER_DELETEALL_URL, {
    data: { company_id: companyId }
  })

/* ------------------------------------------------------------------ */
/* Sync Now - fetching the ledgers from Tally over the WebSocket       */
/* ------------------------------------------------------------------ */

/**
 * The module name the ledger sync uses in both directions: sent as
 * `module_name`, and answered as `return_module_name`. Ledger Details passes
 * it to useWebSocket({ module }) so it hears only these replies.
 */
export const LEDGER_SOCKET_MODULE = 'fetch_ledger'

/**
 * The Sync Now payload:
 *
 *   { "payload": { "module_name": "fetch_ledger", "company_name": "<active company>" } }
 *
 * `companyName` is the active company's name from the store - never typed in.
 */
export const buildFetchLedgerMessage = (companyName) => ({
  payload: {
    module_name: LEDGER_SOCKET_MODULE,
    company_name: companyName,
  },
})

/* ------------------------------------------------------------------ */
/* Tally: creating and changing a ledger over the WebSocket            */
/* ------------------------------------------------------------------ */

/** Tally ERP only - Intelligere keeps createLedger / updateLedger above. */
export const TALLY_LEDGER_CREATE_MODULE = 'tally_ledger_create'
export const TALLY_LEDGER_ALTER_MODULE = 'tally_ledger_alter'

/** The ledger fields Tally takes, in the `data` of its payload. */
const TALLY_LEDGER_FIELDS = [
  'ledeger_guid',
  'ledeger_group_name',
  'ledeger_name',
  'ledeger_state',
  'ledger_gst_reg_type',
  'ledeger_address',
  'ledeger_email',
  'ledeger_phone',
  'ledeger_gstin',
  'ledeger_website',
  'ledger_sac',
  'ledger_bank',
  'ledger_ifsc',
  'ledger_accno',
  'ledger_pincode',
  'gst_rate',
]

/**
 * The Tally create / alter payload - the same shape for both, only
 * `module_name` differs:
 *
 *   { "payload": { "module_name": "tally_ledger_create" | "tally_ledger_alter",
 *                  "company_name": "<active company>",
 *                  "data": { ...the ledger fields, created_by, platform } } }
 *
 * `ledger` holds the form's values; `created_by` and `platform` are the
 * session fields every ledger save sends (systemFields).
 */
export const buildTallyLedgerMessage = (moduleName, companyName, ledger) => {
  const { created_by, platform } = systemFields()
  const data = TALLY_LEDGER_FIELDS.reduce((built, field) => {
    const value = ledger?.[field]
    built[field] = value === null || value === undefined ? '' : String(value).trim()
    return built
  }, {})

  return {
    payload: {
      module_name: moduleName,
      company_name: companyName,
      data: { ...data, created_by, platform },
    },
  }
}

/* ------------------------------------------------------------------ */
/* Importing ledgers from a CSV                                        */
/* ------------------------------------------------------------------ */

const LEDGER_CSV_IMPORT_URL = 'tally/LedgerCSVImportTally/'

/**
 * The blank CSV the user fills in, kept with the app's other static files in
 * Assets/format - the folder every format template goes in (a product or
 * vendor one later sits beside it and is imported the same way).
 *
 * `?raw` is Vite's "give me the contents, not a link". The alternative,
 * `?url`, gives a built file named LedgerFormat-a1b2c3.csv - and since a
 * browser saves a download under the name in the URL, that hash would end up
 * in the file on the user's disk. The contents come through the bundle
 * instead, and Download Format writes them out under the name below (see
 * downloadTextFile in Utils/fileDownload). The file is one line, so this
 * costs the bundle nothing worth measuring.
 */
export const LEDGER_CSV_FORMAT_FILE = 'LedgerFormat.csv'
export { default as LEDGER_CSV_FORMAT_CONTENT } from '@/Assets/format/LedgerFormat.csv?raw'

/**
 * Sends the filled-in CSV up.
 *
 *   POST tally/LedgerCSVImportTally/   multipart: company_id, user_erp_type, file
 *
 * ONE ENDPOINT, TWO ANSWERS - the ERP the caller declares decides which:
 *
 *   intelligere   the ledgers are created there and then, and the reply is
 *                 { msg: "5 ledger created successfully" }
 *   tally         nothing is created yet: the reply is the parsed rows,
 *                 [{ ledeger_name, ledeger_group, ... }], which the screen
 *                 then sends to Tally over the WebSocket (see below).
 *
 * `erpType` is 'tally' or 'intelligere', read by the screen from the profile
 * in the store - never from here, so there is one ERP answer in the app.
 *
 * The Content-Type is set for this one call: the shared axios instance sends
 * JSON by default, and with that header axios would quietly turn the
 * FormData - file and all - into a JSON body. Naming multipart here stops
 * that; the browser then replaces it with the real boundary.
 */
export const importLedgerCsv = ({ companyId, erpType, file }) => {
  const body = new FormData()

  body.append('company_id', companyId)
  body.append('user_erp_type', erpType)
  body.append('file', file)

  return api.post(LEDGER_CSV_IMPORT_URL, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/* Tally only: the import's second half, the one that reaches Tally. */
export const BULK_LEDGER_CREATE_MODULE = 'bulk_ledger_create'

/**
 * The two fields the import reply carries that the WebSocket payload does
 * not: the company is named once at the top of the payload, so repeating it
 * inside every ledger would only be a second copy to disagree with it.
 */
const BULK_LEDGER_OMITTED_FIELDS = ['company', 'company_name']

/**
 * The bulk create payload:
 *
 *   { "payload": { "module_name": "bulk_ledger_create",
 *                  "company_name": "<active company>",
 *                  "data": [ { ...ledger }, { ...ledger } ] } }
 *
 * `ledgers` is the import endpoint's reply, used as it came - the backend
 * has already parsed and named the fields, so nothing is rebuilt here.
 *
 * Only `company` and `company_name` are dropped from each row: the company
 * is named once, at the top of the payload, and Tally does not take it again
 * inside every ledger. Every other field is passed through untouched,
 * misspellings and all, because that is what Tally expects.
 */
export const buildBulkLedgerMessage = (companyName, ledgers) => ({
  payload: {
    module_name: BULK_LEDGER_CREATE_MODULE,
    company_name: companyName,
    data: (Array.isArray(ledgers) ? ledgers : []).map((ledger) =>
      Object.fromEntries(
        Object.entries(ledger ?? {}).filter(
          ([field]) => !BULK_LEDGER_OMITTED_FIELDS.includes(field),
        ),
      ),
    ),
  },
})

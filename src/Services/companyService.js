/**
 * Everything about the company the user is working in.
 *
 * ------------------------------------------------------------------
 * A COMPANY IS IDENTIFIED BY `company_id`
 * ------------------------------------------------------------------
 * tally/user-companies-list/ returns each company as
 *
 *   { "company_id": 2, "comp_name": "...", "comp_gstin": "...", "is_active": true, ... }
 *
 * `company_id` is the one identifier the app uses for a company - to select
 * it, to store it, and in every request that is about it. There is no `id` on
 * these records; code that reads `company.id` is reading nothing.
 *
 * Where the selected company lives:
 *   Redux (companySlice)     the list, and which company_id is selected -
 *                            what every screen reads
 *   secureStorage            that company_id alone, for the request header
 *                            and a reload - see setActiveCompanyId
 * Nothing else about a company is written to the browser.
 */

import { getEmail, setActiveCompanyId } from '@/Library/secureStorage'
import { api } from '@/Services/authService'
import { compareToToday, formatLongDate } from '@/Utils/date'

/* ------------------------------------------------------------------ */
/* The user's companies - the list the whole app works from            */
/* ------------------------------------------------------------------ */

/**
 * Fields the company endpoint sends that the frontend must never hold.
 *
 * tally/user-companies-list/ returns the company's e-invoice and e-way bill
 * PORTAL PASSWORDS with every record. No screen uses them, and a password
 * kept in the Redux store can be read by anyone with the page open (Redux
 * DevTools, a console, an error-reporting tool that snapshots state). They
 * are dropped here, as the reply is read, so they never reach the store.
 */
const CREDENTIAL_FIELD = /password/i

const withoutCredentials = (company) =>
  Object.fromEntries(Object.entries(company).filter(([field]) => !CREDENTIAL_FIELD.test(field)))

/**
 * Pulls the list out of whatever shape came back. Shared by BOTH company
 * endpoints below, which answer with the same kind of array.
 *
 * The endpoint returns a bare array today. Wrapping it in `{ data: [...] }`
 * or `{ results: [...] }` later is the sort of change that happens without
 * warning, so all three are accepted and anything else becomes an empty
 * list rather than a crash in the header.
 */
const toCompanyList = (response) => {
  const list = Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.results)
        ? response.results
        : []
  // A row with no company_id cannot be selected later, so it is no use in
  // the list. (`!= null` covers both null and undefined.)
  return list
    .filter((company) => company && company.company_id != null)
    .map(withoutCredentials)
}


/**
 * POST tally/user-companies-list/  with  { email }
 *
 * The full company records of the signed-in user: name, GST, address, which
 * modules they have paid for, and - the field that matters most here -
 * `is_active`, the company the BACKEND says they are currently working in.
 *
 * This is the one list the dashboard modules read from. It is fetched once
 * into the store (see Store/Slices/companySlice) rather than by each screen
 * that needs a company id.
 *
 * The email is not passed in by the caller: it is read from storage, where
 * it was saved at sign-in, so no screen ever has to know it. It is still
 * accepted as an argument for the admin case of looking at somebody else.
 */
const USER_COMPANIES_URL = 'tally/user-companies-list/'

export const getUserCompanies = async (email = getEmail()) => {
  // Without an email the backend has nothing to look up, so the request is
  // not worth sending - an empty list reads the same to every caller.
  if (!email) return []

  return toCompanyList(await api.post(USER_COMPANIES_URL, { email }))
}

/**
 * The company that should be selected by default.
 *
 * `is_active` is the backend's own answer to "which company is this user in",
 * and it is set by the switch call below - so it already carries the choice
 * the user made last time. It is searched for, never assumed to be first in
 * the list.
 *
 * Returns null when the backend has not marked one, which is a real state:
 * a brand new account with companies but none opened yet.
 */
export const findActiveCompany = (companies = []) =>
  companies.find((company) => company.is_active === true) ?? null

/**
 * Writes the chosen company to storage - the ONE place that does.
 *
 * Only its `company_id` is saved. authService sends it as the
 * `activecompanyid` header on every request, and companySlice falls back to
 * it after a reload. Everything else about the company (its name included)
 * is read from the list in the store, by that id, so it is not stored.
 *
 * Passing null forgets the selection.
 */
export const rememberSelectedCompany = (company) => {
  setActiveCompanyId(company?.company_id ?? null)
}

/* ------------------------------------------------------------------ */
/* Changing and removing a company (Company Details)                  */
/* ------------------------------------------------------------------ */

/*
 * The same URL as the list, with the method saying what to do - the pattern
 * the bank and ledger endpoints already follow:
 *
 *   POST    tally/user-companies-list/   list them        { email }
 *   PUT     tally/user-companies-list/   change one       { company_id, ...changed }
 *   DELETE  tally/user-companies-list/   remove one       { company_id }
 */

/**
 * Changes a company. The form sends its `company_id` and only the fields the
 * user actually edited; the company's name is never among them.
 */
export const updateCompany = (payload) => api.put(USER_COMPANIES_URL, payload)

/**
 * Removes a company. A DELETE with a body goes under `data` for axios - see
 * deleteBank in bankService.
 */
export const deleteCompany = (companyId) =>
  api.delete(USER_COMPANIES_URL, { data: { company_id: companyId } })

/* ------------------------------------------------------------------ */
/* A company's plan, in words                                         */
/* ------------------------------------------------------------------ */

/**
 * What to call a company's current state, worked out from its flags and
 * dates rather than shown as raw true / false:
 *
 *   is_active                          -> Active
 *   is_paid, renewal date not passed   -> Paid
 *   is_paid, renewal date passed       -> Expired     (renewal lapsed)
 *   unpaid, trial date today or later  -> Free Trial
 *   unpaid, trial date passed          -> Expired
 *   unpaid, no trial date at all       -> Inactive
 *
 * `is_active: false` is NOT read as "expired" on its own: it only means this
 * is not the company the account is working in right now. Whether it has
 * run out is a question for the dates. A paid company never shows as a free
 * trial, whatever its trial date says.
 *
 * Dates are compared as whole days ("trial until 10 Sep" includes all of
 * 10 Sep). Returns { tone, label, detail }: `tone` picks the badge colour,
 * `detail` is the one-line reason, for a tooltip.
 */
export const getCompanyStatus = (company) => {
  const renewal = compareToToday(company?.renew_date)
  const trial = compareToToday(company?.free_trial_date)

  if (company?.is_active === true) {
    return { tone: 'active', label: 'Active', detail: 'The company this account is working in' }
  }

  if (company?.is_paid === true) {
    if (renewal !== null && renewal < 0) {
      return { tone: 'expired', label: 'Expired', detail: `Renewal was due ${formatLongDate(company.renew_date)}` }
    }
    return {
      tone: 'paid',
      label: 'Paid',
      detail: renewal !== null ? `Paid until ${formatLongDate(company.renew_date)}` : 'Paid',
    }
  }

  if (trial !== null) {
    return trial >= 0
      ? { tone: 'trial', label: 'Free Trial', detail: `Free trial until ${formatLongDate(company.free_trial_date)}` }
      : { tone: 'expired', label: 'Expired', detail: `Free trial ended ${formatLongDate(company.free_trial_date)}` }
  }

  return { tone: 'inactive', label: 'Inactive', detail: 'Not paid, and no trial period on record' }
}

/* ------------------------------------------------------------------ */
/* Intelligere companies                                              */
/* ------------------------------------------------------------------ */

/**
 * The companies of an Intelligere user - the list behind the picker in the
 * header, and the form behind the Add company button next to it.
 *
 * ONE endpoint does all three jobs:
 *
 *   GET   tally/intelligere-company-create/   list them
 *   POST  tally/intelligere-company-create/   add one
 *   PUT   tally/intelligere-company-create/   make one the active company
 *
 * Both the GET and the POST answer with the WHOLE list, so after adding a
 * company there is no second call to make - the reply is the new list.
 *
 * A company looks like this:
 *
 *   {
 *     "id": 113,                     <- this endpoint's own row number
 *     "company_id": 418,             <- what the rest of the app calls it
 *     "comp_name": "ABC Traders",
 *     "gst_no": "24AAAAA0000A1Z5",
 *     "mobile_no": "9876543210",
 *     "comp_address": null,          <- may be null OR "" - both mean empty
 *     "pincode": null,
 *     "comp_state": null
 *   }
 *
 * Only Intelligere users have any of this. The header decides whether to
 * show it at all, using selectIsIntelligereErp from the profile slice.
 */

const INTELLIGERE_COMPANY_URL = 'tally/intelligere-company-create/'

/**
 * Every company this user has, as this endpoint sees them.
 *
 * NOT what fills the header any more - the picker and the dashboard modules
 * both read the store, which is filled by getUserCompanies() above because
 * that reply carries `is_active` and the rest of the company record. This is
 * kept for the Add company flow's endpoint, which is the same URL.
 */
export const listIntelligereCompanies = async () =>
  toCompanyList(await api.get(INTELLIGERE_COMPANY_URL))

/**
 * Adds a company, and hands back the full list that comes with the reply.
 *
 * The caller passes exactly the six fields the backend asks for; validating
 * them is the form's job, not this file's.
 */
export const createIntelligereCompany = async (payload) =>
  toCompanyList(await api.post(INTELLIGERE_COMPANY_URL, payload))

/**
 * Switches the user into a company.
 *
 * Only three fields go up: the company, identified by its `company_id` (sent
 * under the field name `id`, which is what this endpoint's PUT reads), and
 * the name and GST number the backend uses to confirm it is the company the
 * screen thinks it is.
 *
 * The chosen company_id is also written to storage, because every API call
 * sends it as the `activecompanyid` header (see authService).
 */
export const selectIntelligereCompany = async (company) => {
  const response = await api.put(INTELLIGERE_COMPANY_URL, {
    id: company.company_id,
    comp_name: company.comp_name,
    // The two company endpoints name the GST field differently
    // (`gst_no` here, `comp_gstin` in tally/user-companies-list/), so either
    // shape can be handed to this function.
    gst_no: company.gst_no ?? company.comp_gstin,
  })

  // Same helper the store uses, so the id is only ever written one way.
  rememberSelectedCompany(company)

  return response
}

/* ------------------------------------------------------------------ */
/* What this module says over the WebSocket                           */
/* ------------------------------------------------------------------ */

/**
 * The name the backend files Tally company messages under.
 *
 * A screen passes it to useWebSocket({ module: COMPANY_SOCKET_MODULE }) so it
 * hears these replies and not, say, ledger ones - and the header's Refresh
 * sends it (buildActiveCompanyMessage below), so one constant names the
 * module in both directions. It is exported from here - next to the rest of
 * the company code - because socketService deliberately knows nothing about
 * any module.
 *
 * `fetch_tally_company` replaced the old `Gcompany_id` module name on the
 * backend; this is the only place either is written.
 */
export const COMPANY_SOCKET_MODULE = 'fetch_tally_company'

/**
 * The payload behind the header's Refresh button: "fetch the Tally company I
 * am working in".
 *
 *   {
 *     "res": { "message": {
 *       "module": "fetch_tally_company",
 *       "company_id": "418",            <- the selected company, or ""
 *       "company_name": "ABC Traders"   <-        "         "      ""
 *     } }
 *   }
 *
 * `company` is the selected company from the store (selectSelectedCompany) -
 * the same record the rest of the screen is showing, so the id and the name
 * always belong to the same company. With no company selected both fields
 * are sent empty, exactly as the old project did, and the backend falls back
 * to whatever the session says.
 *
 * Building the payload HERE, and not in the header or in socketService, is
 * what lets the next module (ledger, and so on) add its own builder without
 * touching either of them.
 */
export const buildActiveCompanyMessage = (company) => ({
  res: {
    module: COMPANY_SOCKET_MODULE,
    email: getEmail(),
    company_id: company?.company_id != null ? String(company.company_id) : '',
    company_name: company?.comp_name || '',
  },
})

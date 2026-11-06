/**
 * A company's side of the Tally connection: the recent Tally companies (Tally
 * Gold), and the header's Refresh - "fetch the Tally company I am working in"
 * over the app's WebSocket. The company list itself is companyService's.
 */

import { getEmail } from '@/Library/secureStorage'
import { api } from '@/Services/Global/apiService'

/* ------------------------------------------------------------------ */
/* Recent Tally companies (Tally Gold, before a Refresh)              */
/* ------------------------------------------------------------------ */

/*
 *   GET     tally/recent_companies/   list them     -> [{ Comp_id, Comp_name }]
 *   DELETE  tally/recent_companies/   remove some   { Comp_id: [5925, 5924] }
 */
const RECENT_COMPANIES_URL = 'tally/recent_companies/'

/**
 * The recent Tally companies, always as an array (a `{ data }` / `{ results }`
 * wrapper is accepted too). Rows without a Comp_id cannot be deleted, so
 * they are left out.
 */
export const getRecentCompanies = async () => {
  const response = await api.get(RECENT_COMPANIES_URL)
  const list = Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.results)
        ? response.results
        : []
  return list.filter((company) => company && company.Comp_id != null)
}

/** The body the DELETE sends - exported so the caller can log exactly it. */
export const buildDeleteRecentCompaniesPayload = (companyIds) => ({ Comp_id: companyIds })

/** Removes the given recent companies. A DELETE body goes under `data` for axios. */
export const deleteRecentCompanies = (companyIds) =>
  api.delete(RECENT_COMPANIES_URL, { data: buildDeleteRecentCompaniesPayload(companyIds) })

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
 *     "payload": { "message": {
 *       "module": "fetch_tally_company",
 *       "company_id": "418",            <- the selected company, or ""
 *       "company_name": "ABC Traders"   <-        "         "      ""
 *     } }
 *   }
 *
 * `company` is the active company from the store (selectActiveCompany) -
 * the same record the rest of the screen is showing, so the id and the name
 * always belong to the same company. With no company selected both fields
 * are sent empty, exactly as the old project did, and the backend falls back
 * to whatever the session says.
 *
 * Building the payload HERE, and not in the header or in socketService, is
 * what lets the next module (ledger, and so on) add its own builder without
 * touching either of them.
 */
// export const buildActiveCompanyMessage = (company) => ({
export const buildActiveCompanyMessage = () => ({
  payload: {
    module_name: COMPANY_SOCKET_MODULE,
    email: getEmail(),
    // company_id: company?.company_id != null ? String(company.company_id) : '',
    // company_name: company?.comp_name || '',
  },
})

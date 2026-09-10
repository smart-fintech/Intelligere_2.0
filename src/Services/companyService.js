/**
 * Everything about the company the user is currently working in.
 *
 * ------------------------------------------------------------------
 * READ THIS BEFORE THE COMPANY API EXISTS
 * ------------------------------------------------------------------
 * The old project had `fetchActiveCompany()` in Centralised/CenterAPi, which
 * called the backend and returned the active company's name. That endpoint
 * has not been wired up in 2.0 yet, so for now this file hands back a
 * PLACEHOLDER name - see PLACEHOLDER_ACTIVE_COMPANY below.
 *
 * The placeholder is deliberately in ONE place. When the API is ready:
 *
 *   1. replace the body of getActiveCompanyName() with the real call:
 *
 *        const data = await api.get('company/active_company/')
 *        const name = data?.activeCompName ?? ''
 *        setItem(STORAGE_KEYS.ACTIVE_COMPANY_NAME, name)
 *        return name
 *
 * Nothing else in the project changes - the footer and every other caller
 * already `await getActiveCompanyName()`, which is why it is async today even
 * though it does no work yet.
 */

import { STORAGE_KEYS, getItem, setItem } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

/**
 * TEMPORARY. Swap this for the API response (see the note above).
 * Change the text here to try the footer against a different company name.
 */
const PLACEHOLDER_ACTIVE_COMPANY = 'DDSPL DEMO COMPANY'

/**
 * The name of the company the user is working in.
 *
 * A name saved by a company-switch screen wins, so that screen can start
 * working before the API below is wired up - it only has to call
 * setActiveCompanyName().
 */
export const getActiveCompanyName = async () => {
  const saved = getItem(STORAGE_KEYS.ACTIVE_COMPANY_NAME)
  if (saved) return saved

  return PLACEHOLDER_ACTIVE_COMPANY
}

/** Remembers the chosen company, so a reload does not lose it. */
export const setActiveCompanyName = (name) => {
  setItem(STORAGE_KEYS.ACTIVE_COMPANY_NAME, name || null)
}

/** The name without waiting - null when nothing has been saved yet. */
export const readStoredCompanyName = () =>
  getItem(STORAGE_KEYS.ACTIVE_COMPANY_NAME)

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
 *     "id": 113,                     <- the row, what PUT identifies it by
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
 * Pulls the list out of whatever shape came back.
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

  // A row with no id cannot be selected later, so it is no use in the list.
  return list.filter((company) => company && company.id !== undefined && company.id !== null)
}

/** Every company this user has. */
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
 * Only three fields go up - the backend identifies the row by `id` and uses
 * the other two to confirm it is the company the screen thinks it is.
 *
 * The chosen company is also written to storage, because that is where the
 * rest of the app reads it from: the footer shows the name, and every API
 * call sends the id as the `activecompanyid` header (see authService).
 */
export const selectIntelligereCompany = async (company) => {
  const response = await api.put(INTELLIGERE_COMPANY_URL, {
    id: company.id,
    comp_name: company.comp_name,
    gst_no: company.gst_no,
  })

  setActiveCompanyName(company.comp_name)
  // `company_id` is the id the rest of the backend knows this company by,
  // which is NOT the same number as the row's own `id`.
  setItem(STORAGE_KEYS.ACTIVE_COMPANY_ID, company.company_id ?? company.id)

  return response
}

/* ------------------------------------------------------------------ */
/* What this module says over the WebSocket                           */
/* ------------------------------------------------------------------ */

/**
 * The name the backend files company messages under.
 *
 * A screen passes it to useWebSocket({ module: COMPANY_SOCKET_MODULE }) so it
 * hears company replies and not, say, ledger ones. It is exported from here -
 * next to the rest of the company code - because socketService deliberately
 * knows nothing about any module.
 */
export const COMPANY_SOCKET_MODULE = 'Gcompany_id'

/**
 * The payload behind the header's Refresh button: "re-read the company I am
 * working in".
 *
 *   {
 *     "res": { "message": {
 *       "module": "Gcompany_id",
 *       "new_company": "active",
 *       "company_id": "418",            <- the selected company, or ""
 *       "company_name": "ABC Traders"   <-        "         "      ""
 *     } }
 *   }
 *
 * The selected company is read from storage, which is where
 * selectIntelligereCompany() above writes it - so the header does not have to
 * hold that state, and a reload cannot lose it. With no company selected both
 * fields are sent empty, exactly as the old project did, and the backend falls
 * back to whatever the session says.
 *
 * Building the payload HERE, and not in the header or in socketService, is
 * what lets the next module (ledger, and so on) add its own builder without
 * touching either of them.
 */
export const buildActiveCompanyMessage = () => {
  const companyId = getItem(STORAGE_KEYS.ACTIVE_COMPANY_ID)
  const companyName = getItem(STORAGE_KEYS.ACTIVE_COMPANY_NAME)

  return {
    res: {
      message: {
        module: COMPANY_SOCKET_MODULE,
        new_company: 'active',
        company_id: companyId ? String(companyId) : '',
        company_name: companyName || '',
      },
    },
  }
}

/**
 * The user's companies, and the one they are working in - the app's ONE
 * source of truth for both.
 *
 * WHY THIS IS IN THE STORE
 * The company decides what every other screen is about: bank details, ledgers
 * and products all belong to one company. It is loaded once here, by
 * AppLayout (and reloaded by anything that changes it - the header's Tally
 * Refresh, a company switch, an add or delete), and read wherever needed:
 *
 *   const { activeCompany, activeCompanyName, activeCompanyId, allCompanies } =
 *     useActiveCompany()                      // @/Hooks/useActiveCompany
 *
 *   const companyId = useSelector(selectActiveCompanyId)   // or one value
 *
 * TWO RULES FOR "ACTIVE", NEVER MIXED (selectActiveCompanyRule)
 *
 *   Tally + Gold      the company the user picked in the header. Its
 *                     company_id is kept in secure storage (and mirrored in
 *                     `storedCompanyId` below so screens re-render); the
 *                     API's is_active is ignored.
 *   everyone else     the company the API marks is_active === true
 *   (Silver too)
 *
 * Every value above is derived from the list by getActiveCompanyInfo
 * (companyService). Nothing matched means no active company (null) - never
 * the first in the list.
 *
 * For the is_active rule, storage only mirrors the active company_id for
 * authService's `activecompanyid` request header (useActiveCompanyStorageSync).
 * For Gold, only the user's pick writes it.
 */

import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit'

import { ENV } from '@/Config/env'
import { getActiveCompanyId } from '@/Library/secureStorage'
import {
  ACTIVE_COMPANY_RULE,
  getActiveCompanyInfo,
  getUserCompanies,
  rememberSelectedCompany,
} from '@/Services/companyService'
import {
  selectErp,
  selectIsGoldTally,
  selectProfile,
  selectProfileStatus,
  selectTallyCategory,
} from '@/Store/Slices/profileSlice'

/** A browser-console line about the company list (ENV.DEBUG_LOGS). */
const debug = (...args) => {
  if (ENV.DEBUG_LOGS) console.log('[Company List]', ...args)
}

/** A browser-console line about the active company (ENV.DEBUG_LOGS). */
const companyDebug = (...args) => {
  if (ENV.DEBUG_LOGS) console.log('[Company]', ...args)
}

/* ------------------------------------------------------------------ */
/* 1. Loading the companies                                           */
/* ------------------------------------------------------------------ */

/**
 * POST tally/user-companies-list/  with the signed-in user's email.
 *
 *   dispatch(fetchCompanies())                  load them once
 *   dispatch(fetchCompanies({ force: true }))   reload on purpose
 *
 * Like fetchProfile, this can be dispatched as often as a screen likes: the
 * `condition` below stops a second request while one is already in flight,
 * or once the list is in the store. See the longer note in profileSlice for
 * why a check inside useEffect cannot do that job.
 */
export const fetchCompanies = createAsyncThunk(
  'company/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const companies = await getUserCompanies()
      debug('Response:', companies)

      // The active company is NOT decided here: it depends on the profile
      // (Gold or not), which may still be loading. The selectors below work
      // it out, and useActiveCompanyStorageSync logs it whenever it changes.
      // Nothing is written to storage here either, so a reload can never
      // overwrite a Gold user's pick.
      return companies
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      console.error('[Company List] Failed:', error)
      return rejectWithValue(error.message)
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true

      const { status } = getState().company
      return status !== 'loading' && status !== 'succeeded'
    },
  },
)

/* ------------------------------------------------------------------ */
/* 2. The slice                                                       */
/* ------------------------------------------------------------------ */

/** A fresh state. A function, so the stored id is read at the time, not at import. */
const createInitialState = () => ({
  // Every company the user has, as the API returned them. Empty until loaded.
  companies: [],
  // The company_id a Gold user picked - read from secure storage on start
  // (so a reload restores it), and updated with storage by
  // selectStoredCompany. Only the Gold rule reads it.
  storedCompanyId: getActiveCompanyId(),
  // 'idle' | 'loading' | 'succeeded' | 'failed'
  status: 'idle',
  // The message to display when status is 'failed'.
  error: null,
  // The newest request. An older reload that answers late is ignored, so a
  // stale list can never replace a fresher one.
  latestRequestId: null,
})

const companySlice = createSlice({
  name: 'company',
  initialState: createInitialState,

  reducers: {
    /**
     * The user switched company in the header (Intelligere).
     *
     * Marks that company `is_active` - and every other one not - exactly as
     * the backend's switch call does, so the whole app moves at once. The
     * picker then reloads the list to confirm it from the backend, and puts
     * the previous company back with this same action if the switch fails.
     *
     * Takes a company_id (or null for "none").
     */
    markActiveCompany: (state, action) => {
      state.companies.forEach((company) => {
        company.is_active = company.company_id === action.payload
      })
    },

    /**
     * The id kept in secure storage changed. Dispatched by selectStoredCompany,
     * which writes storage first - use that, not this.
     */
    storedCompanyChanged: (state, action) => {
      state.storedCompanyId = action.payload ?? null
    },

    /**
     * A company was deleted: take it out of the list straight away, so it is
     * not left on screen while the reload that follows is on its way. If it
     * was the active company, there is none until that reload says otherwise.
     */
    removeCompany: (state, action) => {
      state.companies = state.companies.filter((company) => company.company_id !== action.payload)
    },

    // Called on logout, so the next user never sees the last one's companies.
    clearCompanies: () => ({ ...createInitialState(), storedCompanyId: null }),
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchCompanies.pending, (state, action) => {
        state.status = 'loading'
        state.error = null
        state.latestRequestId = action.meta.requestId
      })
      .addCase(fetchCompanies.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return
        state.status = 'succeeded'
        state.companies = action.payload
      })
      .addCase(fetchCompanies.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return
        state.status = 'failed'
        state.error = action.payload || 'Could not load your companies.'
      })
  },
})

export const { markActiveCompany, storedCompanyChanged, removeCompany, clearCompanies } =
  companySlice.actions
export default companySlice.reducer

/**
 * A Gold Tally user picked a company in the header.
 *
 * Replaces the id in secure storage (there is only ever one), then tells the
 * store - so every screen reading the active company moves to it at once, and
 * a reload comes back to it.
 */
export const selectStoredCompany = (company) => (dispatch) => {
  const companyId = company?.company_id ?? null

  companyDebug('Company changed:', company)
  companyDebug('Previous stored Active Company ID:', getActiveCompanyId())
  rememberSelectedCompany(company)
  companyDebug('New Active Company ID:', companyId)

  dispatch(storedCompanyChanged(companyId))
}

/* ------------------------------------------------------------------ */
/* 3. Selectors                                                       */
/* ------------------------------------------------------------------ */

export const selectCompanyStatus = (state) => state.company.status
export const selectCompanyError = (state) => state.company.error

/** Every company, exactly as the API returned them. */
export const selectAllCompanies = (state) => state.company.companies

/** The company_id a Gold user picked (from secure storage), or null. */
export const selectStoredCompanyId = (state) => state.company.storedCompanyId

/**
 * Which rule decides the active company - see ACTIVE_COMPANY_RULE.
 *
 * UNKNOWN only while the profile is still on its way: a Gold user must not be
 * shown the is_active company first. If the profile could not be loaded, the
 * is_active rule is used, as before.
 */
export const selectActiveCompanyRule = (state) => {
  if (selectIsGoldTally(state)) return ACTIVE_COMPANY_RULE.STORED
  if (selectProfile(state)) return ACTIVE_COMPANY_RULE.IS_ACTIVE

  const status = selectProfileStatus(state)
  return status === 'failed' ? ACTIVE_COMPANY_RULE.IS_ACTIVE : ACTIVE_COMPANY_RULE.UNKNOWN
}

/**
 * { activeCompany, activeCompanyName, activeCompanyId, allCompanies }
 *
 * Memoised: the same object comes back until the list, the rule or the stored
 * id changes, so a component reading it does not re-render for nothing.
 */
export const selectActiveCompanyInfo = createSelector(
  [selectAllCompanies, selectActiveCompanyRule, selectStoredCompanyId],
  (companies, rule, storedCompanyId) => getActiveCompanyInfo(companies, { rule, storedCompanyId }),
)

/** What the console log of the active company needs, in one place. */
export const selectCompanyDebugInfo = createSelector(
  [selectErp, selectTallyCategory, selectIsGoldTally, selectActiveCompanyRule, selectStoredCompanyId],
  (erp, tallyCategory, isGoldTally, rule, storedCompanyId) => ({
    erp,
    tallyCategory,
    isGoldTally,
    rule,
    storedCompanyId,
  }),
)

/** The whole record of the company with `is_active: true`, or null. */
export const selectActiveCompany = (state) => selectActiveCompanyInfo(state).activeCompany

/** Its `comp_name`, or '' when there is no active company. */
export const selectActiveCompanyName = (state) => selectActiveCompanyInfo(state).activeCompanyName

/**
 * Its `company_id`, or null - what an API call about "this company" needs.
 * Null also while the list is still loading, which is the signal a screen
 * uses to wait before fetching its own data.
 */
export const selectActiveCompanyId = (state) => selectActiveCompanyInfo(state).activeCompanyId

/**
 * The user's companies, and the one they are working in.
 *
 * WHY THIS IS IN THE STORE
 * The company decides what every other screen is about: bank details, ledgers
 * and products all belong to one company. Before this slice the header held
 * that list in its own state, so nothing else could read it and each new
 * screen would have fetched the companies again. It is loaded once here, by
 * AppLayout, and read with a selector wherever it is needed:
 *
 *   const company = useSelector(selectSelectedCompany)
 *   const companyId = useSelector(selectSelectedCompanyId)
 *
 * Built the same way as profileSlice: a thunk for the API call, a slice to
 * hold what comes back, and selectors for the screens.
 *
 * ONE SOURCE OF TRUTH FOR THE SELECTION
 * The slice holds the list and the selected company's `company_id` - not a
 * second copy of the selected company's record. selectSelectedCompany looks
 * that record up in the list, so there is no way for "the selected company"
 * and "that company in the list" to disagree. Storage holds the same
 * company_id (see rememberSelectedCompany), and nothing else about it.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getActiveCompanyId } from '@/Library/secureStorage'
import {
  findActiveCompany,
  getUserCompanies,
  rememberSelectedCompany,
} from '@/Services/companyService'

/* ------------------------------------------------------------------ */
/* 1. Loading the companies                                           */
/* ------------------------------------------------------------------ */

/**
 * Which company to open with.
 *
 * `is_active` is the backend's own answer, and it is what the switch call
 * sets - so it already carries the choice the user made last time, on this
 * machine or any other. It is looked FOR, never taken from index 0.
 *
 * The company_id saved in storage is only a fallback, for the moment after a
 * switch when the backend has not marked the new company yet. (A value left
 * by an older build is never used here - getActiveCompanyId discards it.)
 *
 * Both can come up empty - an account with companies but none opened. That
 * is a real state, not an error: null is returned and the screens say so.
 */
const pickDefaultCompany = (companies) => {
  const active = findActiveCompany(companies)
  if (active) return active

  const savedId = getActiveCompanyId()
  if (savedId != null) {
    // Compared as text, so a company_id that round-tripped through storage
    // as "2" still matches the list's 2.
    const match = companies.find((company) => String(company.company_id) === String(savedId))
    if (match) return match
  }

  return null
}

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
      const selected = pickDefaultCompany(companies)

      // Written here rather than in the reducer, so the reducer stays a
      // plain "put this in state" function with no side effects. Storage
      // matters beyond a reload: authService sends the saved company_id as
      // the `activecompanyid` header.
      rememberSelectedCompany(selected)

      return { companies, selectedId: selected?.company_id ?? null }
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
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

const initialState = {
  // Every company the user has. Empty until loaded.
  companies: [],
  // The `company_id` of the one being worked in, or null. The record itself
  // is looked up in `companies` - see selectSelectedCompany.
  selectedId: null,
  // 'idle' | 'loading' | 'succeeded' | 'failed'
  status: 'idle',
  // The message to display when status is 'failed'.
  error: null,
}

const companySlice = createSlice({
  name: 'company',
  initialState,

  reducers: {
    /**
     * The user picked a company in the header.
     *
     * This only moves the app into it. Telling the BACKEND about the switch
     * is a separate API call the header makes (selectIntelligereCompany),
     * which is also what writes the choice to storage - so a failed switch
     * can be undone by dispatching this again with the old company.
     *
     * Takes the company record (what the picker has in hand) and keeps only
     * its company_id.
     */
    setSelectedCompany: (state, action) => {
      state.selectedId = action.payload?.company_id ?? null
    },

    /**
     * A company was deleted: take it out of the list straight away, so it is
     * not left on screen while the reload that follows is on its way. If it
     * was the selected company, nothing is selected until that reload picks
     * again (see pickDefaultCompany).
     */
    removeCompany: (state, action) => {
      state.companies = state.companies.filter((company) => company.company_id !== action.payload)
      if (state.selectedId === action.payload) state.selectedId = null
    },

    // Called on logout, so the next user never sees the last one's companies.
    clearCompanies: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchCompanies.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchCompanies.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.companies = action.payload.companies
        state.selectedId = action.payload.selectedId
      })
      .addCase(fetchCompanies.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload || 'Could not load your companies.'
      })
  },
})

export const { setSelectedCompany, removeCompany, clearCompanies } = companySlice.actions
export default companySlice.reducer

/* ------------------------------------------------------------------ */
/* 3. Selectors                                                       */
/* ------------------------------------------------------------------ */

export const selectCompanies = (state) => state.company.companies
export const selectCompanyStatus = (state) => state.company.status
export const selectCompanyError = (state) => state.company.error

/**
 * The selected company's `company_id` - what an API call actually needs.
 *
 * This is the one a module should read, so no screen ever hardcodes a
 * company id, or reaches for a field of the record by hand:
 *
 *   const companyId = useSelector(selectSelectedCompanyId)
 *
 * It is null until the companies have loaded, which is exactly the signal a
 * screen uses to wait before fetching its own data.
 */
export const selectSelectedCompanyId = (state) => state.company.selectedId

/**
 * The whole record of the company being worked in (its name, GST number and
 * so on), or null - looked up in the list by company_id.
 *
 * `find` hands back the object already in the store, so this returns the
 * same reference until the list itself changes and does not re-render
 * anything on its own.
 */
export const selectSelectedCompany = (state) => {
  const { companies, selectedId } = state.company
  if (selectedId == null) return null
  return companies.find((company) => company.company_id === selectedId) ?? null
}

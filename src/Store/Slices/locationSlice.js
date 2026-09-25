/**
 * The country / state / city list, fetched once and shared.
 *
 * It is reference data: the same for every user, every company and every
 * screen, and large enough that asking for it again each time a form opens
 * would be wasteful. So it is loaded on the first screen that needs it and
 * read from the store by every screen after that - exactly as the ledger
 * groups and the bank names are (see ledgerSlice, bankSlice).
 *
 *   dispatch(fetchCountries())               load it, if it is not already here
 *   dispatch(fetchCountries({ force: true })) load it again anyway
 *
 *   const countryData = useSelector(selectCountryData)
 *   const countries = useMemo(() => getCountries(countryData), [countryData])
 *
 * The digging into the response's `state_city` is NOT done here - it is in
 * Services/locationService, so the same three questions (which countries,
 * which states, which cities) are answered the same way wherever they are
 * asked. This slice only holds the answer to the request; see the note above
 * the selectors for why it does not slice it up as well.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getCountryList } from '@/Services/locationService'

/* ------------------------------------------------------------------ */
/* Loading                                                            */
/* ------------------------------------------------------------------ */

export const fetchCountries = createAsyncThunk(
  'location/fetchCountries',
  async (_, { rejectWithValue }) => {
    try {
      return await getCountryList()
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      return rejectWithValue(error.message)
    }
  },
  {
    /**
     * Returning false cancels the thunk before it makes a request, which is
     * what lets every screen say "I need this" without any of them having to
     * know whether another already asked:
     *
     *   loading    one is on its way; wait for it
     *   succeeded  we have it - it does not change
     *   failed     let it be tried again
     */
    condition: ({ force } = {}, { getState }) => {
      const { status } = getState().location
      if (force) return true
      return status !== 'loading' && status !== 'succeeded'
    },
  },
)

/* ------------------------------------------------------------------ */
/* The slice                                                          */
/* ------------------------------------------------------------------ */

const initialState = {
  // The whole response: one entry per country, each with its own state_city.
  items: [],
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
}

const locationSlice = createSlice({
  name: 'location',
  initialState,

  reducers: {
    // Called on logout, so nothing is kept from the last session.
    clearCountries: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchCountries.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchCountries.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload
      })
      .addCase(fetchCountries.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload || 'Could not load the country list.'
      })
  },
})

export const { clearCountries } = locationSlice.actions
export default locationSlice.reducer

/* ------------------------------------------------------------------ */
/* Selectors                                                          */
/* ------------------------------------------------------------------ */

/**
 * The whole list, as it came. ONE reference, which changes only when the
 * data does - so a screen can safely read it with useSelector.
 *
 * There is deliberately NO selectCountries / selectStatesOf / selectCitiesOf
 * here. Each of those would have to build a new array, and a selector that
 * returns a new array every time never matches the previous one: the screen
 * would then re-render on every change to any part of the store (the hazard
 * written up at the foot of profileSlice). A screen reads the raw list with
 * the selector below and works the three lists out from it with useMemo,
 * using getCountries / getStates / getCities from Services/locationService -
 * see the Ledger Form.
 */
export const selectCountryData = (state) => state.location.items
export const selectCountryStatus = (state) => state.location.status
export const selectCountryError = (state) => state.location.error

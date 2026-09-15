/**
 * The bank accounts of the company the user is working in.
 *
 * WHY THIS IS IN THE STORE
 * The list was fetched by the Bank Details component itself, which meant it
 * was fetched again every time that component mounted - leaving the page and
 * coming back, or React remounting it for any reason. Here it is fetched
 * ONCE and read with a selector:
 *
 *   const banks = useSelector(selectBanks)
 *
 * Built exactly like companySlice: a thunk per call, a `condition` that
 * refuses a duplicate request, and selectors for the screens.
 *
 * ------------------------------------------------------------------
 * A RE-RENDER IS NOT A REQUEST
 * ------------------------------------------------------------------
 * Screens dispatch `fetchBanks({ companyId })` whenever they think they need
 * the data - on mount, every mount. The `condition` below is what decides
 * whether that actually costs a request, and it says no unless:
 *
 *   - nothing has been loaded yet, or
 *   - what is loaded belongs to a DIFFERENT company, or
 *   - the caller passed { force: true } (after a create/update/delete).
 *
 * Deciding it here rather than in a component is the whole point: reducers
 * run synchronously inside dispatch, so two screens asking at the same
 * moment still produce one request.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getBankDetails, getBankList } from '@/Services/bankService'

/* ------------------------------------------------------------------ */
/* 1. The bank accounts                                               */
/* ------------------------------------------------------------------ */

/**
 * The list for one company.
 *
 *   dispatch(fetchBanks({ companyId }))                 load it if needed
 *   dispatch(fetchBanks({ companyId, force: true }))    reload after a save
 */
export const fetchBanks = createAsyncThunk(
  'bank/fetch',
  async ({ companyId }, { rejectWithValue }) => {
    try {
      const items = await getBankDetails(companyId)
      return { items, companyId }
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      return rejectWithValue(error.message)
    }
  },
  {
    condition: ({ companyId, force } = {}, { getState }) => {
      // Without a company there is nothing to ask for.
      if (!companyId) return false

      const { status, companyId: loadedFor } = getState().bank

      // One request at a time, whatever anyone asks for.
      if (status === 'loading') return false
      if (force) return true

      // Already have this company's accounts - asking again is wasted.
      return !(status === 'succeeded' && loadedFor === companyId)
    },
  },
)

/* ------------------------------------------------------------------ */
/* 2. What fills the form's dropdowns                                 */
/* ------------------------------------------------------------------ */

/**
 * The bank names behind the Bank Form's Bank Name dropdown (and the Ledger
 * form's).
 *
 * Reference data - the same for every company and every visit - so it is
 * fetched once per session and never again. Before this it was fetched by the
 * form itself, which meant a request every time the form was opened; that is
 * exactly what this slice exists to stop.
 *
 * The Bank Ledger dropdown is NOT loaded here: it lists the company's real
 * ledgers, which live in ledgerSlice.
 */
export const fetchBankOptions = createAsyncThunk(
  'bank/fetchOptions',
  async (_, { rejectWithValue }) => {
    try {
      return { names: await getBankList() }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true

      const { optionsStatus } = getState().bank
      return optionsStatus !== 'loading' && optionsStatus !== 'succeeded'
    },
  },
)

/* ------------------------------------------------------------------ */
/* 3. The slice                                                       */
/* ------------------------------------------------------------------ */

const initialState = {
  // The accounts, and which company they belong to - the second is what
  // lets `condition` above tell "already loaded" from "loaded for someone
  // else".
  items: [],
  companyId: null,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,

  // The Bank Name dropdown.
  names: [],
  optionsStatus: 'idle',
  optionsError: null,
}

const bankSlice = createSlice({
  name: 'bank',
  initialState,

  reducers: {
    // Called on logout, so the next user never sees the last one's accounts.
    clearBanks: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      // ---- the accounts ----
      .addCase(fetchBanks.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchBanks.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload.items
        state.companyId = action.payload.companyId
      })
      .addCase(fetchBanks.rejected, (state, action) => {
        state.status = 'failed'
        // The rows already in the store are LEFT ALONE: a refresh that could
        // not reach the server is no reason to throw away accounts the user
        // can still read.
        state.error = action.payload || 'Could not load bank details.'
      })

      // ---- the dropdowns ----
      .addCase(fetchBankOptions.pending, (state) => {
        state.optionsStatus = 'loading'
        state.optionsError = null
      })
      .addCase(fetchBankOptions.fulfilled, (state, action) => {
        state.optionsStatus = 'succeeded'
        state.names = action.payload.names
      })
      .addCase(fetchBankOptions.rejected, (state, action) => {
        state.optionsStatus = 'failed'
        state.optionsError = action.payload || 'Could not load the form options.'
      })
  },
})

export const { clearBanks } = bankSlice.actions
export default bankSlice.reducer

/* ------------------------------------------------------------------ */
/* 4. Selectors                                                       */
/* ------------------------------------------------------------------ */

export const selectBanks = (state) => state.bank.items
export const selectBankStatus = (state) => state.bank.status
export const selectBankError = (state) => state.bank.error

export const selectBankNames = (state) => state.bank.names
export const selectBankOptionsStatus = (state) => state.bank.optionsStatus
export const selectBankOptionsError = (state) => state.bank.optionsError

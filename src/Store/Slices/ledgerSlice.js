/**
 * The ledgers of the company the user is working in, and the groups they
 * belong to.
 *
 * The same shape as bankSlice, for the same reason: the list used to be
 * fetched by the Ledger Details component, so it was fetched again on every
 * mount. Here it is fetched once and read with a selector:
 *
 *   const ledgers = useSelector(selectLedgers)
 *   const groups = useSelector(selectLedgerGroups)
 *
 * See the note at the top of bankSlice for why the `condition` on each thunk
 * is what makes "a re-render is not a request" true.
 *
 * The two lists are kept apart on purpose: ledgers belong to ONE company and
 * are reloaded when it changes, while the groups are the same for everybody
 * and are fetched once per session.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getLedgerGroups, getLedgers } from '@/Services/ledgerService'

/* ------------------------------------------------------------------ */
/* 1. The ledgers                                                     */
/* ------------------------------------------------------------------ */

/**
 *   dispatch(fetchLedgers({ companyId }))                load it if needed
 *   dispatch(fetchLedgers({ companyId, force: true }))   reload after a save
 */
export const fetchLedgers = createAsyncThunk(
  'ledger/fetch',
  async ({ companyId }, { rejectWithValue }) => {
    try {
      const items = await getLedgers(companyId)
      return { items, companyId }
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      return rejectWithValue(error.message)
    }
  },
  {
    condition: ({ companyId, force } = {}, { getState }) => {
      if (!companyId) return false

      const { status, companyId: loadedFor } = getState().ledger

      if (status === 'loading') return false
      if (force) return true

      // Already have this company's ledgers - asking again is wasted.
      return !(status === 'succeeded' && loadedFor === companyId)
    },
  },
)

/* ------------------------------------------------------------------ */
/* 2. The ledger groups                                               */
/* ------------------------------------------------------------------ */

/**
 * The groups behind the form's dropdown - and behind the Group column,
 * because a ledger row carries only the group's ID.
 *
 * Reference data: the same for every company, so it is fetched once per
 * session and shared by the table and the form rather than being asked for
 * each time the form opens.
 */
export const fetchLedgerGroups = createAsyncThunk(
  'ledger/fetchGroups',
  async (_, { rejectWithValue }) => {
    try {
      return await getLedgerGroups()
    } catch (error) {
      return rejectWithValue(error.message)
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true

      const { groupsStatus } = getState().ledger
      return groupsStatus !== 'loading' && groupsStatus !== 'succeeded'
    },
  },
)

/* ------------------------------------------------------------------ */
/* 3. The slice                                                       */
/* ------------------------------------------------------------------ */

const initialState = {
  items: [],
  companyId: null,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,

  groups: [],
  groupsStatus: 'idle',
  groupsError: null,
}

const ledgerSlice = createSlice({
  name: 'ledger',
  initialState,

  reducers: {
    // Called on logout, so the next user never sees the last one's ledgers.
    clearLedgers: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      // ---- the ledgers ----
      .addCase(fetchLedgers.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchLedgers.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload.items
        state.companyId = action.payload.companyId
      })
      .addCase(fetchLedgers.rejected, (state, action) => {
        state.status = 'failed'
        // The rows already in the store are left alone - see bankSlice.
        state.error = action.payload || 'Could not load ledgers.'
      })

      // ---- the groups ----
      .addCase(fetchLedgerGroups.pending, (state) => {
        state.groupsStatus = 'loading'
        state.groupsError = null
      })
      .addCase(fetchLedgerGroups.fulfilled, (state, action) => {
        state.groupsStatus = 'succeeded'
        state.groups = action.payload
      })
      .addCase(fetchLedgerGroups.rejected, (state, action) => {
        state.groupsStatus = 'failed'
        state.groupsError = action.payload || 'Could not load ledger groups.'
      })
  },
})

export const { clearLedgers } = ledgerSlice.actions
export default ledgerSlice.reducer

/* ------------------------------------------------------------------ */
/* 4. Selectors                                                       */
/* ------------------------------------------------------------------ */

export const selectLedgers = (state) => state.ledger.items
export const selectLedgerStatus = (state) => state.ledger.status
export const selectLedgerError = (state) => state.ledger.error
/** Which company the ledgers in the store belong to - see BankDetails. */
export const selectLedgersCompanyId = (state) => state.ledger.companyId

export const selectLedgerGroups = (state) => state.ledger.groups
export const selectLedgerGroupsStatus = (state) => state.ledger.groupsStatus
export const selectLedgerGroupsError = (state) => state.ledger.groupsError

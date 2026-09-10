/**
 * Referrals - the people this user invited.
 *
 * MSME ONLY. Referrals are an MSME feature, so nothing here is fetched or
 * shown for an Accounting Professional. The profile page checks
 * `selectIsMsme` (in profileSlice) before it asks for any of this.
 *
 * Built the same way as profileSlice: a thunk for the API call, a slice to
 * hold what comes back, and selectors for the screens.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getUuid } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

/* ------------------------------------------------------------------ */
/* 1. The API call                                                    */
/* ------------------------------------------------------------------ */

/**
 * GET useraccount/referral/
 *
 * Answers with a list, one entry per person invited:
 *   { id, Referred_to, Referred_from, is_paid, created_at, payment_at }
 *
 * An empty list is a perfectly normal answer - it means nobody has signed
 * up through this user's link yet.
 *
 *   dispatch(fetchReferrals())                  load them once
 *   dispatch(fetchReferrals({ force: true }))   reload on purpose
 *
 * Like fetchProfile, this can be dispatched as often as a screen likes: the
 * `condition` below stops a second request while one is already in flight,
 * or once the list is already in the store. See the longer note in
 * profileSlice for why a check inside useEffect cannot do that job.
 */
export const fetchReferrals = createAsyncThunk(
  'referral/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const data = await api.get('useraccount/referral/')

      // Guard against a single object or a null: the screen maps over this,
      // and mapping over anything but an array would crash the page.
      return Array.isArray(data) ? data : []
    } catch (error) {
      return rejectWithValue(error.message)
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true

      const { status } = getState().referral
      return status !== 'loading' && status !== 'succeeded'
    },
  },
)

/* ------------------------------------------------------------------ */
/* 2. The slice                                                       */
/* ------------------------------------------------------------------ */

const initialState = {
  list: [],
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
}

const referralSlice = createSlice({
  name: 'referral',
  initialState,
  reducers: {
    clearReferrals: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReferrals.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchReferrals.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.list = action.payload
      })
      .addCase(fetchReferrals.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload || 'Could not load referrals.'
      })
  },
})

export const { clearReferrals } = referralSlice.actions
export default referralSlice.reducer

/* ------------------------------------------------------------------ */
/* 3. Selectors                                                       */
/* ------------------------------------------------------------------ */

export const selectReferrals = (state) => state.referral.list
export const selectReferralStatus = (state) => state.referral.status
export const selectReferralError = (state) => state.referral.error

/**
 * The link this user shares to invite somebody.
 *
 * It is the register page with this user's uuid on the end, so whoever
 * signs up through it is recorded against them:
 *
 *   https://app.example.com/register/8f2c...
 *
 * Built from window.location so it is right in every environment - local,
 * staging and live - without a setting to keep in step.
 */
export const buildReferralLink = () => {
  const uuid = getUuid()
  if (!uuid) return ''

  return `${window.location.protocol}//${window.location.host}/register/${uuid}`
}

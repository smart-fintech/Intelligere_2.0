/**
 * The signed-in user's profile.
 *
 * WHAT A SLICE IS
 * A slice is one box of shared data plus the code that changes it. This one
 * owns everything the profile API returns, so any screen can read the user's
 * name, role or plan without fetching it again.
 *
 * THE PIECES BELOW
 *   1. fetchProfile       - loads the profile   (an "async thunk": an
 *                           action that waits for an API call)
 *   2. updateProfileField - saves one edited field back
 *   3. the slice          - holds the data and reacts to those two
 *   4. selectors          - the small read-functions screens use
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getUuid } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

/* ------------------------------------------------------------------ */
/* 1. Loading the profile                                             */
/* ------------------------------------------------------------------ */

/**
 * POST useraccount/profile/  with  { identifier: <uuid> }
 *
 * The uuid is read from localStorage, where it was saved at login, so a
 * caller just writes `dispatch(fetchProfile())` and passes nothing.
 *
 *   dispatch(fetchProfile())                    the signed-in user
 *   dispatch(fetchProfile(someUuid))            somebody else's profile
 *   dispatch(fetchProfile({ force: true }))     reload it even if we have it
 *
 * ------------------------------------------------------------------
 * ASK AS OFTEN AS YOU LIKE - ONLY ONE REQUEST IS EVER SENT
 * ------------------------------------------------------------------
 * Several parts of the app need the profile: the shell loads it so the
 * header knows which ERP the user is on, the profile page shows it, and
 * login kicks it off early. If each of them had to check "has somebody
 * already asked for this?" first, they would all get it slightly wrong -
 * and they did: a `status === 'idle'` check inside a useEffect reads the
 * status from THAT RENDER, which is still 'idle' when React re-runs the
 * effect (as it deliberately does in development), so the guard passes
 * twice and the call goes out twice. Two components doing that made four
 * requests on every page load.
 *
 * The `condition` below settles it in the one place that cannot be raced:
 * the reducers run synchronously inside dispatch, so by the time a second
 * dispatch asks, the status already says 'loading' and the thunk simply
 * does not start. Callers can now just say what they need.
 */

/**
 * The argument, whichever way it was passed.
 * A bare string is the uuid - that is how this thunk was first written and
 * it still works.
 */
const readFetchArgs = (arg) => (typeof arg === 'string' ? { identifier: arg } : arg || {})

export const fetchProfile = createAsyncThunk(
  'profile/fetch',
  async (arg, { rejectWithValue }) => {
    const uuid = readFetchArgs(arg).identifier || getUuid()

    // Without a uuid the call would fail on the server anyway, so stop here
    // with a message that says what is actually wrong.
    if (!uuid) return rejectWithValue('No user id was saved at login.')

    try {
      return await api.post('useraccount/profile/', { identifier: uuid })
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      // rejectWithValue is how a thunk reports a handled failure, so the
      // reducer below receives the message instead of a raw Error.
      return rejectWithValue(error.message)
    }
  },
  {
    /**
     * Returning false here cancels the thunk before it makes a request -
     * nothing is dispatched, and the caller's promise resolves as aborted.
     *
     *   loading    one is already on its way; wait for that one
     *   succeeded  we have it, so asking again is wasted - unless the
     *              caller passed { force: true }, which is how a refresh
     *              button reloads it on purpose
     *   failed     let it be retried
     *   idle       nobody has asked yet: go
     *
     * Loading somebody ELSE's profile is always allowed through, since the
     * status in the store is about a different person.
     */
    condition: (arg, { getState }) => {
      const { identifier, force } = readFetchArgs(arg)
      if (identifier || force) return true

      const { status } = getState().profile
      return status !== 'loading' && status !== 'succeeded'
    },
  },
)

/* ------------------------------------------------------------------ */
/* 2. Saving one edited field                                         */
/* ------------------------------------------------------------------ */

/**
 * PUT useraccount/profile/  with  { id, <field>: <value> }
 *
 * Called when the user finishes editing one row on the profile page. Only
 * the changed field goes up, together with the user id the profile was
 * loaded with - the id is read from the store here, so the screen does not
 * have to pass it.
 *
 * `section` says where the field lives in the response, so the store can be
 * updated without re-fetching the whole profile:
 *   'root'            -> profile.<field>            e.g. tm_user_type
 *   'profile_details' -> profile.profile_details.<field>   e.g. mobile
 *
 * Usage:
 *   dispatch(updateProfileField({ field: 'mobile', value, section: 'profile_details' }))
 */
export const updateProfileField = createAsyncThunk(
  'profile/updateField',
  async ({ field, value, section = 'profile_details' }, { identifier, getState, rejectWithValue }) => {
    const uuid = identifier || getUuid()

    console.info("profile: ", getState().profile.data);
    if (!uuid) return rejectWithValue('The profile has not been loaded yet.')

    try {
      await api.put('useraccount/profile/', { identifier: uuid, [field]: value })

      // Handed to the reducer below so it can update the copy in the store.
      return { field, value, section }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  },
)

/* ------------------------------------------------------------------ */
/* 3. The slice                                                       */
/* ------------------------------------------------------------------ */

const initialState = {
  // The whole response body, exactly as the API sent it. Null until loaded.
  data: null,
  // 'idle' | 'loading' | 'succeeded' | 'failed' - what the screen shows.
  status: 'idle',
  // The message to display when status is 'failed'.
  error: null,
  // The name of the field currently being saved, or null. The row that is
  // saving uses this to disable itself while the PUT is in flight.
  savingField: null,
}

const profileSlice = createSlice({
  name: 'profile',
  initialState,

  // Plain actions - things that change the data without an API call.
  reducers: {
    // Called on logout, so the next user never sees the last one's details.
    clearProfile: () => initialState,
  },

  // Reactions to the two thunks. Redux Toolkit fires one of three cases for
  // each: pending when it starts, then fulfilled or rejected.
  extraReducers: (builder) => {
    builder
      // ---- loading ----
      .addCase(fetchProfile.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.status = 'succeeded'
        // action.payload is whatever the thunk returned - the response body.
        state.data = action.payload
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload || 'Could not load the profile.'
      })

      // ---- saving one field ----
      .addCase(updateProfileField.pending, (state, action) => {
        state.savingField = action.meta.arg.field
      })
      .addCase(updateProfileField.fulfilled, (state, action) => {
        const { field, value, section } = action.payload
        state.savingField = null

        // Write the new value straight into the copy already in the store,
        // so the page shows it at once with no second API call.
        if (!state.data) return

        if (section === 'root') state.data[field] = value
        else if (state.data[section]) state.data[section][field] = value
      })
      .addCase(updateProfileField.rejected, (state) => {
        // The screen shows the message; the old value simply stays put.
        state.savingField = null
      })
  },
})

export const { clearProfile } = profileSlice.actions
export default profileSlice.reducer

/* ------------------------------------------------------------------ */
/* 4. Selectors                                                       */
/* ------------------------------------------------------------------ */

/**
 * A selector is just "how to find one thing in the store". Screens use them
 * with useSelector, e.g.
 *
 *   const profile = useSelector(selectProfile)
 *
 * Keeping them here means that if the shape of the data ever changes, the
 * screens do not - only these lines do.
 */
export const selectProfile = (state) => state.profile.data
export const selectProfileStatus = (state) => state.profile.status
export const selectProfileError = (state) => state.profile.error
export const selectSavingField = (state) => state.profile.savingField

/**
 * ONE shared empty object, used as the fallback by the three selectors
 * below - and it matters that it is shared.
 *
 * useSelector re-renders the screen whenever the selector returns something
 * DIFFERENT from last time, and it compares by reference. Writing
 * `|| {}` inside a selector builds a brand new object on every call, so it
 * never matches the previous one, the screen re-renders forever, and
 * react-redux warns about it in the console.
 *
 * Returning this same constant every time means the reference does not
 * change, so nothing re-renders until the real data arrives.
 *
 * It is frozen so a stray write can never leak into another screen.
 */
const EMPTY = Object.freeze({})

// The nested blocks, each falling back to EMPTY so a screen can safely read
// `.name` off them before the data has arrived.
export const selectProfileDetails = (state) => state.profile.data?.profile_details || EMPTY
export const selectPaymentDetails = (state) => state.profile.data?.payment_details || EMPTY
export const selectOthersDetails = (state) => state.profile.data?.others_details || EMPTY

/**
 * True when the signed-in user is an MSME.
 *
 * The referral section on the profile page is the only thing that uses this
 * today: referrals are an MSME feature, and an Accounting Professional
 * never sees them.
 */
export const selectIsMsme = (state) =>
  state.profile.data?.profile_details?.user_type === 'MSME'

/** Which ERP this user runs - "Tally" or "Intelligere". */
export const selectErp = (state) => state.profile.data?.profile_details?.erp

/**
 * True when the signed-in user is on Intelligere rather than Tally.
 *
 * Whole features hang off this - the company picker and the Add company
 * button in the header - so it is read from the profile in the store, the
 * same place the profile page reads it from, and nowhere else.
 *
 * It is false until the profile has loaded. That is deliberate: showing a
 * company picker to a Tally user for a moment is worse than showing it a
 * moment late. AppLayout loads the profile as soon as the shell mounts.
 *
 * The comparison ignores case because registration sends "Intelligere"
 * while other parts of the backend use lower case.
 */
export const selectIsIntelligereErp = (state) =>
  String(state.profile.data?.profile_details?.erp ?? '').trim().toLowerCase() ===
  'intelligere'

/* ------------------------------------------------------------------ */
/* Tally plan - which active-company rule applies                      */
/* ------------------------------------------------------------------ */

/** Lower-cased and trimmed, so "Gold", "gold " and "GOLD" all match. */
const normalise = (value) => String(value ?? '').trim().toLowerCase()

/** The Tally plan: "Silver", "Gold", or undefined. */
export const selectTallyCategory = (state) =>
  state.profile.data?.profile_details?.tally_category

/** True when the signed-in user is on Tally. */
export const selectIsTallyErp = (state) =>
  normalise(state.profile.data?.profile_details?.erp) === 'tally'

/**
 * Tally + Gold: the user picks the company in the header, and that choice
 * (kept in secure storage) is the active company - see companySlice.
 */
export const selectIsGoldTally = (state) =>
  selectIsTallyErp(state) && normalise(selectTallyCategory(state)) === 'gold'

/** Tally + Silver: the active company is the one the API marks is_active. */
export const selectIsSilverTally = (state) =>
  selectIsTallyErp(state) && normalise(selectTallyCategory(state)) === 'silver'

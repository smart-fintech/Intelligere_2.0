/**
 * The Redux store - the app's shared data.
 *
 * WHY THIS EXISTS
 * localStorage keeps the session (tokens, email, the selected company_id)
 * because that has to survive a page reload - see STORAGE_KEYS in
 * Library/secureStorage for the full, deliberately short list. The store keeps data that many screens need while
 * the app is open - the profile today, more later - so it is fetched once
 * instead of by every screen that shows it.
 *
 * HOW TO ADD A NEW SLICE
 *   1. write Store/Slices/<name>Slice.js, copying profileSlice.js
 *   2. import its reducer here
 *   3. add one line to `reducer` below
 * Nothing else in the project changes.
 *
 * HOW A SCREEN USES IT
 *   const dispatch = useDispatch()                    // to start something
 *   const profile = useSelector(selectProfile)        // to read something
 */

import { configureStore } from '@reduxjs/toolkit'

import bankReducer from '@/Store/Slices/bankSlice'
import companyReducer from '@/Store/Slices/companySlice'
import inventoryReducer from '@/Store/Slices/inventorySlice'
import ledgerReducer from '@/Store/Slices/ledgerSlice'
import locationReducer, { fetchCountries } from '@/Store/Slices/locationSlice'
import profileReducer from '@/Store/Slices/profileSlice'
import referralReducer from '@/Store/Slices/referralSlice'

/**
 * The country list (every country, state and city - megabytes of plain
 * JSON that never changes) is left out of Redux Toolkit's development-only
 * checks. Walking it on every action made the request that brings it in a
 * long task of its own ("'loadend' handler took ...ms"). Production builds
 * never run these checks.
 */
const COUNTRY_LIST_PATH = 'location.items'

export const store = configureStore({
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [fetchCountries.fulfilled.type],
        ignoredPaths: [COUNTRY_LIST_PATH],
      },
      immutableCheck: { ignoredPaths: [COUNTRY_LIST_PATH] },
    }),
  // One key per slice. `state.profile` is what profileSlice owns.
  reducer: {
    bank: bankReducer,
    company: companyReducer,
    inventory: inventoryReducer,
    ledger: ledgerReducer,
    location: locationReducer,
    profile: profileReducer,
    referral: referralReducer,
  },
})

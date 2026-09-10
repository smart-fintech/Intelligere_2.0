/**
 * The Redux store - the app's shared data.
 *
 * WHY THIS EXISTS
 * localStorage keeps the session (tokens, email, role) because that has to
 * survive a page reload. The store keeps data that many screens need while
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

import profileReducer from '@/Store/Slices/profileSlice'
import referralReducer from '@/Store/Slices/referralSlice'

export const store = configureStore({
  // One key per slice. `state.profile` is what profileSlice owns.
  reducer: {
    profile: profileReducer,
    referral: referralReducer,
  },
})

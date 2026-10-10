/**
 * The Inventory settings of the company the user is working in: its Master
 * Details record, and its Customised Fields (further down).
 *
 * WHY THIS IS IN THE STORE
 * The record was read by the Master Details tab alone. The Warehouse form
 * now needs it too (its `business_type` decides which fields a warehouse
 * has), and two screens each keeping a copy would mean two requests and two
 * answers that can disagree. Here it is fetched ONCE and read by both:
 *
 *   const { status, record, error, reload } = useMasterDetails()
 *
 * Screens use that hook (Hooks/useMasterDetails) rather than this file. It
 * is built like bankSlice: a thunk, a `condition` that refuses a duplicate
 * request, and selectors - see the note at the top of bankSlice for why "a
 * re-render is not a request" follows from that.
 *
 * The record belongs to one company AND one signed-in user, which is how the
 * backend looks it up, so it is kept with a key made of both. A record whose
 * key is not the active one is somebody else's and is never shown.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { getCustomFields, getMasterDetails } from '@/Services/inventoryService'

/** What a record is filed under: the company's name and the user's email. */
export const masterDetailsKeyOf = (compName, email) => (compName ? `${compName}|${email ?? ''}` : null)

/**
 *   dispatch(fetchMasterDetails({ compName, email }))                load it if needed
 *   dispatch(fetchMasterDetails({ compName, email, force: true }))   Retry, or re-read after a save
 *
 * The answer is the record, or null when the company has none yet (see
 * getMasterDetails) - both are a successful read.
 */
export const fetchMasterDetails = createAsyncThunk(
  'inventory/fetchMasterDetails',
  async ({ compName, email }, { rejectWithValue }) => {
    try {
      return await getMasterDetails({ compName, email })
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      return rejectWithValue(error.message)
    }
  },
  {
    condition: ({ compName, email, force } = {}, { getState }) => {
      // Without a company there is nothing to ask about.
      if (!compName) return false

      const { masterDetailsKey, masterDetailsStatus } = getState().inventory

      // Another company's record (or none at all) is in the store.
      if (masterDetailsKey !== masterDetailsKeyOf(compName, email)) return true

      // Already on its way.
      if (masterDetailsStatus === 'loading') return false

      // There is an answer - or a failure, which nothing retries on its own.
      return Boolean(force) || masterDetailsStatus === 'idle'
    },
  },
)

/**
 * THE CUSTOMISED FIELDS - the list of fields an inventory item is made of.
 *
 * Read by the Customised Fields tab alone at first; the Product form is now
 * built from the very same list. Kept here for the same reason as the Master
 * Details above: one request, one answer, and a field saved on the
 * Customised Fields tab is in the Product form the moment the list is read
 * again. Screens use Hooks/useCustomFields rather than this file.
 *
 *   dispatch(fetchCustomFields({ companyName, email }))                load them if needed
 *   dispatch(fetchCustomFields({ companyName, email, force: true }))   Refresh, Retry, after a save
 *
 * Filed under the company AND the signed-in user, like the Master Details,
 * so one user's list is never shown to the next.
 */
export const customFieldsKeyOf = masterDetailsKeyOf

export const fetchCustomFields = createAsyncThunk(
  'inventory/fetchCustomFields',
  async ({ companyName }, { rejectWithValue }) => {
    try {
      return await getCustomFields(companyName)
    } catch (error) {
      // `error.message` is already the backend's own text (see authService).
      return rejectWithValue(error.message)
    }
  },
  {
    condition: ({ companyName, email, force } = {}, { getState }) => {
      // Without a company there is nothing to ask about.
      if (!companyName) return false

      const { customFieldsKey, customFieldsStatus } = getState().inventory

      // Another company's list (or none at all) is in the store.
      if (customFieldsKey !== customFieldsKeyOf(companyName, email)) return true

      // Already on its way.
      if (customFieldsStatus === 'loading') return false

      // There is an answer - or a failure, which nothing retries on its own.
      return Boolean(force) || customFieldsStatus === 'idle'
    },
  },
)

const initialState = {
  masterDetails: null,
  // Whose record it is - see masterDetailsKeyOf.
  masterDetailsKey: null,
  masterDetailsStatus: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  masterDetailsError: null,
  // The newest request - a late answer from an older one (the company was
  // switched while it was on its way) is ignored.
  masterDetailsRequestId: null,

  // The fields exactly as the backend sent them. Empty until loaded.
  customFields: [],
  // Whose list it is - see customFieldsKeyOf.
  customFieldsKey: null,
  customFieldsStatus: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  customFieldsError: null,
  customFieldsRequestId: null,
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,

  reducers: {
    /**
     * The Master Details form saved and the reply carried the record: that
     * IS the record now, with no second request. Every screen reading it -
     * the Warehouse form included - sees the new values at once.
     */
    masterDetailsSaved: (state, action) => {
      const { key, record } = action.payload

      state.masterDetails = record
      state.masterDetailsKey = key
      state.masterDetailsStatus = 'succeeded'
      state.masterDetailsError = null
      // Anything still on its way was asked before the save and is older.
      state.masterDetailsRequestId = null
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchMasterDetails.pending, (state, action) => {
        const { compName, email } = action.meta.arg

        state.masterDetails = null
        state.masterDetailsKey = masterDetailsKeyOf(compName, email)
        state.masterDetailsStatus = 'loading'
        state.masterDetailsError = null
        state.masterDetailsRequestId = action.meta.requestId
      })
      .addCase(fetchMasterDetails.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.masterDetailsRequestId) return
        state.masterDetailsStatus = 'succeeded'
        state.masterDetails = action.payload
      })
      .addCase(fetchMasterDetails.rejected, (state, action) => {
        if (action.meta.requestId !== state.masterDetailsRequestId) return
        state.masterDetailsStatus = 'failed'
        state.masterDetailsError = action.payload || 'Could not load the master details.'
      })

      .addCase(fetchCustomFields.pending, (state, action) => {
        const { companyName, email } = action.meta.arg
        const key = customFieldsKeyOf(companyName, email)

        // A reload of the same company keeps its rows on screen until the new
        // ones arrive; another company's are dropped at once.
        if (state.customFieldsKey !== key) state.customFields = []
        state.customFieldsKey = key
        state.customFieldsStatus = 'loading'
        state.customFieldsError = null
        state.customFieldsRequestId = action.meta.requestId
      })
      .addCase(fetchCustomFields.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.customFieldsRequestId) return
        state.customFieldsStatus = 'succeeded'
        state.customFields = action.payload
      })
      .addCase(fetchCustomFields.rejected, (state, action) => {
        // The rows already there stay - a failed Refresh is not an empty list.
        if (action.meta.requestId !== state.customFieldsRequestId) return
        state.customFieldsStatus = 'failed'
        state.customFieldsError = action.payload || 'Could not load the customised fields.'
      })
  },
})

export const { masterDetailsSaved } = inventorySlice.actions
export default inventorySlice.reducer

export const selectMasterDetails = (state) => state.inventory.masterDetails
export const selectMasterDetailsKey = (state) => state.inventory.masterDetailsKey
export const selectMasterDetailsStatus = (state) => state.inventory.masterDetailsStatus
export const selectMasterDetailsError = (state) => state.inventory.masterDetailsError
export const selectMasterDetailsRequestId = (state) => state.inventory.masterDetailsRequestId

export const selectCustomFields = (state) => state.inventory.customFields
export const selectCustomFieldsKey = (state) => state.inventory.customFieldsKey
export const selectCustomFieldsStatus = (state) => state.inventory.customFieldsStatus
export const selectCustomFieldsError = (state) => state.inventory.customFieldsError
export const selectCustomFieldsRequestId = (state) => state.inventory.customFieldsRequestId

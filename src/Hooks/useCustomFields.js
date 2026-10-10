/**
 * The active company's Customised Fields, for any screen that needs them:
 *
 *   const { status, rows, error, reload } = useCustomFields()
 *
 *   status     'loading' | 'ready' | 'failed'
 *   rows       the fields exactly as the backend sent them. While a reload
 *              is on its way, and after one that failed, these are still the
 *              rows from before - a list on screen is never emptied by a
 *              Refresh. Empty until the first answer is in.
 *   error      the message when the request failed
 *   reload()   asks again - Refresh, Retry, and after a field is saved.
 *              Nothing retries on its own.
 *   companyName   what it was asked with
 *
 * The list lives in the store (Store/Slices/inventorySlice), so every screen
 * using this hook shares ONE request and ONE answer: the Customised Fields
 * tab and the Product form can both be on the page and the backend is asked
 * once - and a field saved on that tab is in the Product form as soon as the
 * tab has read the list again.
 *
 * It is read with the active company's name, from the app and never typed,
 * and read again whenever the company changes. An older company's fields are
 * never handed out: until the answer for THIS company is in, `rows` is empty
 * and `status` is 'loading'.
 */

import { useEffect } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import {
  customFieldsKeyOf,
  fetchCustomFields,
  selectCustomFields,
  selectCustomFieldsError,
  selectCustomFieldsKey,
  selectCustomFieldsRequestId,
  selectCustomFieldsStatus,
} from '@/Store/Slices/inventorySlice'

/** What a company whose list is not in the store shows - one array, so memos built on it hold. */
const NO_ROWS = []

/**
 * Asks for the list and says so when the request really failed. Being
 * refused as a duplicate is not a failure, and neither is an answer for a
 * company the user has since left - so however many screens ask, a failure
 * is announced once. The backend's own `msg` is the message, as everywhere
 * (see authService).
 */
const ask = (dispatch, store, request) =>
  dispatch(fetchCustomFields(request)).then((action) => {
    if (!fetchCustomFields.rejected.match(action) || action.meta.condition) return
    if (selectCustomFieldsRequestId(store.getState()) !== action.meta.requestId) return

    toast.error(selectCustomFieldsError(store.getState()))
  })

export default function useCustomFields() {
  const dispatch = useDispatch()
  const store = useStore()

  const { activeCompanyName: companyName } = useActiveCompany()
  const email = getEmail() || ''
  const key = customFieldsKeyOf(companyName, email)

  const storedKey = useSelector(selectCustomFieldsKey)
  const storedStatus = useSelector(selectCustomFieldsStatus)
  const storedRows = useSelector(selectCustomFields)
  const storedError = useSelector(selectCustomFieldsError)

  // Every screen asks as it mounts; the thunk's `condition` decides whether
  // that costs a request, and it does not unless nothing is loaded for this
  // company yet.
  useEffect(() => {
    if (!companyName) return
    ask(dispatch, store, { companyName, email })
  }, [dispatch, store, companyName, email])

  // What is in the store counts only when it is this company's.
  const mine = key !== null && storedKey === key
  const status = !mine ? 'loading' : storedStatus === 'succeeded' ? 'ready' : storedStatus === 'failed' ? 'failed' : 'loading'

  return {
    companyName,
    status,
    rows: mine ? storedRows : NO_ROWS,
    error: status === 'failed' ? storedError : null,
    reload: () => ask(dispatch, store, { companyName, email, force: true }),
  }
}

/**
 * The active company's Master Details, for any screen that needs them:
 *
 *   const { status, record, error, reload } = useMasterDetails()
 *
 *   status     'loading' | 'ready' | 'failed'
 *   record     the saved record once 'ready' - null when the company has
 *              none yet, which is an answer and not a failure
 *   error      the message when the request failed
 *   reload()   asks again - Retry. Nothing retries on its own.
 *   setRecord(record)   the Master Details form saved; this is the record now
 *   key        which company and user the record is for - changes when the
 *              header switches company
 *   compName, email     what it was asked with
 *
 * The record lives in the store (Store/Slices/inventorySlice), so every
 * screen using this hook shares ONE request and ONE answer: the Master
 * Details tab and the Warehouse form can both be on the page and the backend
 * is asked once. A change made on the Master Details tab reaches the others
 * as it is saved.
 *
 * It is read with the active company's name and the signed-in user's email -
 * both from the app, never typed - and read again whenever either changes.
 * Until the answer for THIS company is in, `status` is 'loading': an older
 * company's record is never handed out, and no value is assumed meanwhile.
 */

import { useEffect } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import {
  fetchMasterDetails,
  masterDetailsKeyOf,
  masterDetailsSaved,
  selectMasterDetails,
  selectMasterDetailsError,
  selectMasterDetailsKey,
  selectMasterDetailsRequestId,
  selectMasterDetailsStatus,
} from '@/Store/Slices/inventorySlice'

/**
 * Asks for the record and says so when the request really failed. Being
 * refused as a duplicate is not a failure, and neither is an answer for a
 * company the user has since left - so however many screens ask, a failure
 * is announced once. The backend's own `msg` is the message, as everywhere
 * (see authService).
 */
const ask = (dispatch, store, request) =>
  dispatch(fetchMasterDetails(request)).then((action) => {
    if (!fetchMasterDetails.rejected.match(action) || action.meta.condition) return
    if (selectMasterDetailsRequestId(store.getState()) !== action.meta.requestId) return

    toast.error(selectMasterDetailsError(store.getState()))
  })

export default function useMasterDetails() {
  const dispatch = useDispatch()
  const store = useStore()

  const { activeCompanyName: compName } = useActiveCompany()
  const email = getEmail() || ''
  const key = masterDetailsKeyOf(compName, email)

  const storedKey = useSelector(selectMasterDetailsKey)
  const storedStatus = useSelector(selectMasterDetailsStatus)
  const storedRecord = useSelector(selectMasterDetails)
  const storedError = useSelector(selectMasterDetailsError)

  // Every screen asks as it mounts; the thunk's `condition` decides whether
  // that costs a request, and it does not unless nothing is loaded for this
  // company yet.
  useEffect(() => {
    if (!compName) return
    ask(dispatch, store, { compName, email })
  }, [dispatch, store, compName, email])

  // What is in the store counts only when it is this company's.
  const mine = key !== null && storedKey === key
  const status = !mine ? 'loading' : storedStatus === 'succeeded' ? 'ready' : storedStatus === 'failed' ? 'failed' : 'loading'

  return {
    key,
    compName,
    email,
    status,
    record: status === 'ready' ? storedRecord : null,
    error: status === 'failed' ? storedError : null,
    reload: () => ask(dispatch, store, { compName, email, force: true }),
    setRecord: (record) => dispatch(masterDetailsSaved({ key, record })),
  }
}

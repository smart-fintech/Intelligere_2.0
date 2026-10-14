/**
 * The SAC list for a screen that offers it (SacSelector):
 *
 *   const sac = useSacList()
 *
 *   status    'loading' | 'ready' | 'failed'
 *   list      [{ code, names }] - empty until it is in
 *   error     the message when the request failed
 *   retry()   asks again
 *
 * The same hook the HSN list uses - see useCodeList.
 */

import { useCodeList } from '@/Hooks/useCodeList'
import { cachedSacList, loadSacList } from '@/Services/sacService'

export default function useSacList() {
  return useCodeList(cachedSacList, loadSacList)
}

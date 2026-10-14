/**
 * The HSN list for a screen that offers it (HsnSelector):
 *
 *   const hsn = useHsnList()
 *
 *   status    'loading' | 'ready' | 'failed'
 *   list      [{ code, names }] - empty until it is in
 *   error     the message when the request failed
 *   retry()   asks again
 *
 * The waiting, the retrying and the shared cache are useCodeList's, which
 * the SAC list uses in the same way; this only names which list.
 */

import { useCodeList } from '@/Hooks/useCodeList'
import { cachedHsnList, loadHsnList } from '@/Services/hsnService'

export default function useHsnList() {
  return useCodeList(cachedHsnList, loadHsnList)
}

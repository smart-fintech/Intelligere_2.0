/**
 * ONE SOURCE'S KEYWORD MAPPING (Services/keywordMappingService):
 *
 *   const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.WITH_INVENTORY)
 *
 *   mapping        { keyword: ledger } - NO_MAPPING until it is in
 *   status, error, reload
 *   add(keyword, ledger)   PUT - the reply is the source's whole mapping, kept as it is
 *   remove(keyword)        DELETE, then read again
 *   saving                 true while either runs
 *
 * Kept in the shared cache per company and source, so reopening the dialog,
 * or another view of the same source, asks no second time.
 */

import { useState } from 'react'

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { NO_MAPPING, readMapping } from '@/Modules/SalesEntries/shared/keywordMapping'
import { deleteKeywordMapping, getKeywordMapping, saveKeywordMapping } from '@/Services/keywordMappingService'

export default function useKeywordMapping(companyId, source) {
  const query = useQuery({
    key: [QUERY.KEYWORD_MAPPING, companyId, source],
    fetch: async () => readMapping(await getKeywordMapping(companyId, source)),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const [saving, setSaving] = useState(false)

  const run = async (work, done) => {
    setSaving(true)
    try {
      await work()
      await query.reload()
      toast.success(done)
      return true
    } catch (failure) {
      toast.error(failure.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  return {
    mapping: query.data ?? NO_MAPPING,
    status: query.status,
    error: query.error,
    reload: query.reload,
    saving,
    add: (keyword, ledger) => run(() => saveKeywordMapping(companyId, source, { [keyword]: ledger }), 'Mapping saved.'),
    remove: (keyword) => run(() => deleteKeywordMapping(companyId, source, [keyword]), 'Mapping removed.'),
  }
}

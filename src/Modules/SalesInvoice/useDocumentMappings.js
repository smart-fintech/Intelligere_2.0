/**
 * The company's mappings for one document type (invoice/document-mapping/) -
 * 'Sales Invoice' or 'Purchase Invoice' (MAPPING_DOCUMENT_TYPE), each its own:
 *
 *   const mappings = useDocumentMappings(companyId, documentType)
 *
 *   status     'idle' | 'loading' | 'ready' | 'failed'
 *   rows       [{ key, value, tax, rate }] - in the server's order; `tax` /
 *              `rate` read from a GST key ("sgst_6"), else the key itself
 *   error      the message when the list could not be loaded
 *   save(key, value)    adds a mapping, then reloads the list
 *   remove(row)         deletes that one mapping, then reloads the list
 *   busy       a save or delete is on its way
 *   ledgerMapping   the answer as it came ({ cgst: "...", sgst_6: "..." }) -
 *              what the invoice's GST ledgers are read from (Utils/gstLedgers,
 *              which reads only the GST keys); null until this answer is in
 *
 * Nothing is fetched while `documentType` is null (a type with no GST), and
 * the table only ever shows what the server answered - a save or a delete is
 * followed by a fresh read, never patched in locally.
 *
 * The answer is kept in the shared cache (Library/queryCache) per company and
 * type: coming back reuses it instead of asking again. It changes only
 * through save/remove here (each followed by that fresh read), or after
 * MASTER_DATA_STALE_MS for a change made elsewhere.
 */

import { useCallback, useMemo, useState } from 'react'

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { readMappingKey } from '@/Utils/gstLedgers'
import { deleteDocumentMapping, getDocumentMappings, saveDocumentMapping } from '@/Services/salesInvoiceService'

// Read by the one rule the GST ledgers are resolved by too (Utils/gstLedgers).
export { readMappingKey }

const toRows = (mappings) => Object.entries(mappings).map(([key, value]) => ({ key, value, ...readMappingKey(key) }))

export default function useDocumentMappings(companyId, documentType) {
  const active = Boolean(documentType && companyId)
  const query = useQuery({
    key: active ? [QUERY.DOCUMENT_MAPPINGS, companyId, documentType] : null,
    fetch: () =>
      getDocumentMappings(companyId, documentType).catch((failure) => {
        console.warn(`[${documentType}] mappings could not be loaded:`, failure.message)
        throw failure
      }),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const [busy, setBusy] = useState(false)
  const { reload } = query

  // While a reload is on its way the table keeps this company's last rows.
  const rows = useMemo(() => (active && query.data ? toRows(query.data) : []), [active, query.data])
  const ledgerMapping = active && query.data ? query.data : null

  /** Runs one change, then reads the list again - the error, if any, is the caller's to show. */
  const change = useCallback(
    async (request) => {
      setBusy(true)
      try {
        await request()
        await reload()
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  const save = useCallback(
    (key, value) => change(() => saveDocumentMapping(companyId, documentType, key, value)),
    [change, companyId, documentType],
  )

  const remove = useCallback(
    (row) => change(() => deleteDocumentMapping(companyId, documentType, row.key, row.value)),
    [change, companyId, documentType],
  )

  return {
    status: active ? query.status : 'idle',
    rows,
    ledgerMapping,
    error: query.status === 'failed' ? query.error : null,
    busy,
    save,
    remove,
    reload,
  }
}

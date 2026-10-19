/**
 * The company's GST ledger mappings (invoice/document-mapping/) - Sales
 * Invoice only:
 *
 *   const mappings = useDocumentMappings(companyId, enabled)
 *
 *   status     'idle' | 'loading' | 'ready' | 'failed'
 *   rows       [{ kind, key, tax, rate, ledger }] - ledger mappings first,
 *              then product mappings, each in the server's order
 *   error      the message when the list could not be loaded
 *   save(key, ledgerName)    adds a ledger mapping, then reloads the list
 *   remove(row)              deletes that one mapping, then reloads the list
 *   busy       a save or delete is on its way
 *   ledgerMapping   the answer's `ledger_mapping` as it came ({ cgst: "...",
 *              sgst_6: "..." }) - what the invoice's GST ledgers are read
 *              from (Utils/gstLedgers); null until this company's answer is in
 *
 * Nothing is fetched while `enabled` is false (another document type), and
 * the table only ever shows what the server answered - a save or a delete is
 * followed by a fresh read, never patched in locally.
 *
 * The answer is kept in the shared cache (Library/queryCache) per company:
 * coming back to Sales Invoice reuses it instead of asking again. It changes
 * only through save/remove here (each followed by that fresh read), or after
 * MASTER_DATA_STALE_MS for a change made elsewhere.
 */

import { useCallback, useMemo, useState } from 'react'

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { readMappingKey } from '@/Utils/gstLedgers'
import {
  MAPPING_KIND,
  deleteDocumentMapping,
  getDocumentMappings,
  saveDocumentMapping,
} from '@/Services/salesInvoiceService'

// Read by the one rule the GST ledgers are resolved by too (Utils/gstLedgers).
export { readMappingKey }

const NO_MAPPING = Object.freeze({})

const toRows = (mappings) =>
  [MAPPING_KIND.LEDGER, MAPPING_KIND.PRODUCT].flatMap((kind) =>
    Object.entries(mappings[kind] ?? {}).map(([key, ledger]) => ({ kind, key, ledger: String(ledger ?? ''), ...readMappingKey(key) })),
  )

export default function useDocumentMappings(companyId, enabled) {
  const active = Boolean(enabled && companyId)
  const query = useQuery({
    key: active ? [QUERY.DOCUMENT_MAPPINGS, companyId] : null,
    fetch: () =>
      getDocumentMappings(companyId).catch((failure) => {
        console.warn('[Sales Invoice] GST mappings could not be loaded:', failure.message)
        throw failure
      }),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const [busy, setBusy] = useState(false)
  const { reload } = query

  // While a reload is on its way the table keeps this company's last rows.
  const rows = useMemo(() => (active && query.data ? toRows(query.data) : []), [active, query.data])
  const ledgerMapping = active && query.data ? (query.data[MAPPING_KIND.LEDGER] ?? NO_MAPPING) : null

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
    (key, ledgerName) => change(() => saveDocumentMapping(companyId, MAPPING_KIND.LEDGER, key, ledgerName)),
    [change, companyId],
  )

  const remove = useCallback(
    (row) => change(() => deleteDocumentMapping(companyId, row.kind, row.key, row.ledger)),
    [change, companyId],
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

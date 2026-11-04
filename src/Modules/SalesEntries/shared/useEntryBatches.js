/**
 * THE ROWS ON SCREEN - one batch of a Sales Entries list API at a time, for
 * any of the three views:
 *
 *   const batch = useEntryBatches(companyId, getMultiLedgerEntries)
 *
 *   status     'loading' | 'ready' | 'failed' - 'loading' keeps the last batch
 *              on screen, so a reload does not empty the table
 *   rows       the API's rows of this batch, as they came (readBatch)
 *   total, notInTally, error
 *   info       batchInfo: number, count, hasPrevious, hasNext, ...
 *   goTo(start)  another batch; reload() this one again; restart() batch 1
 *
 *   onLoaded(rows)   optional: runs with every batch that arrives (With
 *                    Inventory creates the missing party ledgers from it)
 *
 * Batches step by SALES_ENTRIES_BATCH_SIZE, never by the rows received - see
 * shared/entryBatch. Only the latest request is listened to: an answer for a
 * batch the user has already moved away from is dropped.
 */

import { useEffect, useRef, useState } from 'react'

import { batchInfo, readBatch } from '@/Modules/SalesEntries/shared/entryBatch'

const EMPTY = Object.freeze({ start: 0, rows: [], total: 0, notInTally: 0 })

export default function useEntryBatches(companyId, fetchBatch, { onLoaded } = {}) {
  const [batch, setBatch] = useState(EMPTY)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const requestRef = useRef(0)
  const onLoadedRef = useRef(onLoaded)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  })

  /** Asks for the batch; only the answer sets state, so the first load can run in an effect. */
  const request = (start) => {
    const ticket = ++requestRef.current
    return fetchBatch(companyId, start).then(
      (reply) => {
        if (ticket !== requestRef.current) return
        const next = readBatch(reply, start)
        setBatch(next)
        setStatus('ready')
        onLoadedRef.current?.(next.rows)
      },
      (failure) => {
        if (ticket !== requestRef.current) return
        setError(failure.message)
        setStatus('failed')
      },
    )
  }

  const load = (start) => {
    setStatus('loading')
    setError(null)
    return request(start)
  }

  // The state starts as 'loading', so the first batch needs only the request.
  useEffect(() => {
    request(0)
    // A view is mounted per company (keyed by the page), so this runs once for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // An answer still on its way when the view goes is not wanted.
  useEffect(() => () => void (requestRef.current += 1), [])

  return {
    status,
    error,
    rows: batch.rows,
    total: batch.total,
    notInTally: batch.notInTally,
    start: batch.start,
    info: batchInfo(batch.start, batch.total),
    goTo: load,
    reload: () => load(batch.start),
    restart: () => load(0),
  }
}

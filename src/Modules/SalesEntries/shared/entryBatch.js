/**
 * BATCHES - how every Sales Entries list API is paged. Shared by the three views.
 *
 *   readBatch(reply, start)   -> { start, rows, total, notInTally }
 *   batchInfo(start, total)   which batch this is, and whether there are others
 *
 * The backend cuts a batch from ALL of this user's invoice numbers - sent ones
 * too - SALES_ENTRIES_BATCH_SIZE at a time, then leaves the sent ones out. So
 * a batch can hold fewer rows than that, and the next one still starts
 * SALES_ENTRIES_BATCH_SIZE further on; stepping by the rows received would
 * start inside this batch and show the same invoices twice.
 *
 * `rows` are the API's rows as they came (each view reads them its own way),
 * each with its `key` - the row's id, else its invoice number - and seen once.
 */

import { SALES_ENTRIES_BATCH_SIZE } from '@/Constants/salesEntries'
import { text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'

const whole = (value) => Math.max(0, Math.trunc(toNumber(value)))

export const rowKey = (raw) => text(raw?.id) || text(raw?.invoice_no)

export const readBatch = (reply, start) => {
  const seen = new Set()
  const rows = (Array.isArray(reply?.data) ? reply.data : []).filter((raw) => {
    const key = rowKey(raw)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { start, rows, total: whole(reply?.total_len), notInTally: whole(reply?.not_in_tally_count) }
}

export const batchInfo = (start, total) => ({
  number: Math.floor(start / SALES_ENTRIES_BATCH_SIZE) + 1,
  count: Math.max(1, Math.ceil(total / SALES_ENTRIES_BATCH_SIZE)),
  first: total === 0 ? 0 : start + 1,
  last: Math.min(start + SALES_ENTRIES_BATCH_SIZE, total),
  hasPrevious: start > 0,
  hasNext: start + SALES_ENTRIES_BATCH_SIZE < total,
  previousStart: Math.max(0, start - SALES_ENTRIES_BATCH_SIZE),
  nextStart: start + SALES_ENTRIES_BATCH_SIZE,
})

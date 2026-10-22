/**
 * The company's Tally vouchers (POST invoice/tally-vouchers/ { company_id }):
 *
 *   const vouchers = useTallyVouchers(companyId, enabled)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   groups    the vouchers by document type (voucherGroupsOf) - {} until in
 *   error     the message when they could not be loaded
 *   reload()  asks again now - the Refresh button
 *
 * ONE ANSWER PER COMPANY, FOR EVERY SCREEN - kept in the shared cache
 * (Library/queryCache) under [TALLY_VOUCHERS, companyId], so Sales Invoice
 * and Purchase Invoice showing the same company read the same answer, and a
 * request already on its way is shared rather than sent twice. Nothing is
 * asked until a Voucher view is opened (`enabled`), nor again on a re-render
 * or a revisit: only Refresh asks again. Another company is another key, so
 * its vouchers are never shown for this one - while they load the status is
 * 'loading' with no rows.
 */

import { useMemo } from 'react'

import { QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { getTallyVouchers, voucherGroupsOf } from '@/Services/salesInvoiceService'

const NONE = Object.freeze({})

export default function useTallyVouchers(companyId, enabled = true) {
  const active = Boolean(enabled && companyId)
  const query = useQuery({
    key: active ? [QUERY.TALLY_VOUCHERS, companyId] : null,
    fetch: () => getTallyVouchers(companyId),
    // Kept until Refresh: vouchers come from Tally, not from anything done here.
    staleTime: Infinity,
  })
  const groups = useMemo(() => (query.data === undefined ? NONE : voucherGroupsOf(query.data)), [query.data])

  return {
    status: active ? query.status : 'idle',
    groups,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

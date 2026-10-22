/**
 * The company's voucher types (POST tally/voucher-list/ { company_name }):
 *
 *   const voucherTypes = useVoucherTypes(companyName)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   types     [{ name, group }] (voucherTypesOf) - [] until they are in
 *   error     the message when they could not be loaded
 *   reload()  asks again now
 *
 * ONE ANSWER PER COMPANY - kept in the shared cache (Library/queryCache)
 * under [TALLY_VOUCHER_TYPES, companyName], so every voucher card, both
 * modules and every page of vouchers read the same answer: it is asked for
 * once when a Voucher view first needs it, again for another company (a
 * new key), on reload(), or after MASTER_DATA_STALE_MS. Which type a
 * voucher starts with, and which it may use, is defaultVoucherTypeFor's and
 * voucherTypesOfGroup's to say (Services/salesInvoiceService), from this one list.
 */

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { getVoucherTypeList } from '@/Services/salesInvoiceService'

const NONE = Object.freeze([])

export default function useVoucherTypes(companyName, enabled = true) {
  const name = typeof companyName === 'string' ? companyName.trim() : ''
  const active = Boolean(enabled && name)
  const query = useQuery({
    key: active ? [QUERY.TALLY_VOUCHER_TYPES, name] : null,
    fetch: () => getVoucherTypeList(name),
    staleTime: MASTER_DATA_STALE_MS,
  })
  return {
    status: active ? query.status : 'idle',
    types: Array.isArray(query.data) ? query.data : NONE,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

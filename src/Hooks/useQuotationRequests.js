/**
 * The active company's requests for quotation, by Sales Order - Compare
 * Quotation's History:
 *
 *   const requests = useQuotationRequests()
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rows      readQuotationRequests(...) of the reply
 *   error     the message when the request failed
 *   reload()  asks again now - Retry
 *
 * Kept in the shared cache (Library/queryCache) under [QUOTATION_REQUESTS,
 * companyName], with no time limit: asked the first time History is shown
 * in a page session, and then reused - switching to Upload Quotation and
 * back, or to another section and back, sends nothing. It is read again only
 * when a quotation upload is accepted (uploadQuotation says so) or when the
 * header moves to another company, whose own list is asked for - one
 * company's requests are never shown for another.
 */

import { QUERY } from '@/Constants/queryKeys'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useQuery } from '@/Library/queryCache'
import { readQuotationRequests } from '@/Modules/Dashboard/quotationRequests'
import { getQuotationRequests } from '@/Services/procurementService'

const NO_REQUESTS = []

export default function useQuotationRequests(enabled = true) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const query = useQuery({
    key: companyName ? [QUERY.QUOTATION_REQUESTS, companyName] : null,
    // Read once, as it arrives - every screen then shares the same rows.
    fetch: () => getQuotationRequests(companyName).then(readQuotationRequests),
    staleTime: Infinity,
    enabled,
  })

  return {
    status: !enabled || !companyName ? 'idle' : query.status,
    rows: query.data ?? NO_REQUESTS,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

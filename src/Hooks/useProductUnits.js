/**
 * The units the active company's products can be counted in, as the choices
 * of the Product form's Unit dropdown:
 *
 *   const units = useProductUnits()
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   options   [{ value, label }] - both the unit exactly as the backend
 *             names it ("NOS", "Nos" and "N/A" are three different units)
 *   error     the message when the request failed
 *   retry()   asks again
 *
 * Read with the active company's name, from the store and never typed, and
 * read again whenever the company changes - the same way useProductGroups
 * reads the groups. An older company's units are never handed out: until
 * the answer for THIS company is in, `options` is empty.
 *
 * Kept in the shared cache (Library/queryCache) per company. A product
 * saved anywhere can bring a new unit with it, so saving one marks the
 * units stale as well (markProductsChanged) - the next form asks again.
 */

import { useMemo } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { getProductUnits } from '@/Services/productService'

const NO_UNITS = []

export default function useProductUnits() {
  const { activeCompanyName: companyName } = useActiveCompany()

  const query = useQuery({
    key: companyName ? [QUERY.PRODUCT_UNITS, companyName] : null,
    fetch: () => getProductUnits(companyName),
    staleTime: MASTER_DATA_STALE_MS,
  })
  // A failed request shows no units, as before; the next answer brings them.
  const units = query.status === 'failed' ? NO_UNITS : (query.data ?? NO_UNITS)

  const options = useMemo(() => [...new Set(units)].map((unit) => ({ value: unit, label: unit })), [units])

  return {
    status: !companyName ? 'idle' : query.status,
    options,
    error: query.status === 'failed' ? query.error : null,
    retry: query.reload,
  }
}

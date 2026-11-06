/**
 * What a Bid is made of, for one company - each read once into the shared
 * cache, and shared by the screen (which checks there is something to make a
 * bid of before the form opens) and the form (which offers it):
 *
 *   const products = useProductOptions(companyName, { staleTime })
 *     readProductOptions over the Product API (getProducts - POST
 *     inventory/product/ { company_name }). The SAME cache entry as useProducts,
 *     holding the backend's rows as they came, so a product saved on the
 *     Product pages is seen here too; `data` is read from them here.
 *
 *   const vendors = useCompanyVendors(companyId, { staleTime })
 *     readVendorOptions over the vendor master (inventoryService.getVendors,
 *     the list the Vendor tab shows) - the details of the vendors a product
 *     names by id
 *
 * The screen asks with staleTime 0, so a product or vendor created elsewhere is
 * seen on the next visit; the form then reuses that answer.
 */

import { useMemo } from 'react'

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { readProductOptions, readVendorOptions } from '@/Modules/Procurement/procurement'
import { getProducts } from '@/Services/Inventory/inventoryProductService'
import { getVendors } from '@/Services/Inventory/vendorService'

const hasCompany = (companyId) => companyId !== null && companyId !== undefined && companyId !== ''

export default function useProductOptions(companyName, { staleTime = MASTER_DATA_STALE_MS } = {}) {
  const query = useQuery({
    key: companyName ? [QUERY.PRODUCTS, companyName] : null,
    fetch: () => getProducts(companyName),
    staleTime,
  })
  const data = useMemo(() => (query.data ? readProductOptions(query.data) : query.data), [query.data])
  return { ...query, data }
}

export function useCompanyVendors(companyId, { staleTime = MASTER_DATA_STALE_MS } = {}) {
  return useQuery({
    key: hasCompany(companyId) ? [QUERY.PROCUREMENT_VENDORS, companyId] : null,
    fetch: () => getVendors(companyId).then((rows) => readVendorOptions(rows, companyId)),
    staleTime,
  })
}

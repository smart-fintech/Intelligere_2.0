/**
 * The active company's vendors as the choices of a dropdown - for a product
 * field that asks for a vendor (`vendor_select`):
 *
 *   const vendors = useVendorOptions(formHasAVendorField)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   options   [{ value, label, id }] - `value` is the vendor's identifier as
 *             text, which is what a dropdown works in; `id` is that
 *             identifier exactly as the backend sent it, which is what gets
 *             sent; `label` is the name the company knows the vendor by
 *   error     the message when the request failed
 *   retry()   asks again - nothing retries on its own
 *
 * `enabled` is whether anything on screen needs them. While it is false
 * NOTHING is fetched and `status` is 'idle' - a company whose products have
 * no vendor field never asks for its vendors here.
 *
 * The same list the Vendor tab shows (getVendors), read with the same
 * `company_id` from the store. A vendor the company has deleted is not
 * offered, and one that has arrived without an identifier cannot be chosen,
 * so it is left out too.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getVendorId, getVendors, vendorCompanyDetails } from '@/Services/inventoryService'

const NO_VENDORS = []

export default function useVendorOptions(enabled) {
  const { activeCompanyId: companyId } = useActiveCompany()

  // Kept with the company it belongs to, as on the Vendor tab: an answer for
  // a company the header has since left is not this company's.
  const [state, setState] = useState({ status: 'loading', vendors: NO_VENDORS, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!enabled || !companyId) return

    const requestKey = `${companyId}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getVendors(companyId)
      .then((vendors) => {
        if (request.current === requestKey) setState({ status: 'ready', vendors, error: null, forKey: companyId })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        setState({ status: 'failed', vendors: NO_VENDORS, error: failure.message, forKey: companyId })
      })
  }, [enabled, companyId, attempt])

  const mine = enabled && Boolean(companyId) && state.forKey === companyId
  const vendors = mine ? state.vendors : NO_VENDORS

  const options = useMemo(
    () =>
      vendors.reduce((list, vendor) => {
        const id = getVendorId(vendor)
        const details = vendorCompanyDetails(vendor, companyId)
        if (id === null || details?.is_deleted) return list

        list.push({ value: String(id), id, label: details?.ledger_name || vendor.email || `Vendor ${id}` })
        return list
      }, []),
    [vendors, companyId],
  )

  return {
    status: !enabled || !companyId ? 'idle' : mine ? state.status : 'loading',
    options,
    error: mine ? state.error : null,
    retry: () => {
      setState((previous) => ({ ...previous, forKey: null }))
      setAttempt((count) => count + 1)
    },
  }
}

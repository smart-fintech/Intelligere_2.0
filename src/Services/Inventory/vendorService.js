/**
 * A company's vendors (Inventory Details' Vendor tab, and the vendor pickers
 * of the Product form and Procurement).
 */

import { toList } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'

/*
 * ONE URL, THREE JOBS - AND THE LIST IS A **POST**, as with the warehouses:
 *
 *   POST  inventory/vendor_create/   list them    { company_id }
 *   POST  inventory/vendor_create/   add one      the vendor
 *   PUT   inventory/vendor_create/   change one   the vendor plus its identifier
 *
 * and a second URL looks for a vendor that is already on record:
 *
 *   POST  inventory/vendor_search/   { gst_no?, pan_no?, email? }
 *
 * A vendor looks like this. Two of its parts belong to a company and are
 * filed under that company's `company_id`; the rest is the vendor's own:
 *
 *   { "company_details": { "256": { "ledger_name": "Samir sales",
 *                                   "company_name": "Bhavi", ...,
 *                                   "is_verified": false, "is_deleted": false } },
 *     "rating":          { "256": { "Price Competitiveness": 3.5, ...,
 *                                   "Overall Rating": 7.5 } },
 *     "address": "...", "contact": "...", "whatsapp": "...", "email": "...",
 *     "country": "India", "state": "Gujarat", "city": "Ahmedabad",
 *     "gst_no": "...", "pan_no": "...", ... }
 *
 * A save sends the same shape back, with only `ledger_name` under
 * `company_details` - the other properties there are the backend's to fill -
 * and the nine ratings together with "Overall Rating", which the Vendor form
 * works out as their average (overallVendorRating in Constants/inventory).
 * A reply carries more than this (machinery, certifications, documents ...);
 * those belong to other screens and are neither shown nor sent from here.
 *
 * Saving answers { msg }. The search answers
 * { status, msg, data: { vendor_id, address, country, state, city, contact,
 * whatsapp, email, gst_no } } - `status: false` and an empty `data` when
 * nothing matched.
 *
 * THERE IS NO DELETE HERE YET. A vendor carries an `is_deleted` flag per
 * company, but how one is set has not been confirmed, and a guessed method
 * or body could remove the wrong thing; it is added as one function below
 * once the contract is known.
 */
const VENDOR_URL = 'inventory/vendor_create/'
const VENDOR_SEARCH_URL = 'inventory/vendor_search/'

/**
 * A vendor's identifier, as the one property the update needs - under the
 * name the backend gave it.
 *
 * The search names it `vendor_id`; a row of the list may carry it as
 * `vendor_id` or as a plain `id`. Whichever arrived is what goes back, so
 * the name is never chosen here. Null when the row has neither.
 */
export const vendorIdentifier = (vendor) => {
  if (vendor?.vendor_id != null) return { vendor_id: vendor.vendor_id }
  if (vendor?.id != null) return { id: vendor.id }
  return null
}

/** A vendor's identifier as a plain value - its row key. */
export const getVendorId = (vendor) => vendor?.vendor_id ?? vendor?.id ?? null

/**
 * The part of a vendor that belongs to one company: its ledger there, and
 * whether that company has verified or deleted it. Null when the vendor has
 * nothing filed under that company.
 */
export const vendorCompanyDetails = (vendor, companyId) => vendor?.company_details?.[companyId] ?? null

/** The scores one company has given a vendor, or null when it has given none. */
export const vendorRating = (vendor, companyId) => vendor?.rating?.[companyId] ?? null

/**
 * The vendors of one company. The id comes from the caller, which reads it
 * from the active company in the store - never from a form. Without one
 * there is nothing to ask for.
 */
export const getVendors = async (companyId) => {
  if (!companyId) return []

  return toList(await api.post(VENDOR_URL, { company_id: companyId }))
}

/** Adds a vendor. `payload` is the vendor, with its company parts under the active `company_id`. */
export const createVendor = (payload) => api.post(VENDOR_URL, payload)

/** Changes a vendor. `payload` is the vendor plus its identifier (see vendorIdentifier). */
export const updateVendor = (payload) => api.put(VENDOR_URL, payload)

/**
 * Looks for a vendor already on record. `criteria` holds only what the user
 * filled in - one or more of `gst_no`, `pan_no`, `email` - and an empty one
 * is never sent: checking that is the form's job.
 */
export const searchVendor = (criteria) => api.post(VENDOR_SEARCH_URL, criteria)

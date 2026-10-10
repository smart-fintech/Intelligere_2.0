/**
 * DOES THIS USER GET INVENTORY MANAGEMENT? - asked in one place:
 *
 *   const { known, full } = useInventoryAccess()
 *
 *   known   false until there is enough to answer. Draw NOTHING that depends
 *           on the answer while it is false - a user must never be shown
 *           the full inventory screens for a moment and then have them
 *           taken away, nor the other way round.
 *   full    true  = the full Inventory Management screens: Master Details,
 *                   Warehouse, Vendor, Customised Fields and the SKU-based
 *                   product form
 *           false = the simple product list (and Vendor)
 *
 * THE RULE
 *
 *   MSME, and the active company's `premium_modules` lists
 *   "Inventory Management"                                    full
 *   MSME without it                                           simple
 *   Accounting Professional                                   simple - always.
 *       Such a user cannot manage Inventory Management, so the company's
 *       plan is not even looked at.
 *
 * Both halves are read from where the app already keeps them, never asked
 * for again: who the user is from the profile in the store
 * (profile_details.user_type - see selectIsMsme), and the plan from the
 * active company's own record (see hasInventoryManagement). Which ERP the
 * user is on has no say here; it decides HOW a simple product is saved, and
 * the simple product page reads that for itself.
 *
 * A profile that could not be loaded leaves the user unidentified, and an
 * unidentified user is not given the full screens.
 */

import { useSelector } from 'react-redux'

import { hasInventoryManagement } from '@/Services/inventoryService'
import { selectActiveCompany, selectCompanyStatus } from '@/Store/Slices/companySlice'
import { selectIsMsme, selectProfile, selectProfileStatus } from '@/Store/Slices/profileSlice'

export default function useInventoryAccess() {
  const profile = useSelector(selectProfile)
  const profileStatus = useSelector(selectProfileStatus)
  const isMsme = useSelector(selectIsMsme)

  const company = useSelector(selectActiveCompany)
  const companyStatus = useSelector(selectCompanyStatus)

  // Who the user is: known once the profile is in, or has failed to arrive.
  const profileSettled = Boolean(profile) || profileStatus === 'failed'
  if (!profileSettled) return { known: false, full: false }

  // Not an MSME: the plan is not consulted, so there is nothing to wait for.
  if (!isMsme) return { known: true, full: false }

  // An MSME's answer is its company's plan, so the companies have to be in.
  const companiesSettled = companyStatus === 'succeeded' || companyStatus === 'failed'
  if (!companiesSettled) return { known: false, full: false }

  return { known: true, full: hasInventoryManagement(company) }
}

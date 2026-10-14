/**
 * WHAT MAY THIS USER DO WITH A SECTION? - for the company being worked in:
 *
 *   const access = useSectionAccess(ACCESS_SECTIONS.BANK)
 *
 *   access.known    false until there is enough to answer. Draw nothing that
 *                   depends on the answer while it is false, so nobody is
 *                   shown a button that is then taken away
 *   access.view / create / edit / delete / any
 *
 * The rules are Services/accessService's (getSectionAccess). Who the user is
 * is the role saved at sign-in (Secure Storage); what they were given is the
 * ACTIVE company's own record in the store - so a move to another company
 * answers again from that company, and nothing of the last one carries over.
 *
 * A user who is not a sub user is known at once, and may do everything.
 *
 * useAccessScope is the same question's inputs, for a screen that asks about
 * several sections at once (see useModuleNav).
 */

import { useState } from 'react'
import { useSelector } from 'react-redux'

import { getRole } from '@/Library/secureStorage'
import { FULL_ACCESS, NO_ACCESS, getSectionAccess, isSubUserRole } from '@/Services/accessService'
import { selectActiveCompany, selectCompanyStatus } from '@/Store/Slices/companySlice'

/** { known, subUser, company } - what getSectionAccess is asked with. */
export function useAccessScope() {
  // Read once per screen: the role only changes with a new sign-in.
  const [subUser] = useState(() => isSubUserRole(getRole()))
  const company = useSelector(selectActiveCompany)
  const companyStatus = useSelector(selectCompanyStatus)

  // A sub user's answer is the company's record, so the companies must be in.
  const known = !subUser || companyStatus === 'succeeded' || companyStatus === 'failed'

  return { known, subUser, company }
}

/** The answer for one section - see the top of this file. */
export default function useSectionAccess(section) {
  const scope = useAccessScope()

  if (!scope.subUser) return { known: true, ...FULL_ACCESS }
  if (!scope.known) return { known: false, ...NO_ACCESS }
  return { known: true, ...getSectionAccess(scope, section) }
}

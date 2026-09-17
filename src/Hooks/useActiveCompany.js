/**
 * The company data every screen shares, in one call:
 *
 *   const { activeCompany, activeCompanyName, activeCompanyId, allCompanies } =
 *     useActiveCompany()
 *
 * It only READS the store (companySlice), which is the single source of
 * truth; it never fetches. The list is loaded by AppLayout and reloaded by
 * whatever changes it, and every component using this hook re-renders with
 * the new values when that happens. Whether the active company is the
 * is_active one (Silver and others) or the one a Gold user picked is decided
 * in the store, not here.
 */

import { useEffect } from 'react'
import { useSelector } from 'react-redux'

import { ENV } from '@/Config/env'
import { ACTIVE_COMPANY_RULE, rememberSelectedCompany } from '@/Services/companyService'
import {
  selectActiveCompanyInfo,
  selectCompanyDebugInfo,
  selectCompanyStatus,
} from '@/Store/Slices/companySlice'

export const useActiveCompany = () => useSelector(selectActiveCompanyInfo)

/**
 * Mounted ONCE, by AppLayout. Runs whenever the active company is worked out
 * again (new list, profile arrived, Gold pick) and:
 *
 *   - logs what was decided, and why, to the browser console
 *   - for the is_active rule only, mirrors the active company_id into secure
 *     storage, which authService sends as the `activecompanyid` header.
 *     For Gold nothing is written here: only the user's pick writes storage,
 *     so a reload or a list refresh can never replace it.
 */
export const useActiveCompanyStorageSync = () => {
  const info = useActiveCompany()
  const context = useSelector(selectCompanyDebugInfo)
  const status = useSelector(selectCompanyStatus)

  useEffect(() => {
    // Nothing to decide until the list has arrived.
    if (status !== 'succeeded') return

    if (ENV.DEBUG_LOGS) {
      console.log('[Company] Active company:', {
        name: info.activeCompanyName,
        id: info.activeCompanyId,
        rule: context.rule,
        erp: context.erp,
        tallyCategory: context.tallyCategory,
        storedCompanyId: context.storedCompanyId,
      })

      if (context.rule === ACTIVE_COMPANY_RULE.STORED && context.storedCompanyId != null && !info.activeCompany) {
        console.warn(
          '[Company] Stored company_id',
          context.storedCompanyId,
          'is not in the company list - the user must pick a company.',
        )
      }
    }

    if (context.rule === ACTIVE_COMPANY_RULE.IS_ACTIVE) {
      rememberSelectedCompany(info.activeCompany)
    }
  }, [info, context, status])
}

export default useActiveCompany

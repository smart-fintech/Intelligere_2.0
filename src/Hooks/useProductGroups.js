/**
 * The active company's product groups, as the choices of the Product form's
 * Group dropdown:
 *
 *   const groups = useProductGroups()          asked for at once
 *   const groups = useProductGroups(isOpen)    only once `enabled` is true -
 *                                              'idle', and nothing fetched, before
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   options   [{ value, label }] - both the group's `group_name`, which is
 *             what a product is saved with
 *   error     the message when the request failed
 *   reload()  asks again - Retry, and after a group has been added.
 *
 * Read with the active company's name, from the store and never typed, and
 * read again whenever the company changes. An older company's groups are
 * never handed out: until the answer for THIS company is in, `options` is
 * empty. A reload keeps the groups already there until the new ones arrive,
 * so an open dropdown is not emptied under the user.
 *
 * Kept in the shared cache (Library/queryCache) per company, like the
 * products: opening the Product form again, or another screen with the
 * dropdown, reuses the answer instead of asking again.
 *
 * refreshProductGroups() reloads the groups for EVERY screen using this hook
 * at that moment - what a new group created elsewhere (the header's Add
 * Stock Group Creation) calls, so the Product form's Group dropdown has it
 * too.
 */

import { useMemo } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { invalidateQueries, useQuery } from '@/Library/queryCache'
import { getProductGroups } from '@/Services/productService'

const NO_GROUPS = []

/** The groups are read again - at once for the screens showing them, on next use for the rest. */
export const refreshProductGroups = () => invalidateQueries(QUERY.PRODUCT_GROUPS, { refetchActive: true })

export default function useProductGroups(enabled = true) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const query = useQuery({
    key: companyName ? [QUERY.PRODUCT_GROUPS, companyName] : null,
    fetch: () => getProductGroups(companyName),
    staleTime: MASTER_DATA_STALE_MS,
    enabled,
  })
  const groups = query.data ?? NO_GROUPS

  const options = useMemo(() => {
    const seen = new Set()

    return groups.reduce((list, group) => {
      const name = String(group?.group_name ?? '').trim()
      if (!name || seen.has(name)) return list

      seen.add(name)
      list.push({ value: name, label: name })
      return list
    }, [])
  }, [groups])

  return {
    status: !enabled || !companyName ? 'idle' : query.status,
    options,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}

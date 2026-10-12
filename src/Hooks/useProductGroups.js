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
 *             Nothing retries on its own.
 *
 * Read with the active company's name, from the store and never typed, and
 * read again whenever the company changes. An older company's groups are
 * never handed out: until the answer for THIS company is in, `options` is
 * empty. A reload keeps the groups already there until the new ones arrive,
 * so an open dropdown is not emptied under the user.
 *
 * refreshProductGroups() reloads the groups for EVERY screen using this hook
 * at that moment - what a new group created elsewhere (the header's Add
 * Stock Group Creation) calls, so the Product form's Group dropdown has it
 * too.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { getProductGroups } from '@/Services/productService'

const NO_GROUPS = []

/** The reload of every mounted useProductGroups - see refreshProductGroups. */
const reloaders = new Set()

export const refreshProductGroups = () => reloaders.forEach((reload) => reload())

export default function useProductGroups(enabled = true) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const [state, setState] = useState({ status: 'loading', groups: NO_GROUPS, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  // Signed up for refreshProductGroups for as long as this screen is here.
  useEffect(() => {
    const reload = () => setAttempt((count) => count + 1)
    reloaders.add(reload)
    return () => reloaders.delete(reload)
  }, [])

  useEffect(() => {
    if (!enabled || !companyName) return

    const requestKey = `${companyName}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getProductGroups(companyName)
      .then((groups) => {
        if (request.current === requestKey) setState({ status: 'ready', groups, error: null, forKey: companyName })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        setState((previous) => ({
          status: 'failed',
          // The groups already there stay if they are this company's.
          groups: previous.forKey === companyName ? previous.groups : NO_GROUPS,
          error: failure.message,
          forKey: companyName,
        }))
      })
  }, [enabled, companyName, attempt])

  const mine = enabled && Boolean(companyName) && state.forKey === companyName
  const groups = mine ? state.groups : NO_GROUPS

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
    status: !enabled || !companyName ? 'idle' : mine ? state.status : 'loading',
    options,
    error: mine ? state.error : null,
    reload: () => {
      setState((previous) => ({ ...previous, status: 'loading' }))
      setAttempt((count) => count + 1)
    },
  }
}

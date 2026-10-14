/**
 * The roles of ONE company, for a form that has to offer them:
 *
 *   const roles = useCompanyRoles(company.company_id)
 *
 *   status   'idle' | 'loading' | 'ready' | 'failed'
 *   roles    the company's roles, as getCompanyRoles returns them
 *   error    the message when the request failed
 *   retry()  asks again - nothing retries on its own
 *
 * With no company id NOTHING is fetched and `status` is 'idle'. The answer is
 * kept with the company it belongs to, as in useWarehouseOptions: one for a
 * company the form has since left is not this company's.
 */

import { useEffect, useRef, useState } from 'react'

import { getCompanyRoles } from '@/Services/roleService'

const NO_ROLES = []

export default function useCompanyRoles(companyId) {
  const [state, setState] = useState({ status: 'loading', roles: NO_ROLES, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyId) return

    const requestKey = `${companyId}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getCompanyRoles(companyId)
      .then((roles) => {
        if (request.current === requestKey) setState({ status: 'ready', roles, error: null, forKey: companyId })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        setState({ status: 'failed', roles: NO_ROLES, error: failure.message, forKey: companyId })
      })
  }, [companyId, attempt])

  const mine = Boolean(companyId) && state.forKey === companyId

  return {
    status: !companyId ? 'idle' : mine ? state.status : 'loading',
    roles: mine ? state.roles : NO_ROLES,
    error: mine ? state.error : null,
    retry: () => {
      setState((previous) => ({ ...previous, forKey: null }))
      setAttempt((count) => count + 1)
    },
  }
}

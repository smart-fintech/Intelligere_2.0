import { useMemo } from 'react'
import { matchPath, useLocation } from 'react-router-dom'

import { MODULE_NAV } from '@/Constants/dashboardModules'

/**
 * The dashboard Details pages to show in the horizontal ModuleNav bar, worked
 * out from the URL. Kept apart from the bar itself so the rules below live in
 * one place for anything else that ever lists these pages.
 *
 * Returns MODULE_NAV in its own order, each page with an extra `active` flag,
 * minus any page marked `hideWhenActive` while it is the one open (there is no
 * point offering a link to the page you are already on).
 *
 * WHICH ONE IS ACTIVE
 * The URL decides, by an exact match - "/dashboard" must not also match
 * "/dashboard/bank-details". matchPath is the same matcher the router itself
 * uses, so a trailing slash or different letter case in a typed URL still
 * lights up the page the router actually rendered.
 *
 * It re-runs whenever the location changes, so the navigation follows every
 * click, Back/Forward and direct visit on its own.
 */
export default function useModuleNav() {
  const { pathname } = useLocation()

  return useMemo(
    () =>
      MODULE_NAV.map((page) => ({
        ...page,
        active: matchPath({ path: page.path, end: true }, pathname) !== null,
      })).filter((page) => !(page.hideWhenActive && page.active)),
    [pathname],
  )
}

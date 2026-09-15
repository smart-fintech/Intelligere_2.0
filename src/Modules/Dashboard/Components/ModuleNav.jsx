import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'

import useModuleNav from '@/Hooks/useModuleNav'
import { cn } from '@/Library/utils'

/**
 * The one horizontal bar across the top of every dashboard page:
 *
 *   Modules & Features | Company Details | Bank Details | Ledger Details | Inventory Details
 *
 * It draws itself from Constants/dashboardModules (MODULE_NAV), so a new page
 * appears here the moment it is added to that list - there is nothing to edit
 * in this file, including the order, which is the order of that list.
 *
 * WHICH ONE IS ACTIVE, AND WHICH ARE SHOWN
 * Decided by Hooks/useModuleNav from the URL - never a prop, so a page can
 * never disagree with the address bar. The left Sidebar uses the same hook,
 * so the two navigations always agree.
 *
 * The chevron carries the same fact as the colour: the open page points down
 * in green, every other page points up in red. That is the convention the
 * rest of this ERP already uses, so it is kept here rather than invented.
 *
 * ON A NARROW SCREEN the bar scrolls sideways rather than wrapping or
 * squeezing, so the layout underneath is never pushed out of shape.
 */
export default function ModuleNav() {
  const pages = useModuleNav()

  return (
    <nav
      aria-label="Dashboard pages"
      className="rounded-md border border-border bg-card shadow-sm"
    >
      {/* `-mx-px px-px` gives the first and last tab's focus ring room inside
          the scroll box instead of being clipped by it. */}
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="flex w-max min-w-full items-center justify-between gap-1 px-2">
          {pages.map((page) => {
            const { active } = page
            const Chevron = active ? ChevronDown : ChevronUp

            return (
              <Link
                key={page.key}
                to={page.path}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  active
                    ? 'font-semibold text-brand'
                    : 'font-medium text-brand/70 hover:bg-brand-soft hover:text-brand',
                )}
              >
                <Chevron
                  className={cn(
                    'size-3.5 shrink-0',
                    active ? 'text-emerald-600' : 'text-destructive',
                  )}
                  strokeWidth={3}
                />
                {page.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

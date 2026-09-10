import { NavLink } from 'react-router-dom'

import { NAV_ITEMS } from '@/Constants/navigation'
import { cn } from '@/Library/utils'

/**
 * The menu down the left hand side of every signed-in page.
 *
 * It draws one row per entry in Constants/navigation.js. Entries marked
 * `ready: false` are shown greyed out and cannot be clicked, because those
 * pages do not exist yet.
 *
 * `open` is owned by AppLayout and toggled by the button in the header:
 *   - wide screens: open = full width with labels, closed = a narrow
 *     icon-only rail (the menu never disappears completely)
 *   - small screens: open = slides over the page, closed = off screen
 */
export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* ---------- Dimmed backdrop, small screens only ----------
          Tapping it closes the drawer. Hidden once there is room for the
          sidebar to sit beside the content (lg and up). */}
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-20 bg-foreground/40 lg:hidden"
        />
      ) : null}
      <aside
        className={cn(
          'z-30 flex shrink-0 flex-col text-primary shadow-lg transition-all duration-200',
          // --- small screens: slide off-canvas drawer ---
          'fixed inset-y-0 left-0 w-64',
          !open && '-translate-x-full',
          // --- large screens: collapse width to 0 when closed ---
          'lg:static lg:translate-x-0',
          open ? 'lg:w-60' : 'lg:w-0',
          // --- completely hide content & prevent leaks when closed ---
          !open && 'overflow-hidden pointer-events-none invisible lg:visible',
          !open && 'lg:overflow-hidden'
        )}
        aria-hidden={!open}
      >
        <nav className={`flex flex-1 flex-col gap-1 p-2 ${open ? "overflow-y-auto" : "overflow-hidden"}`}>
          {NAV_ITEMS.map(({ key, label, icon: Icon, path, ready }) => {
            // Pages that do not exist yet: a dead row, not a link.
            if (!ready) {
              return (
                <span
                  key={key}
                  title={`${label} (coming soon)`}
                  className={cn(
                    'flex h-10 cursor-not-allowed items-center gap-3 rounded-md px-3 opacity-50',
                    !open && 'lg:justify-center lg:px-0',
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className={cn('truncate text-sm', !open && 'lg:hidden')}>
                    {label}
                  </span>
                </span>
              )
            }

            return (
              <NavLink
                key={key}
                to={path}
                // Closes the drawer after a tap on small screens. On large
                // screens the sidebar stays as it was.
                onClick={onClose}
                title={label}
                // NavLink hands its render function an `isActive` flag that
                // is true when the current URL matches `to`. That is how the
                // page you are on gets highlighted - no manual comparing.
                className={({ isActive }) =>
                  cn(
                    'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                    'hover:bg-brand-foreground/15',
                    isActive && 'bg-brand-foreground/20 font-semibold',
                    !open && 'lg:justify-center lg:px-0',
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                <span className={cn('truncate', !open && 'lg:hidden')}>{label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

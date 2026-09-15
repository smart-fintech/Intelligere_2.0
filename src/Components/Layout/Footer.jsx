import {  LifeBuoy, LinkIcon, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'

import Logo from '@/Components/Layout/Logo'
import { ROUTES } from '@/Constants/routes'
import { SUPPORT } from '@/Constants/support'
import { Button } from '../ui/button'

/* ------------------------------------------------------------------ */
/* Small building block used only by this bar                         */
/* ------------------------------------------------------------------ */

/**
 * The little "connected / disconnected" pill on the right.
 *
 * A coloured dot plus a word, so the state reads at a glance and is not
 * carried by colour alone.
 */
// function ConnectionStatus({ label, checking }) {
//   // Anything other than the plain word "Connected" is a problem the user
//   // needs to read - a mismatch, or the same company open on several PCs.
//   const connected = label === 'Connected'

//   return (
//     <span
//       title={label}
//       className={cn(
//         'flex max-w-64 items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-xs font-medium',
//         connected
//           ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
//           : 'border-border bg-muted text-muted-foreground',
//       )}
//     >
//       {checking ? (
//         <Loader2 className="size-3 shrink-0 animate-spin" />
//       ) : (
//         <span
//           className={cn(
//             'size-1.5 shrink-0 rounded-full',
//             connected ? 'bg-emerald-500' : 'bg-muted-foreground/60',
//           )}
//         />
//       )}
//       {checking ? 'Checking...' : label}
//     </span>
//   )
// }

/* ------------------------------------------------------------------ */
/* The footer                                                         */
/* ------------------------------------------------------------------ */

/**
 * The thin bar across the bottom of every signed-in page.
 *
 *   left  - mini logo, the support number, and "Report an Issue"
 *   right - the Tally link and whether Tally is connected
 */
export default function Footer() {
  // The Tally line comes from the one app-wide socket, so the check is the
  // same everywhere and this file holds no socket code of its own.

  return (
    <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-brand-soft/60 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-4">
      {/* ---------------- Left ---------------- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Logo size="sm" showText={false} className="text-brand" />

        {/* The year is taken from the clock rather than typed in, so the
            footer cannot go stale on 1 January. */}
        <span className="text-muted-foreground">
          {new Date().getFullYear()} &copy; DDSPL
        </span>

        {/* Tapping the number dials it on a phone. */}
        <a
          href={SUPPORT.phoneHref}
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-brand"
        >
          <Phone className="size-3.5" />
          {SUPPORT.phone}
        </a>

        {/* ---------- Report an Issue ----------
            Goes to the /issue page. That page is a placeholder for now -
            the real form is still to be designed. */}
        <Link
          to={ROUTES.ISSUE}
          className="flex items-center gap-1.5 font-medium text-brand underline-offset-4 transition-colors hover:text-brand-dark hover:underline"
        >
          <LifeBuoy className="size-3.5" />
          Report an Issue
        </Link>
      </div>

      {/* ---------------- Right ---------------- */}
      <div className="flex items-center gap-0">
        {/* TODO: point this at the Tally settings page once it is built. */}
        <h2 className="text-sm font-medium text-primary">
          Tally :
        </h2>
        {/* Asks every Tally agent on the network to report in. This is the
            "keep listening until stop" call - replies arrive one PC at a
            time and the list closes when the consumer sends stop_loader. */}
        <Button
          variant="link"
          title="Check the Tally connection"
          aria-label="Check the Tally connection"
        >
          <LinkIcon />
        </Button>

        {/* TODO: drive this from the socket once the Tally check is wired up.
            Red because a disconnected agent is a problem the user has to act
            on, not a neutral state. */}
        <span className="font-medium text-destructive">Disconnected</span>

      </div>
    </footer>
  )
}

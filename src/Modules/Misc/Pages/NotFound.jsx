import { Link } from 'react-router-dom'

import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'
import useIsLoggedIn from '@/Hooks/useIsLoggedIn'
import { cn } from '@/Library/utils'

/**
 * Shown by the "*" route in AppRoutes - i.e. whenever the URL in the address
 * bar matches none of the real pages. Without it those URLs render nothing
 * and the screen just goes blank.
 *
 * The same page serves both wildcard routes, and it is rendered in two
 * different frames (see the note at the top of AppRoutes):
 *
 *   signed in  - inside AppLayout, in the strip between header and footer
 *   signed out - on its own, filling the window
 *
 * Only two things follow from that, and both are below: how tall it has to be
 * to look centred, and where its button sensibly leads.
 */
export default function NotFound() {
  const signedIn = useIsLoggedIn()

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 bg-brand-soft/60 px-4 text-center',
        // Inside the shell the window is already taken up by the header and
        // footer, so filling the PARENT is what centres this - `min-h-screen`
        // there would be taller than the space it was given and scroll.
        signedIn ? 'min-h-full' : 'min-h-screen',
      )}
    >
      <p className="text-6xl font-bold text-brand">404</p>
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>

      {/* Somebody already signed in does not want to be sent to the login
          page - the dashboard is the way back into the app for them. */}
      <Button asChild className="mt-2">
        <Link to={signedIn ? ROUTES.DASHBOARD : ROUTES.LOGIN}>
          {signedIn ? 'Go to dashboard' : 'Go to login'}
        </Link>
      </Button>
    </div>
  )
}

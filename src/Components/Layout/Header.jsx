import { useEffect, useRef, useState } from 'react'
import { Bell, LogOut, RefreshCw, User } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/Components/ui/button'
import IconAction from '@/Components/Layout/IconAction'
import Logo from '@/Components/Layout/Logo'
import CompanySwitcher from '@/Modules/Company/Components/CompanySwitcher'
import { ROUTES } from '@/Constants/routes'
// import { STORAGE_KEYS, getItem } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { logout } from '@/Services/tokenService'
import {
  COMPANY_SOCKET_MODULE,
  buildActiveCompanyMessage,
} from '@/Services/companyService'
import { useWebSocket } from '@/Hooks/useWebSocket'
import Bars from '../ui/CustomIcons/Bars'
import { useSelector } from 'react-redux'
import { selectProfileDetails } from '@/Store/Slices/profileSlice'

/* ------------------------------------------------------------------ */
/* The header                                                         */
/* ------------------------------------------------------------------ */

/**
 * How long the Refresh button keeps spinning while it waits for the backend's
 * reply. It is only a safety net so the spinner cannot run for ever - the
 * reply normally stops it, and whether the REQUEST went out is answered by
 * send() itself, not by a timer.
 */
const REPLY_TIMEOUT_MS = 15000

/**
 * The bar across the top of every signed-in page.
 *
 *   left  - sidebar toggle button, then the Intelligere logo
 *   right - the company picker, refresh, notifications, the user, and logout
 *
 * The company picker and its Add company button appear for Intelligere
 * users only. That rule lives inside CompanySwitcher, which renders nothing
 * at all for anyone else, so nothing here has to ask.
 *
 * `onToggleSidebar` is handed down from AppLayout, which owns whether the
 * sidebar is open. The header only asks for the flip; it does not track it.
 */
export default function Header({ onToggleSidebar }) {
  // The email saved at login. Shown next to the avatar so the user can see
  // which account they are in.
  // const email = getItem(STORAGE_KEYS.EMAIL) || 'Signed in'

  // TODO: replace with a real unread count from the notifications API.
  const [notificationCount] = useState(3)
  // True only while the refresh animation is running.
  const [refreshing, setRefreshing] = useState(false)

  const profile = useSelector(selectProfileDetails)

  // Refs, not state, because they are read inside a socket callback that was
  // created on mount: a ref is always the CURRENT value, while state read in
  // there would be the value from the render that registered it.
  const waitingRef = useRef(false)
  const timerRef = useRef(null)

  /** Stops the spinner and forgets the safety-net timer. */
  const stopWaiting = () => {
    waitingRef.current = false
    clearTimeout(timerRef.current)
    timerRef.current = null
    setRefreshing(false)
  }

  /**
   * The app's one WebSocket. There is no `new WebSocket` here, and no
   * connection is created when this component renders: the header only says
   * WHAT to send and WHAT to do with the answer. See Services/socketService.js.
   *
   * `module` means "only company replies, please" - a ledger screen asks for
   * its own module and the two never hear each other. Messages the backend
   * sends to everybody (stop_loader and the like) still arrive here.
   */
  const { send } = useWebSocket({
    module: COMPANY_SOCKET_MODULE,
    onMessage: () => {
      // The backend has answered our refresh, so the spinner can stop. Any
      // screen-specific handling of the data belongs on that screen, which
      // registers its own onMessage.
      if (!waitingRef.current) return

      stopWaiting()
      toast.success('Company data refreshed.')
    },
  })

  /**
   * Refresh: asks the backend to re-read the company the user is working in.
   *
   * The payload is built by companyService (buildActiveCompanyMessage), so the
   * selected company's id and name go with it - empty only when no company has
   * been chosen yet.
   *
   * Nothing here guesses at timing. `await send(...)` resolves when the
   * message is really on the wire, so the button can say honestly whether the
   * request went; the spinner then waits for the backend's reply, not for a
   * fixed delay.
   */
  const handleRefresh = async () => {
    if (waitingRef.current) return

    waitingRef.current = true
    setRefreshing(true)

    const payload = buildActiveCompanyMessage()

    // FIX: Wrap the payload in JSON.stringify()
    const delivered = await send(JSON.stringify(payload))

    if (!delivered) {
      stopWaiting()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    // Sent. Wait for the answer, but never for ever.
    timerRef.current = setTimeout(() => {
      if (!waitingRef.current) return

      stopWaiting()
      toast.info('Refresh sent. The server has not answered yet.')
    }, REPLY_TIMEOUT_MS)
  }

  // A timer must not outlive the header - it would call setState on a
  // component that is no longer on screen.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 sm:px-4">
      {/* ---------------- Left: sidebar button + logo ---------------- */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="text-brand hover:bg-brand-soft hover:text-brand-dark"
        >
          {/* <PanelLeft className="size-5" />
           */}
          <Bars
            strokeWidth={3}
            className="text-primary size-5 transition-colors hover:text-brand"
          />
        </Button>

        {/* Clicking the logo goes home, the way it does on most sites. */}
        <Link
          to={ROUTES.DASHBOARD}
          className="text-brand transition-opacity hover:opacity-80"
        >
          <Logo size="lg" />
        </Link>
      </div>

      {/* ---------------- Right: the action buttons ----------------
          They sit at the right end because this row is `justify-between`
          and this is the second (last) child. To reorder them, just move
          the lines below around. */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* The company picker and its Add button. Both draw themselves only
            for Intelligere users - see CompanySwitcher, which holds that
            rule so this bar does not have to. */}
        {profile?.erp === "Intelligere" && <CompanySwitcher />}

        {/* Refresh is for everybody. It asks the backend to re-read the
            company the user is working in, which every ERP has - and an
            Intelligere user, the one who can actually pick a company, needs
            it most. */}
        <IconAction
          label="Refresh"
          icon={RefreshCw}
          onClick={handleRefresh}
          disabled={refreshing}
          // `animate-spin` is added only while a refresh is in progress.
          className={cn(refreshing && '[&_svg]:animate-spin')}
        />

        {profile?.erp !== "Intelligere" && (
          <IconAction
            label="Notifications"
            icon={Bell}
            badge={notificationCount}
            // TODO: open the notifications panel once it exists.
            onClick={() => toast.info('Notifications are coming soon.')}
          />
        )}
        {/* A thin divider so the account area reads as its own group. */}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />

        {/* ---------------- User profile ----------------
            The avatar is a link: clicking it opens /profile, which reads the
            user's details out of the Redux store. */}
        <div className="flex items-center gap-2">
          <Link
            to={ROUTES.PROFILE}
            title="Profile"
            aria-label="Profile"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-opacity hover:opacity-80"
          >
            <User className="size-4" />
          </Link>

          {/* Hidden on narrow screens - the avatar alone is enough there. */}
          {/* <span className="hidden max-w-40 truncate text-sm text-foreground md:block">
            {email}
          </span> */}
        </div>

        {/* ---------------- Logout ----------------
            logout() tells the server, clears the saved tokens, and then
            sends the browser back to the login page. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={logout}
          tooltip="Log out"
          className="text-brand hover:bg-brand-soft hover:text-brand-dark"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  )
}

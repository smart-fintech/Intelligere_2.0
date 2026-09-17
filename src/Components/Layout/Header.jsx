import { useEffect, useRef, useState } from 'react'
import { Bell, LogOut, RefreshCw, User } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/Components/ui/button'
import IconAction from '@/Components/Layout/IconAction'
import Logo from '@/Components/Layout/Logo'
import CompanySwitcher from '@/Modules/Company/Components/CompanySwitcher'
import { ENV } from '@/Config/env'
import { ROUTES } from '@/Constants/routes'
// import { STORAGE_KEYS, getItem } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { logout } from '@/Services/tokenService'
import {
  COMPANY_SOCKET_MODULE,
  buildActiveCompanyMessage,
  buildDeleteRecentCompaniesPayload,
  deleteRecentCompanies,
  getRecentCompanies,
} from '@/Services/companyService'
import { useWebSocket } from '@/Hooks/useWebSocket'
import Bars from '../ui/CustomIcons/Bars'
import { useDispatch, useSelector } from 'react-redux'
import {
  selectIsGoldTally,
  selectIsSilverTally,
  selectProfileDetails,
} from '@/Store/Slices/profileSlice'
import { fetchCompanies } from '@/Store/Slices/companySlice'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import RecentCompaniesModal from '@/Modules/Company/Components/RecentCompaniesModal'

// import { selectActiveCompany } from '@/Store/Slices/companySlice'

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
 * A browser-console line about the recent-companies step (ENV.DEBUG_LOGS).
 * The socket itself logs its messages as "[Header Tally WS] Message:".
 */
const debug = (...args) => {
  if (ENV.DEBUG_LOGS) console.log('[Tally Recent Companies]', ...args)
}

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

  const dispatch = useDispatch()
  const profile = useSelector(selectProfileDetails)
  // The shared company data - the header never works it out itself.
  const { activeCompanyName } = useActiveCompany()

  // Next to Refresh, for Silver users only: the company the BACKEND marks
  // is_active in tally/user-companies-list/ - never the name a socket reply
  // carried, so a reload of that list is what changes it.
  const isSilver = useSelector(selectIsSilverTally)
  // Tally Gold: Refresh first offers to delete recent companies.
  const isGoldTally = useSelector(selectIsGoldTally)

  // Gold Refresh, before the socket: fetching the recent companies, the
  // list shown in the Delete Company modal (null = closed), and the delete.
  const [preparing, setPreparing] = useState(false)
  const [recentCompanies, setRecentCompanies] = useState(null)
  const [deletingRecent, setDeletingRecent] = useState(false)
  const companyLabel = isSilver ? activeCompanyName.trim() : ''
  // The company being worked in - what the Refresh message is about.
  // const selectedCompany = useSelector(selectActiveCompany)

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
    onMessage: (data) => {
      // { res: { return_module_name, action_status, status, msg, company_name } }
      // Only fetch_tally_company replies count - a bare message the backend
      // sends to everybody is not an answer to Refresh.
      const reply = data?.res ?? {}
      if (reply.return_module_name !== COMPANY_SOCKET_MODULE) return

      // Several replies can arrive; anything before stop_loader is progress.
      if (reply.action_status !== 'stop_loader') return

      const requested = waitingRef.current
      if (requested) stopWaiting()

      // ALWAYS after stop_loader, success or error: reload
      // tally/user-companies-list/ so the store (picker, dashboard, footer
      // check, the name beside Refresh) reflects which company is is_active.
      dispatch(fetchCompanies({ force: true }))

      // The toasts answer a Refresh this header asked for, not a late reply.
      if (!requested) return

      // "No Tally company found", "Free trial is over...", and the like.
      if (reply.status === 'error') {
        toast.error(reply.msg || 'Could not refresh the Tally company.')
        return
      }

      const companyName = typeof reply.company_name === 'string' ? reply.company_name.trim() : ''

      if (reply.status === 'success' && companyName) {
        toast.success(`Tally company "${companyName}" found successfully.`)
        return
      }

      toast.success('Company data refreshed.')
    },
  })

  /**
   * The fetch_tally_company request - what Refresh has always sent. Silver
   * (and everyone but Gold) goes straight here; Gold comes here from the
   * recent-companies step in handleRefresh.
   *
   * The payload is built by companyService (buildActiveCompanyMessage) from the
   * selected company in the store, so its company_id and name go with it -
   * empty only when no company has been chosen yet.
   *
   * Nothing here guesses at timing. `await send(...)` resolves when the
   * message is really on the wire, so the button can say honestly whether the
   * request went; the spinner then waits for the backend's reply, not for a
   * fixed delay.
   */
  const startFetchTallyCompany = async () => {
    if (waitingRef.current) return

    waitingRef.current = true
    setRefreshing(true)

    // const payload = buildActiveCompanyMessage(selectedCompany)
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

      console.warn('[Header Tally WS]', `No stop_loader after ${REPLY_TIMEOUT_MS}ms - spinner stopped`)
      stopWaiting()
      toast.info('Refresh sent. The server has not answered yet.')
    }, REPLY_TIMEOUT_MS)
  }

  /**
   * The Refresh button.
   *
   *   Tally Gold   GET tally/recent_companies/ first. Any there -> the
   *                Delete Company modal, and the fetch starts from its
   *                buttons. None (or the list could not be read) -> the
   *                fetch starts straight away.
   *   everyone     the fetch_tally_company socket request, as before.
   */
  const handleRefresh = async () => {
    if (waitingRef.current || preparing || recentCompanies) return

    if (!isGoldTally) {
      startFetchTallyCompany()
      return
    }

    setPreparing(true)
    let recent = []
    try {
      recent = await getRecentCompanies()
      debug('Response:', recent)
    } catch (error) {
      // Cleaning up is optional; it must never block the fetch itself.
      console.error('[Tally Recent Companies] Could not load - fetching without it:', error)
      toast.warning(`Could not load recent companies: ${error.message}`)
    } finally {
      setPreparing(false)
    }

    if (recent.length === 0) {
      startFetchTallyCompany()
      return
    }

    setRecentCompanies(recent)
  }

  /**
   * "Delete": `companyIds` are the UNTICKED companies (ticked = keep). None
   * unticked -> no Delete call. Either way the fetch follows.
   */
  const handleDeleteRecent = async (companyIds) => {
    if (companyIds.length === 0) {
      setRecentCompanies(null)
      startFetchTallyCompany()
      return
    }

    debug('Delete payload:', buildDeleteRecentCompaniesPayload(companyIds))
    setDeletingRecent(true)
    try {
      const response = await deleteRecentCompanies(companyIds)
      toast.success(response?.msg || `Deleted ${companyIds.length} recent compan${companyIds.length === 1 ? 'y' : 'ies'}.`)
    } catch (error) {
      // The delete is only a clean-up - the fetch still goes ahead.
      console.error('[Tally Recent Companies] Delete failed - fetching anyway:', error)
      toast.error(error.message)
    } finally {
      setDeletingRecent(false)
    }

    setRecentCompanies(null)
    startFetchTallyCompany()
  }

  /** "Continue Without Delete". */
  const handleSkipRecent = () => {
    setRecentCompanies(null)
    startFetchTallyCompany()
  }

  /** The modal's X / Escape: the Refresh is called off. */
  const handleCancelRecent = () => {
    setRecentCompanies(null)
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
          className="text-brand"
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
        {/* The company picker (and, for Intelligere, its Add button). It
            draws itself only for Intelligere and Tally Gold users - see
            CompanySwitcher, which holds that rule so this bar does not. */}
        <CompanySwitcher />

        {/* Refresh is for everybody. It asks the backend to re-read the
            company the user is working in, which every ERP has - and an
            Intelligere user, the one who can actually pick a company, needs
            it most. */}
        {/* Only when there is a name to show - no empty placeholder. */}
        {profile?.erp === "Tally" && companyLabel && (
          <span
            title={companyLabel}
            className="max-w-24 truncate text-md font-medium text-brand sm:max-w-48"
          >
            {companyLabel}
          </span>
        )}

        {profile?.erp === "Tally" && 
        <IconAction
          label="Refresh Company"
          icon={RefreshCw}
          onClick={handleRefresh}
          disabled={refreshing || preparing || Boolean(recentCompanies)}
          // `animate-spin` is added only while a refresh is in progress.
          className={cn((refreshing || preparing) && '[&_svg]:animate-spin')}
        />
        }

        {/* Tally Gold only: opened by Refresh when recent companies exist.
            Mounted only while open, so each opening starts unticked. */}
        {recentCompanies && (
          <RecentCompaniesModal
            open
            companies={recentCompanies}
            busy={deletingRecent}
            onDelete={handleDeleteRecent}
            onSkip={handleSkipRecent}
            onCancel={handleCancelRecent}
          />
        )}


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
            sends the browser back to the login page. The same IconAction
            as Refresh and the bell, so every header button matches. */}
        <IconAction label="Logout" icon={LogOut} onClick={logout} />
      </div>
    </header>
  )
}

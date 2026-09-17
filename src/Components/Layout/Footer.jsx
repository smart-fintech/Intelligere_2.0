import { useEffect, useRef, useState } from 'react'
import { LifeBuoy, LinkIcon, Loader2, Phone } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import Logo from '@/Components/Layout/Logo'
import { ROUTES } from '@/Constants/routes'
import { SUPPORT } from '@/Constants/support'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  TALLY_CONNECTION_MODULE,
  buildTallyConnectionMessage,
  isActiveCompanyConnected,
  isFinalReply,
  readTallyConnectionReply,
  resolveTallyConnection,
  tallySocket,
} from '@/Services/tallyConnectionService'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { ENV } from '@/Config/env'
import { Button } from '../ui/button'

/** A browser-console line about the Tally check (ENV.DEBUG_LOGS). */
const debug = (...args) => {
  if (ENV.DEBUG_LOGS) console.log('[Footer Tally WS]', ...args)
}

/**
 * Several Tally agents can answer one check, each ending with its own
 * stop_loader. After a stop_loader the footer waits this long for another
 * agent before settling; every new reply restarts the wait.
 */
const SETTLE_MS = 1500

/**
 * Safety net: the longest a check may run. Until the backend's stop_loader
 * arrives the spinner keeps going - this only stops it running for ever.
 */
const CHECK_TIMEOUT_MS = 30000

/** Wait after a page load or route change before (re)connecting and checking. */
const CONNECT_DELAY_MS = 1000

/**
 * Whether the automatic check (page load / route change) shows a toast too.
 * Off so moving between pages does not pop a toast each time - the status
 * next to the button still updates. A click always shows one.
 */
const TOAST_ON_AUTO_CHECK = false

/** How each final state is drawn. */
const STATE_STYLES = {
  connected: 'text-emerald-700 dark:text-emerald-400',
  mismatch: 'text-amber-700 dark:text-amber-400',
  disconnected: 'text-destructive',
}

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
  // The company the app is working in - the one Tally should have open.
  const { activeCompanyName } = useActiveCompany()

  const [checking, setChecking] = useState(false)
  // null until the first check has finished.
  const [result, setResult] = useState(null)

  // Refs, not state: they are read inside the socket callback, which was
  // registered once, on mount.
  const runningRef = useRef(false)
  // True while the running check was started by a page load / route change.
  const autoRef = useRef(false)
  const repliesRef = useRef([])
  const settleTimerRef = useRef(null)
  const timeoutRef = useRef(null)
  const companyNameRef = useRef(activeCompanyName)

  useEffect(() => {
    companyNameRef.current = activeCompanyName
  }, [activeCompanyName])

  const clearTimers = () => {
    clearTimeout(settleTimerRef.current)
    clearTimeout(timeoutRef.current)
    settleTimerRef.current = null
    timeoutRef.current = null
  }

  /**
   * Ends the running check with everything gathered so far. Once this has
   * run, `runningRef` is false, so a late or stale reply changes nothing.
   */
  const finish = ({ timedOut = false } = {}) => {
    if (!runningRef.current) return

    runningRef.current = false
    clearTimers()
    setChecking(false)

    const replies = repliesRef.current
    repliesRef.current = []

    const showToast = !autoRef.current || TOAST_ON_AUTO_CHECK

    // No stop_loader ever came: there is no final answer to show.
    if (timedOut) {
      console.warn('[Footer Tally WS]', `No stop_loader after ${CHECK_TIMEOUT_MS}ms - loader stopped`, replies)
      setResult(null)
      if (showToast) toast.error('The live server did not finish the Tally check. Please try again.')
      return
    }

    const outcome = resolveTallyConnection(replies, companyNameRef.current)
    debug('Result:', outcome.label, { activeCompany: companyNameRef.current, replies })
    setResult(outcome)

    if (!showToast) return
    if (outcome.state === 'connected') toast.success(outcome.message)
    else if (outcome.state === 'mismatch') toast.warning(outcome.message)
    else toast.error(outcome.message)
  }

  /**
   * The footer's own connection - `tallySocket`, not the header's shared one.
   * Only tally_check_connection replies reach this handler.
   */
  const { send } = useWebSocket({
    socket: tallySocket,
    module: TALLY_CONNECTION_MODULE,
    onMessage: (data) => {
      // The socket itself logs every message ("[Footer Tally WS] Message:").
      const reply = readTallyConnectionReply(data)
      if (!reply) return

      // No check running: a stale reply, which must not change the result.
      if (!runningRef.current) return

      repliesRef.current.push(reply)

      // Not finished yet - keep listening. A reply arriving during the settle
      // wait also restarts it, so a later agent is never cut off.
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
      if (!isFinalReply(reply)) return

      // The best possible answer cannot be improved on - settle now.
      if (isActiveCompanyConnected(reply, companyNameRef.current)) {
        finish()
        return
      }

      settleTimerRef.current = setTimeout(finish, SETTLE_MS)
    },
  })

  /**
   * Runs one check: loader on, payload out, then the replies decide.
   * `auto` marks the page-load / route-change check (no toast by default).
   * A check already running is never interrupted.
   */
  const startCheck = async ({ auto = false } = {}) => {
    if (runningRef.current) return

    runningRef.current = true
    autoRef.current = auto
    repliesRef.current = []
    clearTimers()
    setChecking(true)

    const delivered = await send(buildTallyConnectionMessage())

    // finish() may already have run (sign-out closes the socket).
    if (!runningRef.current) return

    if (!delivered) {
      runningRef.current = false
      clearTimers()
      setChecking(false)
      if (!auto || TOAST_ON_AUTO_CHECK) toast.error('Could not reach the live server. Please try again.')
      return
    }

    timeoutRef.current = setTimeout(() => finish({ timedOut: true }), CHECK_TIMEOUT_MS)
  }

  /** "Check Tally Connection". A click while a check runs is ignored. */
  const handleCheck = () => startCheck()

  /**
   * Page load and every URL change:
   *
   *   wait 1s -> make sure the connection is up (never a second one) ->
   *   once it is OPEN, send the check -> replies -> stop_loader -> result
   *
   * The footer lives in AppLayout, which stays mounted while the pages inside
   * it change, so the socket is not closed by navigation; it is only reopened
   * here if it had dropped. A quick run of route changes restarts the wait,
   * so only the last one connects and checks.
   */
  const { pathname } = useLocation()

  useEffect(() => {
    let stopWaitingForOpen = null
    let cancelled = false
    let sent = false

    const timer = setTimeout(() => {
      tallySocket.ensureConnected()

      // Send only once the socket is really OPEN. onOpen runs straight away
      // when it already is, otherwise on the next successful connect.
      const stop = tallySocket.onOpen(() => {
        if (sent || cancelled) return
        sent = true
        startCheck({ auto: true })
      })
      if (sent) stop()
      else stopWaitingForOpen = stop
    }, CONNECT_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      stopWaitingForOpen?.()
    }
    // startCheck is a plain function recreated each render; only a new URL
    // should restart this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Timers must not outlive the footer, and a check in flight is abandoned.
  useEffect(
    () => () => {
      runningRef.current = false
      clearTimeout(settleTimerRef.current)
      clearTimeout(timeoutRef.current)
    },
    [],
  )

  const statusLabel = checking ? 'Checking...' : (result?.label ?? 'Not checked')
  const statusTitle = result?.reply?.pc_name
    ? `${result.message} (${result.reply.pc_name})`
    : result?.message

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
          type="button"
          variant="link"
          title="Check Tally Connection"
          aria-label="Check Tally Connection"
          onClick={handleCheck}
          disabled={checking}
        >
          {checking ? <Loader2 className="animate-spin" /> : <LinkIcon />}
        </Button>

        {/* Red for a problem the user has to act on, amber for Tally open on
            the wrong company, green when all is well. */}
        <span
          role="status"
          aria-live="polite"
          title={statusTitle}
          className={cn(
            'max-w-64 truncate font-medium',
            checking || !result ? 'text-muted-foreground' : STATE_STYLES[result.state],
          )}
        >
          {statusLabel}
        </span>

      </div>
    </footer>
  )
}

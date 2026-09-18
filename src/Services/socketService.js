/**
* THE ONE WEBSOCKET FOR THE WHOLE APP - the transport, and nothing else.
*
* This file knows how to open a connection, keep it open, send JSON and hand
* incoming JSON out again. It knows NOTHING about companies, ledgers, or any
* other module: no payload is built here, and no module's function is called
* from here. That is what lets every future module share one connection.
*
* ┌──────────────────────────────────────────────┐
* │ socketService (this file)                    │
* │ connect / send / disconnect / reconnect      │
* │ onMessage / common messages / retries        │
* └───────────────┬──────────────────────────────┘
*                 │ useWebSocket()  (@/Hooks/useWebSocket)
*    ┌────────────┼────────────┐
*    ▼            ▼            ▼
*  Header       Ledger       any module
*  payload A    payload B    payload C
*  callback A   callback B   callback C
*
* HOW A MODULE USES IT (from a component - the normal way):
*
* const { send, isConnected } = useWebSocket({
* module: 'ledger', // only ledger replies, please
* onMessage: (data) => setRows(data.rows), // this module's own handler
* })
*
* send({ res: { message: { module: 'ledger', action: 'fetch', ledger_id } } })
*
* From a plain service (no React), the same two calls exist here:
*
* import { send, onMessage } from '@/Services/socketService'
*
* ------------------------------------------------------------------
* THE FIVE RULES THAT KEEP IT CALM
* ------------------------------------------------------------------
* 1. ONE CONNECTION. `socket` below is the only WebSocket in the app. Every
* guard in openSocket() exists to keep it that way, so no amount of
* re-rendering or repeated sending can produce a second one.
*
* 2. NOTHING CONNECTS UNTIL THE APP REALLY USES IT. Signing in only ALLOWS a
* connection (enable()). It is opened by the first send(), or by a module
* that explicitly asks to listen from the start. A screen that never uses
* the socket never opens one - so a backend that is down stays quiet.
*
* 3. IT ONLY TALKS ABOUT REAL MESSAGES. Retries are silent. The only lines
* printed are about messages the app actually tried to send, and only in
* development.
*
* 4. NOTHING IS LOST TO TIMING. send() returns a promise that resolves when
* the message is really on the wire, so a caller can wait for delivery
* instead of guessing with setTimeout.
*
* 5. A SERVER THAT IS NOT THERE IS ASKED ONCE. Retrying is for a connection
* that WAS working and dropped. A first attempt that fails gets one try,
* one line in the console, and one answer to the caller - see
* scheduleRetry(). Trying again is then the user's call, not the app's.
*/

import { ENV } from '@/Config/env'
import { getUuid } from '@/Library/secureStorage'

/**
 * Builds one independent connection: its own socket, queue, retries and
 * listeners. The app's shared connection is the instance created at the
 * bottom of this file; a feature that genuinely needs a SEPARATE connection
 * (the footer's Tally check - see tallyConnectionService) makes its own with
 * this, once, at module level - never inside a component.
 *
 * `name` only labels the console lines, so two connections can be told apart.
 */
export const createSocket = ({ name = 'socket' } = {}) => {
  const tag = `[${name}]`

  /**
   * A browser-console line for this connection (ENV.DEBUG_LOGS). Kept to the
   * lines worth reading: Connected, Message, Closed - plus errors, which are
   * always printed.
   */
  const debug = (...args) => {
    if (ENV.DEBUG_LOGS) console.log(tag, ...args)
  }

  /* ------------------------------------------------------------------ */
  /* Settings */
  /* ------------------------------------------------------------------ */

  // Wait before trying again: 1s, 2s, 4s ... never more than 30s apart.
  // How MANY tries is VITE_API_WEBSOCKET_RETRIES in the .env file.
  const FIRST_RETRY_MS = 1000
  const MAX_RETRY_MS = 30000

  // Most messages that may wait for the socket to open. Past this the oldest is
  // dropped (and its promise resolves false), so an outage cannot grow the list
  // forever.
  const MAX_QUEUED = 50

  // Once we have given up, a new send starts a fresh set of tries - but no
  // sooner than this after the last failure. It is the safety net for a
  // component that sends on every render by mistake.
  const COOLDOWN_MS = 5000

  /* ------------------------------------------------------------------ */
  /* State - all of it private to this file */
  /* ------------------------------------------------------------------ */

  // The live socket, or null. It doubles as the "an attempt is already in
  // flight" flag, because it is set while the socket is still CONNECTING.
  let socket = null

  /** 'closed' | 'connecting' | 'open' - read it with getStatus(). */
  let status = 'closed'

  // True while somebody is signed in, so connecting is ALLOWED (see enable()).
  // False before sign-in and after logout, which is what stops a signed-out tab
  // from ever opening a socket.
  let allowed = false

  // True once the app has actually used the socket. Until then we do not open
  // one - see rule 2 above.
  let inUse = false

  let failedTries = 0 // failures in a row: decides the wait, and when to stop
  let retryTimer = null // the attempt already booked, if any
  let gaveUp = false // stopped trying; only wake() starts it again
  let lastFailureAt = 0 // when the last attempt failed - used for the cooldown

  // True once this connection has actually been working. It is what separates
  // the two cases in scheduleRetry(): a connection that DROPPED is worth
  // chasing, a server that never answered in the first place is not.
  let everConnected = false

  /**
   * Messages waiting for the socket to open, each with the resolve() of the
   * promise send() handed back: true when it goes out, false if it is dropped.
   */
  const queue = []

  /** Listeners: { handler, module } - see onMessage() for what `module` means. */
  const messageListeners = new Set()
  const openListeners = new Set()
  const statusListeners = new Set()
  const busyListeners = new Set()

  /* ------------------------------------------------------------------ */
  /* Small helpers */
  /* ------------------------------------------------------------------ */

  /**
   * The address to connect to, or null when there is no uuid to connect as.
   * Both halves come from the .env file, so switching consumer or server never
   * means editing this file:
   *
   *  ws://127.0.0.1:8000/ + ws/allinoneconsumer-socket-server/ + <uuid>/
   *  VITE_API_WEBSOCKET_URL VITE_API_WEBSOCKET_PATH
   */
  const buildUrl = () => {
    const uuid = getUuid()
    if (!uuid) return null

    return `${ENV.WS_BASE_URL}${ENV.WS_PATH}${uuid}/`
  }

  /** Is a connection wanted at all right now? (rule 2) */
  const needed = () => inUse || queue.length > 0

  /** Calls every listener. One broken listener must not stop the others. */
  const notify = (listeners, value, label) => {
    listeners.forEach((listener) => {
      try {
        listener(value)
      } catch (error) {
        console.error(`${tag} a ${label} failed`, error)
      }
    })
  }

  const setStatus = (next) => {
    if (status === next) return
    status = next
    notify(statusListeners, status, 'status listener')
  }

  const clearRetry = () => {
    if (!retryTimer) return
    clearTimeout(retryTimer)
    retryTimer = null
  }

  /** Detaches the handlers of a socket we are finished with. */
  const detach = (ws) => {
    if (!ws) return
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
  }

  /* ------------------------------------------------------------------ */
  /* Reading a message - the ONLY thing assumed about its shape */
  /* ------------------------------------------------------------------ */

  /**
   * The interesting part of whatever arrived.
   *
   * The backend sends three shapes and this copes with all of them, without
   * caring what is inside them:
   *
   *  { res: { message: { module_name: 'fetch_tally_company', ... } } } a module's reply
   *  { res: { return_module_name: 'tally_check_connection',
   *           action_status: 'stop_loader', ... } }             a module's reply
   *  { message: { msg: 'stop_loader' } } a common message
   *
   * Anything else is handed back as-is, so a new shape cannot break this file.
   */
  const readMessage = (data) => {
    if (!data || typeof data !== 'object') return {}
    return data.res?.message ?? data.message ?? data.res ?? data
  }

  /** Which module a message belongs to, or null when it is for everybody. */
  const readModule = (data) => {
    const message = readMessage(data)
    return message.module ?? message.return_module_name ?? null
  }

  /* ------------------------------------------------------------------ */
  /* Common messages - handled centrally, for everybody  */
  /* ------------------------------------------------------------------ */

  // Whether the backend says it is busy working on something. `stop_loader` is
  // the message the old project watched for; anything that wants to know reads
  // it reads it with isBusy(), or `isBusy` from useWebSocket(). No module's
  // function is named here.
  let busy = false

  const setBusy = (next) => {
    if (busy === next) return
    busy = next
    notify(busyListeners, busy, 'busy listener')
  }

  /**
   * Messages that are not about one module, and what the app does about them.
   *
   * TO ADD ONE: add a line. Keep it to something app-wide (a flag, a toast) -
   * a job for one screen belongs in that screen's onMessage callback, because
   * only that screen knows when it is on display.
   */
  const COMMON_MESSAGES = {
    start_loader: () => setBusy(true),
    stop_loader: () => setBusy(false),
  }

  /** Runs the common handler for a message, if it is one. */
  const handleCommonMessage = (data) => {
    // The older shape says it in `msg`, the newer one in `action_status`.
    const message = readMessage(data)
    // hasOwn, so free text such as "constructor" is never mistaken for one.
    const key = [message.msg, message.action_status].find(
      (value) => typeof value === 'string' && Object.hasOwn(COMMON_MESSAGES, value),
    )
    const handler = key ? COMMON_MESSAGES[key] : null

    if (handler) handler()
  }

  /* ------------------------------------------------------------------ */
  /* The waiting list */
  /* ------------------------------------------------------------------ */

  /** Empties the waiting list into a socket that has just opened. */
  const flushQueue = () => {
    while (queue.length > 0 && socket && socket.readyState === WebSocket.OPEN) {
      const item = queue.shift()
      socket.send(item.text)
      item.settle(true) // delivered - whoever awaited send() can carry on
    }
  }

  /** Gives up on the waiting list, telling each caller it did not go. */
  const dropQueue = () => {
    if (queue.length === 0) return

    console.warn(tag, `Could not deliver ${queue.length} message(s) - the server is not answering`)
    queue.forEach((item) => item.settle(false))
    queue.length = 0
  }

  /* ------------------------------------------------------------------ */
  /* Opening, retrying, closing */
  /* ------------------------------------------------------------------ */

  /**
   * Stops trying, and tells everyone who was waiting that their message is not
   * going. Nothing restarts on its own after this; it takes a new reason - a
   * fresh send once the cooldown has passed, a "try again" button, or the
   * network coming back.
   */
  const stopTrying = () => {
    gaveUp = true

    // Whatever we had is gone, so the next attempt is a cold one again - a
    // single try, not another ladder.
    everConnected = false

    dropQueue()
  }

  /**
   * Books the next attempt, waiting a little longer each time. Silent by design
   * - the one thing worth saying is said by dropQueue(), because that is the
   * only case where something the app asked for did not happen.
   *
   * ------------------------------------------------------------------
   * WHY A FAILED FIRST ATTEMPT IS NOT RETRIED
   * ------------------------------------------------------------------
   * The ladder below is for a connection that WAS working and dropped - a
   * network blip or a server restart, where waiting a moment really does fix it.
   *
   * A first attempt that fails is a different thing: the server is not there.
   * Knocking three more times cannot change that. It only repeats the browser's
   * red "WebSocket connection failed" line in the console, and makes the user
   * wait 1s + 2s + 4s before the screen finally admits what it already knew. So
   * a cold attempt gets exactly ONE try, one console line, and one clear answer.
   */
  const scheduleRetry = () => {
    if (retryTimer || !allowed || !needed()) return

    if (!everConnected || failedTries >= ENV.WS_MAX_RETRIES) {
      stopTrying()
      return
    }

    const wait = Math.min(FIRST_RETRY_MS * 2 ** failedTries, MAX_RETRY_MS)
    failedTries += 1

    retryTimer = setTimeout(() => {
      retryTimer = null
      openSocket()
    }, wait)
  }

  /**
   * Opens the socket - but only when that makes sense. Each guard is a reason
   * NOT to start a connection, and together they are rule 1 and rule 2.
   */
  const openSocket = () => {
    if (!needed()) return // the app is not using the socket - stay closed
    if (!allowed) return // nobody is signed in (yet) - enable() opens it then
    if (socket) return // one is already open, or on its way up
    if (retryTimer) return // an attempt is already booked - let it happen
    if (gaveUp) return // we stopped trying; wake() starts us again
    if (navigator.onLine === false) return // no network; 'online' wakes us up

    // No uuid means the session is not ready. Anything queued stays queued and
    // the next send tries again.
    const url = buildUrl()
    if (!url) return

    setStatus('connecting')
    socket = new WebSocket(url)

    socket.onopen = () => {
      debug('Connected')
      failedTries = 0
      gaveUp = false

      // From here on a drop is worth retrying - see scheduleRetry().
      everConnected = true
      setStatus('open')

      // Everything asked for while it was opening goes out first, in order...
      flushQueue()

      // ...then whatever modules asked to do on every (re)connect.
      notify(openListeners, undefined, 'open listener')
    }

    socket.onmessage = (event) => {
      // Parsed safely: a reply that is not JSON is passed on as the plain text
      // it arrived as, rather than throwing inside the socket.
      let data = event.data
      try {
        data = JSON.parse(event.data)
      } catch {
        /* not JSON - keep the raw text */
      }

      debug('Message:', data)

      // 1. app-wide messages first (stop_loader and friends), handled once...
      handleCommonMessage(data)

      // 2. ...then each module's own callback. A listener that named a module
      // hears that module and the messages meant for everybody; a listener
      // that named none hears the lot.
      const module = readModule(data)

      messageListeners.forEach((entry) => {
        if (entry.module && module && entry.module !== module) return

        try {
          entry.handler(data)
        } catch (error) {
          console.error(`${tag} a message listener failed`, error)
        }
      })
    }

    // The browser's error event carries little more than `{ isTrusted: true }`,
    // and onclose always follows it - so this only logs.
    socket.onerror = (error) => {
      console.error(tag, 'Error:', error)
    }

    socket.onclose = (event) => {
      debug('Closed:', { code: event?.code, reason: event?.reason })
      detach(socket)
      socket = null
      lastFailureAt = Date.now()
      setStatus('closed')

      // Closed by hand (logout) stops here; anything else is retried.
      scheduleRetry()
    }
  }

  /**
   * "Something needs the socket now." Called by send(), and by a module that
   * asks to listen from the start. If we had given up, this starts a fresh set
   * of attempts - but only once the cooldown has passed.
   */
  const wake = () => {
    if (gaveUp && Date.now() - lastFailureAt >= COOLDOWN_MS) {
      gaveUp = false
      failedTries = 0
    }

    openSocket()
  }

  /* ------------------------------------------------------------------ */
  /* The connection, turned on and off */
  /* ------------------------------------------------------------------ */

  /**
   * "Somebody is signed in - connecting is allowed from now on."
   *
   * SocketProvider calls this on load and on sign-in. It deliberately does not
   * open anything (rule 2): the first send() does that.
   */
  const enable = () => {
    allowed = true
    gaveUp = false
    failedTries = 0

    // Opens nothing unless something already asked for the connection before
    // it was allowed - a component's mount effect runs BEFORE SocketProvider's,
    // so its request would otherwise be lost. needed() keeps rule 2.
    openSocket()
  }

  /**
   * "This connection should be up now" - for a feature that must stay
   * connected (the footer's Tally check). Safe to call on every page change:
   * it opens nothing when the socket is already open or on its way up, and
   * nothing while nobody is signed in (it will open once enable() runs).
   */
  const ensureConnected = () => {
    inUse = true
    if (socket || retryTimer) return
    gaveUp = false
    failedTries = 0
    openSocket()
  }

  /**
   * Opens the connection now and forgets earlier failures.
   *
   * Modules rarely need this - send() and `connectOnMount` already open it. Use
   * it for a "try again" button.
   */
  const connect = () => {
    allowed = true
    inUse = true
    gaveUp = false
    failedTries = 0
    clearRetry()
    openSocket()
  }

  /**
   * Closes the connection and forbids reconnecting - called on logout.
   * Anything still waiting is dropped, and its send() promise resolves false.
   */
  const disconnect = () => {
    allowed = false
    inUse = false
    gaveUp = false
    failedTries = 0
    everConnected = false
    clearRetry()

    queue.forEach((item) => item.settle(false))
    queue.length = 0

    const ws = socket
    socket = null
    detach(ws)
    if (ws) ws.close()

    setBusy(false)
    setStatus('closed')
  }

  /** Throws the current connection away and opens a fresh one. */
  const reconnect = () => {
    const ws = socket
    socket = null
    detach(ws)
    if (ws) ws.close()

    clearRetry()
    connect()
  }

  /**
   * When the network comes back, give a needed connection one clean attempt.
   * It costs nothing when all is well - connect() opens nothing if the socket
   * is already up.
   */
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (allowed && needed() && !socket) {
        gaveUp = false
        failedTries = 0
        openSocket()
      }
    })
  }

  /* ------------------------------------------------------------------ */
  /* Sending - any shape of payload, from any module */
  /* ------------------------------------------------------------------ */

  /**
   * Sends one message and says when it really went.
   *
   * The payload is yours: any JSON-able object (a string is sent unchanged).
   * This file never looks inside it, so a new module needs no change here.
   *
   * Returns a PROMISE that resolves:
   * true - it is on the wire (straight away, or after the socket opened)
   * false - it could not be delivered and has been dropped
   *
   * That is what lets a caller do the right thing without a guessed timeout:
   *
   * const delivered = await send(payload)
   * if (delivered) reloadThePage()
   */
  const send = (payload) => {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload)

    // The app is using the socket now, so from here on it may open and reopen.
    inUse = true

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(text)
      return Promise.resolve(true)
    }

    return new Promise((resolve) => {
      queue.push({ text, settle: resolve })

      // The oldest goes when the list is full - and its caller is told.
      if (queue.length > MAX_QUEUED) queue.shift().settle(false)

      // This is what opens the socket in normal use. It never cancels a retry
      // that is already waiting, so repeated sends cannot pile up connections.
      wake()

      // wake() is allowed to decide that no attempt should be made at all: we
      // gave up moments ago and the cooldown has not passed, the browser is
      // offline, there is no uuid yet, or nobody is signed in. Nobody is coming,
      // so answer the caller NOW - a button that asked "did it go?" gets its
      // false immediately instead of spinning against a socket that will never
      // open.
      if (!socket && !retryTimer) dropQueue()
    })
  }

  /**
   * Sends a whole list, in order. Resolves once every one of them has been
   * dealt with, to an array of true/false in the same order.
   */
  const sendAll = (payloads = []) => Promise.all(payloads.map((one) => send(one)))

  /* ------------------------------------------------------------------ */
  /* Listening - each module gets what it asked for */
  /* ------------------------------------------------------------------ */

  /**
   * Runs `handler(data)` for messages from the server, already parsed.
   *
   * Options:
   * module only messages whose `module` matches (plus the ones with
   * no module, which are meant for everybody). Leave it out
   * to receive everything.
   * connectOnMount true if this module needs the connection open even
   * before it sends anything - for a screen that only
   * listens. Default false, which keeps a quiet screen from
   *  a socket it never uses.
   *
   * Returns a function that removes the handler again - call it on unmount.
   */
  const onMessage = (handler, { module = null, connectOnMount = false } = {}) => {
    const entry = { handler, module }
    messageListeners.add(entry)

    if (connectOnMount) {
      inUse = true
      wake()
    }

    return () => messageListeners.delete(entry)
  }

  /**
   * Runs `handler` every time the socket opens - and now, if it is already
   * open, so it behaves the same whether it registered early or late.
   *
   * For something that must be redone after a RECONNECT (re-subscribing, say).
   * A one-off push of data should just use send(), which already waits.
   *
   * Returns a function that removes the handler again.
   */
  const onOpen = (handler) => {
    openListeners.add(handler)

    if (status === 'open') {
      try {
        handler()
      } catch (error) {
        console.error(`${tag} an open listener failed`, error)
      }
    }

    return () => openListeners.delete(handler)
  }

  /**
   * Called with 'closed' | 'connecting' | 'open' whenever that changes. Purely
   * an observer: watching the status never opens a connection, so a status dot
   * in the header cannot cause one.
   */
  const onStatusChange = (handler) => {
    statusListeners.add(handler)
    return () => statusListeners.delete(handler)
  }

  /** Called with true/false when the backend starts or stops working. */
  const onBusyChange = (handler) => {
    busyListeners.add(handler)
    return () => busyListeners.delete(handler)
  }

  /* ------------------------------------------------------------------ */
  /* Reading the current state */
  /* ------------------------------------------------------------------ */

  /** 'closed' | 'connecting' | 'open' */
  const getStatus = () => status

  /** True when a message sent this instant would go straight out. */
  const isSocketOpen = () => status === 'open'

  /** True between start_loader and stop_loader - see COMMON_MESSAGES. */
  const isBusy = () => busy

  return {
    enable,
    ensureConnected,
    connect,
    disconnect,
    reconnect,
    send,
    sendAll,
    onMessage,
    onOpen,
    onStatusChange,
    onBusyChange,
    getStatus,
    isSocketOpen,
    isBusy,
  }
}

/* ------------------------------------------------------------------ */
/* The app's one shared connection                                    */
/* ------------------------------------------------------------------ */

// Named for the header because its Tally Refresh is what uses it today; any
// other module that calls useWebSocket() without a `socket` shares it too.
export const appSocket = createSocket({ name: 'Header Tally WS' })

export const {
  enable,
  connect,
  disconnect,
  reconnect,
  send,
  sendAll,
  onMessage,
  onOpen,
  onStatusChange,
  onBusyChange,
  getStatus,
  isSocketOpen,
  isBusy,
} = appSocket

/**
 * HOW A COMPONENT USES THE APP'S ONE WEBSOCKET.
 *
 * The connection itself lives in Services/socketService.js and is shared by
 * every module. This hook only wires it into React: it subscribes on mount,
 * unsubscribes on unmount, and re-renders the component when the connection
 * comes up or goes down.
 *
 * ------------------------------------------------------------------
 * THE WHOLE API
 * ------------------------------------------------------------------
 *   const { send, isConnected } = useWebSocket({
 *     module: 'ledger',                   // optional filter, see below
 *     onMessage: (data) => { ... },       // this module's own handler
 *     onOpen: () => { ... },              // optional, runs on every connect
 *     connectOnMount: false,              // optional, see below
 *     socket: appSocket,                  // optional, see below
 *   })
 *
 *   await send({ res: { message: { module: 'ledger', action: 'fetch' } } })
 *
 * Two modules can do this at the same time with completely different payloads
 * and completely different handlers. They still share ONE connection.
 *
 * ------------------------------------------------------------------
 * `module` - which replies you want
 * ------------------------------------------------------------------
 * Give it and you hear only messages tagged with that module, plus the ones
 * the backend sends to everybody (`{ message: { msg: 'stop_loader' } }` has no
 * module, so everybody gets it). Leave it out and you hear everything.
 *
 * ------------------------------------------------------------------
 * `connectOnMount` - who opens the connection
 * ------------------------------------------------------------------
 * By default nothing is opened until this component actually sends something.
 * That is deliberate: a screen that never uses the socket should not be
 * knocking on the server's door, and a backend that is down should not put an
 * error in the console of a screen that was not even asking.
 *
 * Pass `connectOnMount: true` for a screen that only LISTENS - one waiting for
 * data the backend pushes on its own, with nothing to send first.
 *
 * ------------------------------------------------------------------
 * `socket` - which connection
 * ------------------------------------------------------------------
 * Leave it out and you get the app's shared connection - what almost every
 * screen wants. Pass another instance made by createSocket() (at module level,
 * never in a component) only for a feature that must have its own - the
 * footer's Tally check passes `tallySocket`.
 *
 * ------------------------------------------------------------------
 * WHY THERE IS NO DEPENDENCY ARRAY TO GET WRONG
 * ------------------------------------------------------------------
 * The old pattern re-created the socket whenever state changed:
 *
 *   useEffect(() => { createWebSocket() }, [socketData])   // don't
 *
 * Here the callbacks are kept in a ref that is refreshed on every render, so
 * the subscription is made ONCE on mount, while your handler always sees the
 * newest props and state. An inline arrow function is fine - no useCallback,
 * no re-subscribing, no stale closure, and never a second connection.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'

import { appSocket } from '@/Services/socketService'

/**
 * Keeps a box holding the newest version of a value.
 *
 * The effects below subscribe once, on mount, but must call the handler the
 * component passed on its LATEST render - otherwise the handler would go on
 * reading the state it was created with. Writing to the box in its own effect
 * (declared first, so it runs first) keeps that update out of render, which
 * React does not allow.
 */
const useLatest = (value) => {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  })

  return ref
}

/**
 * The hook every module uses. Every option is optional: called with nothing,
 * it just gives you send() and the connection status.
 */
export const useWebSocket = ({
  module = null,
  onMessage: handleMessage,
  onOpen: handleOpen,
  connectOnMount = false,
  socket = appSocket,
} = {}) => {
  const {
    connect,
    disconnect,
    getStatus,
    isBusy,
    onBusyChange,
    onMessage,
    onOpen,
    onStatusChange,
    reconnect,
    send,
    sendAll,
  } = socket

  const messageRef = useLatest(handleMessage)
  const openRef = useLatest(handleOpen)

  // useSyncExternalStore is React's built-in way to read a value that lives
  // outside React: subscribe to changes, and read the current value.
  const status = useSyncExternalStore(onStatusChange, getStatus, getStatus)
  const busy = useSyncExternalStore(onBusyChange, isBusy, isBusy)

  // Subscribed once, on mount. `module` and `connectOnMount` are values, not
  // functions, so they can safely sit in the dependency array: the only way
  // to re-subscribe is to genuinely ask for a different module.
  useEffect(
    () => onMessage((data) => messageRef.current?.(data), { module, connectOnMount }),
    [module, connectOnMount, messageRef, onMessage],
  )

  useEffect(() => onOpen(() => openRef.current?.()), [openRef, onOpen])

  return {
    /** send(payload) -> promise: true once delivered, false if it could not be. */
    send,
    /** sendAll([a, b]) -> promise of an array of true/false, in order. */
    sendAll,

    /** True when a message sent this instant goes straight out. */
    isConnected: status === 'open',
    /** 'closed' | 'connecting' | 'open' - the component re-renders on change. */
    status,
    /** True between the backend's start_loader and stop_loader messages. */
    isBusy: busy,

    // Rarely needed: the lifecycle is SocketProvider's job, and send() opens
    // the connection by itself. Here for a "try again" button.
    connect,
    reconnect,
    disconnect,
  }
}

export default useWebSocket

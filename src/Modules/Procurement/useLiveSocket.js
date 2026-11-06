/**
 * One of Procurement's own live sockets - the pre bid chat's
 * (ws/pre_bid_chat/<id>/) and the bid's (ws/auction_bid/<id>/). They follow
 * the same rules (payload_res 19), kept here once:
 *
 *   const live = useLiveSocket({ id, url, onMessage, onConnected })
 *
 *   id            what the socket is for, as text ("chat:3"); a new id closes
 *                 the old socket and opens the new one, null opens none
 *   url()         its address, read at each (re)connect - so a renewed login
 *                 token is the one sent; null when it cannot be opened
 *   onConnected   the server's { type: "connected" }: load the data again, so
 *                 nothing that changed while the socket was down is missed
 *   onMessage     every other message, parsed (a "pong" is dropped here)
 *   live          true while the socket is open
 *
 *   - a { type: "ping" } every 25 seconds keeps it open
 *   - one socket at a time: opened once the screen has settled (so a mount
 *     React undoes at once - StrictMode in development - opens nothing), and
 *     closed when the id changes or the screen goes
 *
 * When it closes (LIVE_SOCKET):
 *   4403, 4404    refused for good (not allowed, no such bid) - not tried again
 *   4401          the login was refused - tried again only once the app holds
 *                 a new token (onTokensChanged)
 *   anything else tried again after 1s, 2s, 4s, 8s; a socket that was open
 *                 starts that count afresh. Once RETRY_LIMIT tries in a row
 *                 have failed - the server is down, or does not serve the
 *                 socket at all - it waits: the browser coming back online or
 *                 the tab being shown again starts a new round. So an
 *                 unreachable socket costs a few tries, not one every 30
 *                 seconds for as long as the screen is open.
 *
 * Nothing here writes the address to the console (it carries the login
 * token). With VITE_DEBUG_LOGS on, a socket that stops trying says so once,
 * by its id. The screens work without the socket - they load their data over
 * HTTP as before; the socket only brings changes sooner.
 *
 * These are separate from the app's one socket (Services/Global/socketService),
 * which nothing here touches.
 */

import { useEffect, useRef, useState } from 'react'

import { ENV } from '@/Config/env'
import { LIVE_SOCKET } from '@/Constants/procurementAutomation'
import { onTokensChanged } from '@/Services/Auth/tokenService'

/** Why a socket has stopped trying, and what starts it again. */
const WAITING = Object.freeze({
  NETWORK: 'network', // the network or the tab coming back
  LOGIN: 'login', // a new login token
  NEVER: 'never', // refused for good
})

export default function useLiveSocket({ id, url, onMessage, onConnected }) {
  const [live, setLive] = useState(false)

  // The handlers outlive renders; these keep them current without reopening.
  const handlers = useRef({ url, onMessage, onConnected })
  useEffect(() => {
    handlers.current = { url, onMessage, onConnected }
  })

  useEffect(() => {
    if (id === null || id === undefined) return undefined

    let socket = null
    let ping = null
    let timer = null
    let failures = 0
    let waiting = null
    let stopped = false

    const wait = (reason, why) => {
      waiting = reason
      if (ENV.DEBUG_LOGS) console.warn(`[Procurement] live socket ${id}: ${why} - not trying again for now.`)
    }

    const open = () => {
      timer = null
      if (stopped || socket) return
      if (navigator.onLine === false) {
        wait(WAITING.NETWORK, 'offline')
        return
      }
      const address = handlers.current.url()
      if (!address) return

      waiting = null
      const current = new WebSocket(address)
      socket = current
      let opened = false

      current.onopen = () => {
        opened = true
        failures = 0
        setLive(true)
        ping = setInterval(() => {
          if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'ping' }))
        }, LIVE_SOCKET.PING_MS)
      }
      current.onmessage = (event) => {
        let data
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        if (data?.type === 'pong') return
        if (data?.type === 'connected') handlers.current.onConnected?.(data)
        else handlers.current.onMessage?.(data)
      }
      current.onclose = (event) => {
        if (socket !== current) return
        socket = null
        clearInterval(ping)
        ping = null
        setLive(false)
        if (stopped) return

        if (event.code === LIVE_SOCKET.LOGIN_CLOSE_CODE) {
          wait(WAITING.LOGIN, `login refused (${event.code})`)
          return
        }
        if (LIVE_SOCKET.FINAL_CLOSE_CODES.includes(event.code)) {
          wait(WAITING.NEVER, `refused (${event.code})`)
          return
        }
        // A socket that was working and dropped gets a fresh round of tries.
        if (opened) failures = 0
        if (failures >= LIVE_SOCKET.RETRY_LIMIT) {
          wait(WAITING.NETWORK, `${failures + 1} tries failed (last close ${event.code})`)
          return
        }
        const delay = Math.min(1000 * 2 ** failures, LIVE_SOCKET.RETRY_MAX_MS)
        failures += 1
        timer = setTimeout(open, delay)
      }
    }

    /** A new round of tries, for a socket that is waiting for `reason`. */
    const resume = (reason) => {
      if (stopped || socket || timer || waiting !== reason) return
      failures = 0
      open()
    }
    const onOnline = () => resume(WAITING.NETWORK)
    const onVisible = () => {
      if (document.visibilityState === 'visible') resume(WAITING.NETWORK)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const stopWatchingLogin = onTokensChanged((token) => {
      if (token) resume(WAITING.LOGIN)
    })

    // Opened on the next turn: a mount undone straight away never opens one.
    timer = setTimeout(open, 0)

    return () => {
      stopped = true
      clearTimeout(timer)
      clearInterval(ping)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      stopWatchingLogin()
      setLive(false)
      if (socket) {
        const current = socket
        socket = null
        current.onmessage = null
        current.onclose = null
        // Closing one still connecting makes the browser report an error; it is closed as soon as it opens instead.
        if (current.readyState === WebSocket.CONNECTING) current.onopen = () => current.close()
        else {
          current.onopen = null
          current.close()
        }
      }
    }
  }, [id])

  return live
}

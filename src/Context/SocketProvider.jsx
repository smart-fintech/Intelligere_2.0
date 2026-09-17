/**
 * Decides WHEN the app's one WebSocket is allowed to exist.
 *
 * It sits above the routes in App.jsx, so moving between pages never drops the
 * connection. There is deliberately no React context value here: the socket is
 * a single shared connection in Services/socketService.js, and components
 * reach it with useWebSocket() from anywhere in the tree. This component owns
 * only the LIFECYCLE:
 *
 *   signed in on load  -> allow    (enable)
 *   signs in           -> allow    (onTokensChanged fires with a new token)
 *   signs out          -> close    (onTokensChanged fires with null)
 *
 * "Allow", not "open". The socket is NOT opened here, because a page that
 * never uses it should not be talking to the server at all - and a backend
 * that happens to be down should not put an error in the console of a screen
 * that was not even asking for live data.
 *
 * It opens by itself the first time a screen actually needs it: a send(), or a
 * module that asks for it with `connectOnMount`. See Services/socketService.js.
 */

import { useEffect } from 'react'

import { appSocket } from '@/Services/socketService'
import { tallySocket } from '@/Services/tallyConnectionService'
import { isLoggedIn, onTokensChanged } from '@/Services/tokenService'

// Every connection whose lifecycle follows the session: the shared one, and
// the footer's dedicated Tally-check one. Each still opens only when used.
const SOCKETS = [appSocket, tallySocket]

const SocketProvider = ({ children }) => {
  useEffect(() => {
    // A reload keeps the saved session but loses the connection, so allow it
    // again. A visitor on the login page has no token, so nothing is allowed
    // until they sign in.
    if (isLoggedIn()) SOCKETS.forEach((socket) => socket.enable())

    // tokenService tells us the moment a token is saved or cleared, which is
    // exactly when the socket should be allowed or shut down.
    const stopListening = onTokensChanged((accessToken) => {
      SOCKETS.forEach((socket) => (accessToken ? socket.enable() : socket.disconnect()))
    })

    return () => {
      stopListening()

      // Note: the socket is deliberately NOT closed here.
      //
      // This component only unmounts when the whole app goes away, and the
      // browser closes the socket for us then. Closing it here would also fire
      // in development, where <StrictMode> mounts every component twice, so
      // each reload would tear the connection down and build it up again.
      //
      // Signing out still closes it: the listener above calls disconnect()
      // the moment the token is cleared.
    }
  }, [])

  return children
}

export default SocketProvider

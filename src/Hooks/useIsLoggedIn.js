/**
 * "Is somebody signed in?" - as a value a component can render.
 *
 * There is no second copy of the rule here. The answer still comes from
 * isLoggedIn() in Services/tokenService, which is the one place that decides
 * what being signed in means; this hook only subscribes to it, so a component
 * re-renders the moment the session starts or ends.
 *
 *   const signedIn = useIsLoggedIn()
 *
 * tokenService announces every change through onTokensChanged - setTokens
 * fires it with the new token on sign-in, forceLogout fires it with null when
 * the session is cleared - which is exactly what useSyncExternalStore needs to
 * keep the value up to date without any state of its own.
 */

import { useSyncExternalStore } from 'react'

import { isLoggedIn, onTokensChanged } from '@/Services/tokenService'

export const useIsLoggedIn = () =>
  // subscribe, read now, and read on the server (never used here, but React
  // asks for it and isLoggedIn is safe to call anywhere).
  useSyncExternalStore(onTokensChanged, isLoggedIn, isLoggedIn)

export default useIsLoggedIn

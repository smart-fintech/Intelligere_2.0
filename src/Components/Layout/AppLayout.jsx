import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Outlet } from 'react-router-dom'

import Footer from '@/Components/Layout/Footer'
import Header from '@/Components/Layout/Header'
import HelpTab from '@/Components/Layout/HelpTab'
import Sidebar from '@/Components/Layout/Sidebar'
import { fetchCompanies } from '@/Store/Slices/companySlice'
import { fetchProfile } from '@/Store/Slices/profileSlice'

/**
 * The app shell - the frame that stays on screen while pages change.
 *
 * ------------------------------------------------------------------
 * How one layout covers many pages
 * ------------------------------------------------------------------
 * In AppRoutes this component is used as a PARENT route, and the real
 * pages are nested inside it. React Router then renders this component
 * and drops whichever child page matches the URL into <Outlet />.
 *
 *     <Route element={<AppLayout />}>          <- the frame
 *       <Route path="/dashboard" ... />        <- goes into <Outlet />
 *       <Route path="/issue" ... />            <- goes into <Outlet />
 *     </Route>
 *
 * So the header, sidebar and footer are written once, here, and every page
 * added inside that block gets them for free. Nothing changes in the pages
 * themselves.
 *
 * The screen is split like this:
 *
 *     +--------------------------------------+
 *     |               Header                 |  fixed height
 *     +---------+----------------------------+
 *     | Sidebar |  <Outlet /> - the page     |  this part scrolls
 *     +---------+----------------------------+
 *     |               Footer                 |  fixed height
 *     +--------------------------------------+
 */
export default function AppLayout() {
  // Whether the sidebar is expanded. It is owned here, at the level ABOVE
  // both the header and the sidebar, because the header holds the button
  // that flips it and the sidebar reacts to it. This is the usual React
  // answer to "two siblings need the same value": lift it to the parent.
  //
  // The starting value depends on the screen: expanded on a desktop, closed
  // on a phone (where an open sidebar would cover the whole page). Passing a
  // FUNCTION to useState means this is worked out once on the first render
  // instead of on every render.
  const [sidebarOpen, setSidebarOpen] = useState(false)

  /* ---------------- The profile ----------------
     The store is empty again after every page reload, and the header now
     depends on it: the company picker only appears for an Intelligere user,
     which is a fact that lives in the profile.

     This is the ONE place a signed-in page loads it - after a fresh
     sign-in, a page reload, or a signed-in URL opened directly. Login
     deliberately does not: it sends the user here the moment they are
     authenticated, and the profile loads in the background once the shell
     is on screen. Nothing on the dashboard waits for it; the header simply
     fills itself in when it arrives.

     There is no "has it been loaded already?" check here on purpose. The
     thunk itself refuses to run a second time while one is in flight or
     once the profile is in the store (see its `condition` in profileSlice),
     which is the only place that can decide it without a race. This just
     says the shell needs the profile. */
  const dispatch = useDispatch()

  /* ---------------- The companies ----------------
     Loaded here for the same reason and in the same way: the company the
     user is working in decides what every dashboard module is about, so it
     has to be known before those modules can ask for anything.

     Both thunks refuse to run twice (see their `condition`), so this stays
     one request per sign-in no matter how often the shell re-renders. */
  useEffect(() => {
    dispatch(fetchProfile())
    dispatch(fetchCompanies())
  }, [dispatch])

  return (
    // `h-dvh` + `overflow-hidden` pins the frame to the window, so the header
    // and footer stay put and only the middle strip scrolls. `dvh` rather
    // than `h-screen` (100vh): on a phone 100vh is taller than what is
    // visible while the browser's address bar is showing, which made the
    // whole page scroll behind the frame.
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header onToggleSidebar={() => setSidebarOpen((previous) => !previous)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* The page itself - the ONE element that scrolls.

            `relative` is what keeps it the only one. Radix puts a visually
            hidden, absolutely positioned <select>/<input> inside every
            dropdown and switch in a form (so the browser can autofill and
            submit them). An absolute element is placed against its nearest
            POSITIONED ancestor; with none, that is the window, so those
            hidden inputs sat far below the fold, stretched the document
            itself, and gave the browser a second scrollbar of its own.
            Positioning <main> makes it their container: they scroll inside
            it like everything else.

            `min-w-0` stops a wide table inside a page from forcing the whole
            layout to stretch - the table scrolls sideways in its own box. */}
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <Footer />

      {/* Pinned to the right edge of the window, outside the scrolling area,
          so it stays put on every page. */}
      <HelpTab />
    </div>
  )
}

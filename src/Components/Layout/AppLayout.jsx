import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Outlet } from 'react-router-dom'

import Footer from '@/Components/Layout/Footer'
import Header from '@/Components/Layout/Header'
import Sidebar from '@/Components/Layout/Sidebar'
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

     Login already loads it, so this covers the other way in - refreshing
     the page, or opening a signed-in URL directly.

     There is no "has it been loaded already?" check here on purpose. The
     thunk itself refuses to run a second time while one is in flight or
     once the profile is in the store (see its `condition` in profileSlice),
     which is the only place that can decide it without a race. This just
     says the shell needs the profile. */
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(fetchProfile())
  }, [dispatch])

  return (
    // `h-screen` + `overflow-hidden` pins the frame to the window, so the
    // header and footer stay put and only the middle strip scrolls.
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header onToggleSidebar={() => setSidebarOpen((previous) => !previous)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* The page itself. `min-w-0` stops a wide table inside a page from
            forcing the whole layout to stretch. */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  )
}

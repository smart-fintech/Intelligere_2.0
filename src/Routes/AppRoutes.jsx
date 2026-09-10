/**
 * The routing table of the whole application.
 *
 * ------------------------------------------------------------------
 * How routing works, in three sentences
 * ------------------------------------------------------------------
 * 1. <BrowserRouter> (added in main.jsx) watches the address bar.
 * 2. <Routes> looks at the current URL and picks the ONE <Route> that
 *    matches best.
 * 3. That <Route>'s `element` is rendered on screen. No page reload
 *    happens - React just swaps the component.
 *
 * ------------------------------------------------------------------
 * Two kinds of page in this app
 * ------------------------------------------------------------------
 * BARE pages (login, register, 404) fill the whole window on their own.
 *
 * SHELL pages (dashboard, and everything built from here on) are wrapped
 * in <AppLayout>, which draws the header, sidebar and footer around them.
 * They are written as CHILD routes of a parent route whose element is the
 * layout - so the shell is declared once and every page inside it inherits
 * the whole thing. To give a new page the shell, add one <Route> line in
 * that block; there is nothing to change in the page itself.
 *
 * ------------------------------------------------------------------
 * The map for this project
 * ------------------------------------------------------------------
 *   /                  ->  sends you to /login
 *   /login             ->  Login.jsx                    (bare)
 *   /register          ->  Register.jsx                 (bare)
 *   /register/:referralBy -> Register.jsx, from a referral link  (bare)
 *   /forgot-password   ->  ForgotPassword.jsx           (bare)
 *   /dashboard         ->  Dashboard.jsx                (inside the shell)
 *   /profile           ->  Profile.jsx                  (inside the shell)
 *   /issue             ->  ReportIssue.jsx              (inside the shell)
 *   anything else      ->  NotFound.jsx    (inside the shell when signed in,
 *                                           bare when signed out)
 *
 * ------------------------------------------------------------------
 * Why the 404 appears twice below
 * ------------------------------------------------------------------
 * A wrong URL should not throw a signed-in user out of the app: the header
 * and sidebar stay put, so they can carry on with one click. A signed-out
 * visitor has no shell to keep - showing them a header and an empty sidebar
 * would only suggest they are logged in when they are not.
 *
 * So the "*" route is written in both blocks, and exactly ONE of them exists
 * at a time - the `signedIn` check below decides which. Two live wildcards
 * would be a tie for React Router to break, and this way there is nothing to
 * break: the router only ever sees one.
 */

import { Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from '@/Components/Layout/AppLayout'
import { ROUTES } from '@/Constants/routes'
import useIsLoggedIn from '@/Hooks/useIsLoggedIn'
import ForgotPassword from '@/Modules/Auth/Pages/ForgetPassword'
import Login from '@/Modules/Auth/Pages/Login'
import Register from '@/Modules/Auth/Pages/Register'
import Dashboard from '@/Modules/Dashboard/Pages/Dashboard'
import Profile from '@/Modules/Profile/Pages/Profile'
import NotFound from '@/Modules/Misc/Pages/NotFound'
import ReportIssue from '@/Modules/Support/Pages/ReportIssue'

export default function AppRoutes() {
  // The project's existing session check, read as a value so these routes
  // follow the user in and out - see Hooks/useIsLoggedIn.
  const signedIn = useIsLoggedIn()

  return (
    <Routes>
      {/* ---------- Landing ----------
          Someone typing just the domain has not asked for any page in
          particular, so we forward them to the login screen.

          `replace` swaps the current history entry instead of adding one.
          Without it, pressing Back would take you to "/", which would
          bounce you forward to /login again - a Back button that does
          nothing. */}
      <Route path={ROUTES.ROOT} element={<Navigate to={ROUTES.LOGIN} replace />} />

      {/* ---------- Auth pages ----------
          Deliberately OUTSIDE the layout below: there is no sidebar to show
          to someone who has not signed in yet. */}
      <Route path={ROUTES.LOGIN} element={<Login />} />
      <Route path={ROUTES.REGISTER} element={<Register />} />
      {/* The referral link lands here. Same page - it just arrives with the
          inviter's uuid in the URL, which Register reads and sends on. */}
      <Route path={ROUTES.REGISTER_WITH_REFERRAL} element={<Register />} />
      <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />

      {/* ---------- Pages inside the app shell ----------
          This parent <Route> has no `path` of its own - it exists only to
          wrap its children in <AppLayout>. Each child below is rendered
          into the <Outlet /> inside that layout.

          TODO: wrap this parent in a route guard that checks isLoggedIn()
          from Services/tokenService, so these pages cannot be opened by
          typing the URL while signed out. */}
      <Route element={<AppLayout />}>
        <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
        <Route path={ROUTES.PROFILE} element={<Profile />} />
        <Route path={ROUTES.ISSUE} element={<ReportIssue />} />
        {/* Add new signed-in pages here - they get header/sidebar/footer. */}

        {/* The 404 of a signed-in user. Being a child of this parent is the
            whole point: it is rendered into the <Outlet /> of AppLayout, so
            the header, sidebar and footer stay exactly where they were. */}
        {signedIn && <Route path="*" element={<NotFound />} />}
      </Route>

      {/* ---------- Catch-all ----------
          "*" matches any URL none of the routes above claimed, so a typed
          or stale link shows a friendly page instead of a blank screen.

          This is the signed-OUT one: outside the block above, so it fills the
          window on its own with no app shell around it. Keep it last: it is
          the fallback. */}
      {!signedIn && <Route path="*" element={<NotFound />} />}
    </Routes>
  )
}

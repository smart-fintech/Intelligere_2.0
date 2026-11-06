import { useState } from 'react'
import { IdCard, LogOut } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'

import Logo from '@/Components/Layout/Logo'
import { Button } from '@/Components/ui/button'
import { EVENT_KIND } from '@/Constants/procurementAutomation'
import { ROUTES } from '@/Constants/routes'
import VendorProfileModal from '@/Modules/Procurement/Components/VendorProfileModal'
import VendorProfileForm from '@/Modules/VendorPortal/Components/VendorProfileForm'
import VendorPortalScreen from '@/Modules/VendorPortal/Components/VendorPortalScreen'
import useVendorEvents from '@/Modules/VendorPortal/useVendorEvents'
import { findMyRecord } from '@/Modules/VendorPortal/vendorPortal'
import { getVendorEmail, signOutVendor } from '@/Modules/VendorPortal/vendorSession'

/**
 * The vendor portal: its own slim header (no app sidebar - a vendor is not an
 * app user) and the vendor's bids. Signed out, it goes to the vendor login.
 *
 * The profile is the one the bid lists carry with the vendor (`Profile`).
 * Edit Profile opens the form over it, and Cancel comes back to it. A save
 * reloads both lists - the profile has no read call of its own, they carry it -
 * and comes back to the view, which then shows what was saved.
 */

const PROFILE_NOTE = 'Your profile as the companies that invite you see it.'

/** Which of the profile's two modals is open. */
const PROFILE_VIEW = 'view'
const PROFILE_EDIT = 'edit'

export default function VendorPortalPage() {
  const navigate = useNavigate()
  const email = getVendorEmail()
  const [profileMode, setProfileMode] = useState(null)

  const bids = useVendorEvents(email, EVENT_KIND.BID)
  const preBids = useVendorEvents(email, EVENT_KIND.PRE_BID)

  if (!email) return <Navigate to={ROUTES.VENDOR_LOGIN} replace />

  const record = findMyRecord([bids.data, preBids.data], email)

  const handleLogout = () => {
    signOutVendor()
    navigate(ROUTES.VENDOR_LOGIN, { replace: true })
  }

  return (
    <div className="min-h-screen bg-brand-soft/40">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="text-brand" />
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">Vendor Portal</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-sm text-muted-foreground sm:inline" title={email}>
              {record?.name ? `${record.name} · ` : ''}
              {email}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={IdCard}
              disabled={!record}
              tooltip={record ? undefined : 'Your profile shows here once a company invites you to a bid.'}
              onClick={() => setProfileMode(PROFILE_VIEW)}
            >
              Profile
            </Button>
            <Button type="button" variant="outline" size="sm" icon={LogOut} onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <VendorPortalScreen email={email} lists={{ [EVENT_KIND.BID]: bids, [EVENT_KIND.PRE_BID]: preBids }} />
      </main>

      {profileMode === PROFILE_VIEW && record ? (
        <VendorProfileModal
          vendor={record}
          note={PROFILE_NOTE}
          onEdit={() => setProfileMode(PROFILE_EDIT)}
          onClose={() => setProfileMode(null)}
        />
      ) : null}
      {profileMode === PROFILE_EDIT && record ? (
        <VendorProfileForm
          vendor={record}
          email={email}
          onClose={() => setProfileMode(PROFILE_VIEW)}
          onSaved={async () => {
            await Promise.all([bids.reload(), preBids.reload()])
            setProfileMode(PROFILE_VIEW)
          }}
        />
      ) : null}
    </div>
  )
}

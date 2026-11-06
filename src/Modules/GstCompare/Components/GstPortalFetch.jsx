import { DownloadCloud } from 'lucide-react'

import { GstPortalAuthDialogs } from '@/Components/Common/GstPortalAuthDialogs'
import { Button } from '@/Components/ui/button'
import useGstPortalAuth from '@/Hooks/useGstPortalAuth'
import { toast } from '@/Library/toast'
import { fetchGstr2b, GSTR_2B_PREMIUM } from '@/Services/Gst/gstCompareService'

/**
 * FETCH DATA FROM THE GST PORTAL - the Fetch button for GSTR-2B. Signing in
 * first (the portal username, the OTP, fetching again) is the shared flow,
 * Hooks/useGstPortalAuth, under the GSTR 2B premium.
 *
 * `onFetched()` runs once GSTR-2B is stored on the backend.
 *
 *   companyId, startMonth, endMonth, year   what to fetch
 *   disabled                                 the period is not chosen yet
 */
export default function GstPortalFetch({ companyId, startMonth, endMonth, year, disabled, onFetched }) {
  const portal = useGstPortalAuth({
    companyId,
    premiumName: GSTR_2B_PREMIUM,
    request: fetchGstr2b,
    onAnswer: (reply) => {
      toast.success(reply?.msg || 'GSTR-2B fetched from the GST portal.')
      onFetched()
    },
    // A missing route answers with a whole HTML page, which is no message to show.
    onFailure: (error) =>
      toast.error(error.status === 404 ? 'Fetching from the GST portal is not available on this server yet. Please upload the file.' : error.message),
  })

  const fetchFromPortal = () => {
    if (portal.fetching) return
    if (Number(startMonth) > Number(endMonth)) {
      toast.error('GSTR-2B is fetched within one calendar year: the From month must not be after the To month.')
      return
    }
    portal.fetch({ companyId, startMonth, endMonth, year })
  }

  return (
    <>
      <Button icon={DownloadCloud} loading={portal.fetching} disabled={disabled} onClick={fetchFromPortal}>
        Fetch
      </Button>
      <GstPortalAuthDialogs portal={portal} />
    </>
  )
}

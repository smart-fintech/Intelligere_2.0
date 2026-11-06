import { useState } from 'react'

import useGstPortalAuth from '@/Hooks/useGstPortalAuth'
import { toast } from '@/Library/toast'
import { applySavedActions, buildImsSaveSections, changeCount, readImsSections, withChange } from '@/Modules/PurchaseInvoice/Ims/imsModel'
import { fetchIms, IMS_PREMIUM, saveImsActions } from '@/Services/Gst/gstReturnService'

/**
 * IMS FOR ONE COMPANY - its invoices on the GST portal and the actions taken
 * on them (imsModel), both through gst_portal_integration/ims/, signing in
 * first when the portal asks (useGstPortalAuth, under the IMS premium) - the
 * same request again once signed in:
 *
 *   const ims = useIms({ companyId })
 *   ims.fetch()                     the eight sections; any choice not saved is dropped
 *   ims.sections                    null until fetched
 *   ims.changes / choose(key, row, action) / chooseMany([[key, row]], action) / discard()
 *   ims.save()                      every changed row, of every section, in ONE PUT - each
 *                                   row whole as it was fetched, with its `change`; once saved,
 *                                   those rows show the new action
 *   ims.busy, ims.working ('fetch' | 'save' | null), ims.portal (GstPortalAuthDialogs)
 */

export const imsRowKey = (section, index) => `${section}:${index}`

export default function useIms({ companyId }) {
  const [sections, setSections] = useState(null)
  const [changes, setChanges] = useState({})
  const [working, setWorking] = useState(null)

  const portal = useGstPortalAuth({
    companyId,
    premiumName: IMS_PREMIUM,
    request: ({ kind, body }) => (kind === 'save' ? saveImsActions({ companyId, sections: body }) : fetchIms({ companyId })),
    onAnswer: (reply, asked) => {
      setWorking(null)
      if (asked.kind === 'save') {
        // What was sent is what is saved - later choices (none can be made meanwhile) are not touched.
        setSections((current) => applySavedActions(current ?? [], asked.changes, imsRowKey))
        setChanges({})
        toast.success(reply?.msg || 'Action completed successfully')
        return
      }
      setSections(readImsSections(reply))
      setChanges({})
    },
    onFailure: (failure, asked) => {
      setWorking(null)
      toast.error(failure.message || (asked.kind === 'save' ? 'The IMS actions could not be saved.' : 'IMS could not be fetched.'))
    },
  })

  // A sign-in dialog left open with nothing on its way still holds the request.
  const busy = portal.fetching || portal.step !== null

  const fetch = () => {
    if (busy) return
    if (portal.fetch({ kind: 'fetch' })) setWorking('fetch')
  }

  const save = () => {
    if (busy || !sections || changeCount(changes) === 0) return
    const body = buildImsSaveSections(sections, changes, imsRowKey)
    if (portal.fetch({ kind: 'save', body, changes })) setWorking('save')
  }

  return {
    sections,
    changes,
    choose: (key, row, action) => !busy && setChanges((current) => withChange(current, key, row, action)),
    chooseMany: (entries, action) =>
      !busy && setChanges((current) => entries.reduce((next, [key, row]) => withChange(next, key, row, action), current)),
    discard: () => !busy && setChanges({}),
    fetch,
    save,
    busy,
    working: busy ? working : null,
    portal,
  }
}

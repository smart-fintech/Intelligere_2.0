import { useState } from 'react'

import useGstPortalAuth from '@/Hooks/useGstPortalAuth'
import { toast } from '@/Library/toast'
import { GSTR_1_OUTCOME, readGstr1Reply } from '@/Modules/SalesEntries/MultiLedger/gstr1Reply'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import { MONTH_OPTIONS } from '@/Modules/SalesInvoice/History/historyHelpers'
import { fetchGstr1, GSTR_1_PREMIUM } from '@/Services/Gst/gstReturnService'

/**
 * FETCH FROM GSTR-1 - one month's sections from the GST portal, signing in
 * first when the portal asks (useGstPortalAuth, under the GSTR 1 premium):
 *
 *   const gstr1 = useGstr1Fetch({ companyId, onSaved })
 *   gstr1.start({ month, year, sections, invoicesAsked })
 *   gstr1.fetching, gstr1.portal (for GstPortalAuthDialogs)
 *   gstr1.result          the last answer, read (gstr1Reply), for the dialog to show
 *
 * `onSaved({ month, year }, outcome)` runs whenever invoices were saved -
 * all of them, or some sections short - since they have REPLACED the entries
 * on screen. A failure, or a month with no invoices, leaves them as they were.
 * `onSettled(outcome)` runs after every answer that is not a sign-in step.
 */

const periodOf = ({ month, year }) => `${MONTH_OPTIONS.find((option) => option.value === String(month))?.label ?? month} ${year}`

export default function useGstr1Fetch({ companyId, onSaved, onSettled }) {
  const [result, setResult] = useState(null)

  const settle = (request, reading) => {
    const period = periodOf(request)
    const next = { ...reading, period }
    setResult(next)
    const savedText = reading.saved === null ? 'Entries saved' : `${plural(reading.saved, 'entry', 'entries')} saved`

    switch (reading.outcome) {
      case GSTR_1_OUTCOME.SAVED:
        toast.success(`GSTR-1 for ${period}: ${savedText}.`, reading.saved === null ? { description: reading.message } : undefined)
        onSaved(request, next)
        break
      case GSTR_1_OUTCOME.PARTIAL:
        toast.warning(`GSTR-1 for ${period}: ${savedText}, but part of it could not be fetched.`, {
          description: reading.failures.length > 0 ? `Not fetched: ${reading.failures.map((failure) => failure.label).join(', ')}.` : reading.message,
          duration: 10000,
        })
        onSaved(request, next)
        break
      case GSTR_1_OUTCOME.NO_INVOICES:
        toast.info(`The GST portal has no B2B invoices for ${period}.`, { description: 'Your entries are unchanged.' })
        break
      case GSTR_1_OUTCOME.SECTIONS_SAVED:
        toast.success(`GSTR-1 for ${period}: the chosen sections are saved.`, { description: 'They are kept with the company\'s GSTR-1. Your entries are unchanged.' })
        break
      default:
        toast.error(
          reading.failures.length > 0 ? `GSTR-1 for ${period} could not be fetched.` : reading.message || `GSTR-1 for ${period} could not be fetched.`,
          reading.failures.length > 0 ? { description: `Not fetched: ${reading.failures.map((failure) => failure.label).join(', ')}.` } : undefined,
        )
    }
    onSettled?.(next)
  }

  const portal = useGstPortalAuth({
    companyId,
    premiumName: GSTR_1_PREMIUM,
    request: ({ month, year, sections }) => fetchGstr1({ companyId, month, year, sections }),
    onAnswer: (reply, asked) => settle(asked, readGstr1Reply(reply?.msg, { thrown: false, invoicesAsked: asked.invoicesAsked })),
    onFailure: (error, asked) =>
      settle(
        asked,
        error.status === 404
          ? { outcome: GSTR_1_OUTCOME.FAILED, saved: null, failures: [], message: 'Fetching GSTR-1 is not available on this server yet. Please upload the file.' }
          : readGstr1Reply(error.message, { thrown: true, invoicesAsked: asked.invoicesAsked }),
      ),
  })

  const start = (request) => {
    if (portal.fetching) return false
    setResult(null)
    return portal.fetch(request)
  }

  return { start, fetching: portal.fetching, portal, result, clearResult: () => setResult(null) }
}

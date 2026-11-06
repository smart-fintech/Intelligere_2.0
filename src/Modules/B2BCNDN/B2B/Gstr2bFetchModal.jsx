import { useState } from 'react'
import { AlertTriangle, CloudDownload } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { GstPortalAuthDialogs } from '@/Components/Common/GstPortalAuthDialogs'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import useGstPortalAuth from '@/Hooks/useGstPortalAuth'
import { toast } from '@/Library/toast'
import { failureText } from '@/Modules/B2BCNDN/shared/failureText'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import { MONTH_OPTIONS } from '@/Modules/SalesInvoice/History/historyHelpers'
import { GSTR_2B_PREMIUM } from '@/Services/Gst/gstCompareService'
import { fetchGstr2bIntoB2B } from '@/Services/Accounting/b2bCndnService'

/**
 * FETCH FROM THE GST PORTAL - the old screen's "Fetch Data from GST Portal":
 * GSTR-2B of the months From..To of one year, saved as the B2B entries
 * (gstr2b/ with source "B2B"), which REPLACE the ones there now. Signing in
 * first - the portal username, the OTP - is the shared flow
 * (Hooks/useGstPortalAuth, under the GSTR 2B premium).
 *
 * A month the portal had nothing for comes back as a 500 naming it, with the
 * months that were saved after " | " - those are read back all the same.
 *
 *   onFetched()   GSTR-2B is saved: the view reads its batch again
 *   total         the entries there now
 */

const yearOptions = (today = new Date()) => [1, 0, -1].map((offset) => String(today.getFullYear() + offset)).map((value) => ({ value, label: value }))

const thisMonth = () => String(new Date().getMonth() + 1)

export default function Gstr2bFetchModal({ open, onOpenChange, companyId, companyName, total, onFetched }) {
  const [period, setPeriod] = useState(() => ({
    startMonth: thisMonth(),
    endMonth: thisMonth(),
    year: String(new Date().getFullYear()),
  }))

  const portal = useGstPortalAuth({
    companyId,
    premiumName: GSTR_2B_PREMIUM,
    request: fetchGstr2bIntoB2B,
    onAnswer: (reply) => {
      toast.success(reply?.msg || 'GSTR-2B fetched from the GST portal.')
      onOpenChange(false)
      onFetched()
    },
    onFailure: (failure) => {
      const message = failureText(failure, 'GSTR-2B could not be fetched from the GST portal.')
      // Some months failed, others were saved: those are entries now.
      if (/records saved/i.test(message)) {
        toast.warning('Part of GSTR-2B was fetched.', {
          description: message,
          duration: 10000,
        })
        onOpenChange(false)
        onFetched()
        return
      }
      toast.error(message)
    },
  })
  const locked = portal.fetching || portal.step !== null

  const setPart = (field) => (value) => value && setPeriod((previous) => ({ ...previous, [field]: value }))

  const fetchNow = () => {
    if (Number(period.startMonth) > Number(period.endMonth)) {
      toast.error('GSTR-2B is fetched within one calendar year: the From month must not be after the To month.')
      return
    }
    portal.fetch({ companyId, ...period })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && !locked && onOpenChange(false)}
      title="Fetch from the GST Portal"
      description={`Read GSTR-2B B2B invoices${companyName ? ` for ${companyName}` : ''} straight in as entries.`}
      closeOnBackdropClick={!locked}
      closeOnEsc={!locked}
      showCloseButton={!locked}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={locked} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" icon={CloudDownload} loading={portal.fetching} disabled={locked} onClick={fetchNow}>
            {portal.fetching ? 'Fetching from the GST portal...' : total > 0 ? 'Fetch and replace' : 'Fetch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField
            id="b2b-gstr2b-from"
            label="From"
            required
            options={MONTH_OPTIONS}
            value={period.startMonth}
            disabled={locked}
            onValueChange={setPart('startMonth')}
          />
          <SelectField
            id="b2b-gstr2b-to"
            label="To"
            required
            options={MONTH_OPTIONS}
            value={period.endMonth}
            disabled={locked}
            onValueChange={setPart('endMonth')}
          />
          <SelectField
            id="b2b-gstr2b-year"
            label="Year"
            required
            options={yearOptions()}
            value={period.year}
            disabled={locked}
            onValueChange={setPart('year')}
          />
        </div>

        {total > 0 ? (
          <p className="flex gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            The fetched invoices replace the B2B entries uploaded or fetched before ({plural(total, 'entry', 'entries')}). Entries already sent stay in Tally.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A month fetched before is read from the saved copy, not from the portal again. The GST portal may ask for its username and an OTP first.
        </p>
      </div>

      <GstPortalAuthDialogs portal={portal} />
    </Modal>
  )
}

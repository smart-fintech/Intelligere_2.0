import { useState } from 'react'
import { AlertTriangle, CloudDownload, Info } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { GstPortalAuthDialogs } from '@/Components/Common/GstPortalAuthDialogs'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { GSTR_1_FETCH_SECTIONS } from '@/Constants/salesEntries'
import { cn } from '@/Library/utils'
import { GSTR_1_OUTCOME } from '@/Modules/SalesEntries/MultiLedger/gstr1Reply'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import { MONTH_OPTIONS } from '@/Modules/SalesInvoice/History/historyHelpers'

/**
 * FETCH FROM GSTR-1 - as the old screen, only the month and year: the month's
 * B2B invoices (GSTR_1_FETCH_SECTIONS) are read and become the entries of this
 * view, REPLACING the ones there now, which is said before Fetch is pressed.
 *
 * The username / OTP dialogs open over it when the portal asks
 * (GstPortalAuthDialogs). The answer stays here when part of it failed - which
 * sections, and why - and a full success closes it (the view's onSaved).
 *
 *   gstr1   useGstr1Fetch
 *   total   the entries there now
 */

/** The month GSTR-1 is usually fetched for: the one before this. */
const lastMonth = (today = new Date()) => {
  const date = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return { month: String(date.getMonth() + 1), year: String(date.getFullYear()) }
}

/** This and the two years before - a return is fetched for a month gone by. */
const yearOptions = (today = new Date()) =>
  [0, 1, 2].map((back) => String(today.getFullYear() - back)).map((value) => ({ value, label: value }))

function FetchResult({ result }) {
  if (!result || result.outcome === GSTR_1_OUTCOME.SAVED || result.outcome === GSTR_1_OUTCOME.SECTIONS_SAVED) return null
  const partial = result.outcome === GSTR_1_OUTCOME.PARTIAL
  const quiet = result.outcome === GSTR_1_OUTCOME.NO_INVOICES
  return (
    <div
      role={quiet ? 'status' : 'alert'}
      className={cn(
        'space-y-1.5 rounded-md border px-3 py-2 text-xs',
        partial && 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300',
        quiet && 'border-border bg-muted/40 text-muted-foreground',
        !partial && !quiet && 'border-destructive/30 bg-destructive/5 text-destructive',
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        {quiet ? <Info className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
        {partial
          ? `${result.saved === null ? 'Entries' : plural(result.saved, 'entry', 'entries')} saved for ${result.period}, but part of GSTR-1 could not be fetched.`
          : quiet
            ? `The GST portal has no B2B invoices for ${result.period}. Your entries are unchanged.`
            : `GSTR-1 for ${result.period} could not be fetched. Your entries are unchanged.`}
      </p>
      {result.failures.length > 0 ? (
        <ul className="space-y-0.5 pl-5">
          {result.failures.map((failure) => (
            <li key={failure.table} className="list-disc">
              <span className="font-medium">{failure.label}</span> ({failure.table}): {failure.message}
            </li>
          ))}
        </ul>
      ) : !quiet && result.message ? (
        <p className="pl-5">{result.message}</p>
      ) : null}
      {partial || (!quiet && result.failures.length > 0) ? (
        <p className="pl-5">Fetch again to retry them - the parts already saved are not read from the portal again.</p>
      ) : null}
    </div>
  )
}

export default function Gstr1FetchModal({ open, onOpenChange, gstr1, total, companyName }) {
  const [period, setPeriod] = useState(lastMonth)
  const years = yearOptions()
  // While the portal is read, or asks for the username / OTP, this stays open.
  const locked = gstr1.fetching || gstr1.portal.step !== null

  const setPart = (field) => (value) => value && setPeriod((previous) => ({ ...previous, [field]: value }))

  const fetchNow = () => gstr1.start({ ...period, sections: GSTR_1_FETCH_SECTIONS, invoicesAsked: true })

  const close = (next) => {
    if (next || locked) return
    gstr1.clearResult()
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Fetch from GSTR-1"
      description={`Read a month's B2B invoices from the GST portal${companyName ? ` for ${companyName}` : ''}.`}
      closeOnBackdropClick={!locked}
      closeOnEsc={!locked}
      showCloseButton={!locked}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={locked} onClick={() => close(false)}>
            {gstr1.result ? 'Close' : 'Cancel'}
          </Button>
          <Button type="button" icon={CloudDownload} loading={gstr1.fetching} disabled={locked || !period.month || !period.year} onClick={fetchNow}>
            {gstr1.fetching ? 'Fetching from the GST portal...' : total > 0 ? 'Fetch and replace' : 'Fetch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField id="gstr1-month" label="Month" required options={MONTH_OPTIONS} value={period.month} disabled={locked} onValueChange={setPart('month')} />
          <SelectField id="gstr1-year" label="Year" required options={years} value={period.year} disabled={locked} onValueChange={setPart('year')} />
        </div>

        {total > 0 ? (
          <p className="flex gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            The fetched invoices replace the {plural(total, 'entry', 'entries')} on this screen - uploaded or fetched before. Entries already sent stay in Tally.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A month fetched before is read from the saved copy, not from the portal again. The GST portal may ask for its username and an OTP first.
        </p>

        <FetchResult result={gstr1.result} />
      </div>

      <GstPortalAuthDialogs portal={gstr1.portal} />
    </Modal>
  )
}

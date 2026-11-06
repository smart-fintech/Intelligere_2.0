import { useCallback, useState } from 'react'
import { Lock } from 'lucide-react'
import { useSelector } from 'react-redux'

import { StateMessage } from '@/Components/Common/DataList'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { B2B_CNDN_SOURCE, B2B_CNDN_VIEW_OPTIONS } from '@/Constants/b2bCndn'
import useSectionAccess from '@/Hooks/useSectionAccess'
import { cn } from '@/Library/utils'
import B2BView from '@/Modules/B2BCNDN/B2B/B2BView'
import CndnView from '@/Modules/B2BCNDN/Cndn/CndnView'
import { ACCESS_SECTIONS } from '@/Services/Auth/accessService'
import { hasB2BModule, hasCndnModule } from '@/Services/Accounting/b2bCndnService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * B2B / CNDN - two views, chosen with the radio buttons at the top; the one
 * chosen is the `source` of every request it makes:
 *
 *   B2B                      b2b  - purchase invoices          (B2B/)
 *   Credit Note Debit Note   cndn - credit and debit notes     (Cndn/)
 *
 * Each keeps its own upload, list, mapping and Tally message. A view is
 * mounted the first time it is opened and then KEPT, hidden, while the other
 * is shown: a send still waiting for Tally keeps listening, and CNDN's notes -
 * which only the upload's answer holds - are there on the way back.
 *
 * A company may have one half and not the other: the half it lacks says so
 * instead of its view, and asks nothing of the backend.
 *
 * GET ENTRIES AND THE RADIO BUTTONS are shown only while the view on screen
 * has no entries. Once an upload, a portal fetch or a batch has brought valid
 * entries, both are hidden - the source stays as it was for the next batch,
 * the send and the mark - and come back by themselves when nothing is left to
 * send (or the request failed / had no entries). "Get New Entries" in the
 * Entries card brings them back on purpose, to upload a new file or switch.
 */
export default function B2BCndnScreen({ company, companyId, companyName }) {
  const isTally = useSelector(selectIsTallyErp)
  const canCreateLedger = useSectionAccess(ACCESS_SECTIONS.LEDGER).create
  const allowed = {
    [B2B_CNDN_SOURCE.B2B]: hasB2BModule(company),
    [B2B_CNDN_SOURCE.CNDN]: hasCndnModule(company),
  }
  const first = allowed[B2B_CNDN_SOURCE.B2B] || !allowed[B2B_CNDN_SOURCE.CNDN] ? B2B_CNDN_SOURCE.B2B : B2B_CNDN_SOURCE.CNDN
  const [current, setCurrent] = useState(first)
  const [opened, setOpened] = useState(() => new Set([first]))
  // Which views hold valid entries now - each view reports its own.
  const [hasEntries, setHasEntries] = useState({})
  // Get Entries and the radio buttons opened again on purpose, with entries on screen.
  const [controlsOpen, setControlsOpen] = useState(false)
  const showControls = controlsOpen || !hasEntries[current]

  const open = (next) => {
    setCurrent(next)
    setControlsOpen(false)
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])))
  }

  const reportEntries = useCallback(
    (source, has) => setHasEntries((previous) => (Boolean(previous[source]) === has ? previous : { ...previous, [source]: has })),
    [],
  )

  const props = {
    companyId,
    companyName,
    isTally,
    canCreateLedger,
    reportEntries,
  }
  const controlsOf = (key) => ({
    visible: current !== key || showControls,
    // The way back to Get Entries, while it is hidden - or hiding it again.
    toggle: hasEntries[key]
      ? {
          open: controlsOpen,
          onToggle: () => setControlsOpen((previous) => !previous),
        }
      : null,
    // New entries are in: the controls go away again.
    onLoaded: () => setControlsOpen(false),
  })
  const views = [
    [B2B_CNDN_SOURCE.B2B, B2BView, 'B2B'],
    [B2B_CNDN_SOURCE.CNDN, CndnView, 'Credit Note Debit Note'],
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">B2B / CNDN</h1>
        {showControls ? (
          <ViewSwitch
            options={B2B_CNDN_VIEW_OPTIONS}
            value={current}
            onValueChange={open}
            label="B2B or credit / debit notes"
            idPrefix="b2b-cndn-view"
            className="mx-auto w-fit max-w-full"
          />
        ) : (
          <p className="mx-auto text-sm font-medium text-brand">{B2B_CNDN_VIEW_OPTIONS.find((option) => option.value === current)?.label}</p>
        )}
      </div>

      {views.map(([key, View, name]) =>
        opened.has(key) ? (
          <div key={key} className={cn(current !== key && 'hidden')}>
            {allowed[key] ? (
              <View {...props} getEntries={controlsOf(key)} />
            ) : (
              <StateMessage icon={Lock} title={`${name} is not active for this company`}>
                {companyName} does not have the {name} module. Ask the account owner, or add it to the company&apos;s plan.
              </StateMessage>
            )}
          </div>
        ) : null,
      )}
    </div>
  )
}

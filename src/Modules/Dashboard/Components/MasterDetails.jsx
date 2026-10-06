/**
 * The Master Details tab of Inventory Details: one company's inventory
 * configuration.
 *
 * ------------------------------------------------------------------
 * WHAT IS ON SCREEN
 * ------------------------------------------------------------------
 *   asking the backend         a loader - never the Add form, so a company
 *                              that HAS details never flashes an empty form
 *   the request failed         the message and Retry
 *   no record yet              the Add form
 *   a record                   the saved values, read-only, with Edit
 *   Edit clicked               the form, filled from the record
 *
 * The record is read with the active company's name and the signed-in
 * user's email (see getMasterDetails) - both from the app, never typed - and
 * read again whenever either changes, so switching company in the header
 * shows that company's details.
 *
 * The data is this tab's alone, so it is kept here rather than in the store.
 */

import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, Building2 } from 'lucide-react'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useSampleInvoices from '@/Hooks/useSampleInvoices'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { getMasterDetails } from '@/Services/inventoryService'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import MasterDetailsForm from './MasterDetailsForm'
import MasterDetailsView from './MasterDetailsView'

/**
 * The tab's frame: a centred column rather than the full width of the page.
 * Full width on a phone, widening less and less of the screen as it grows -
 * about half of it on a desktop - and capped, so a very wide monitor never
 * stretches a two-column form into lines too long to scan.
 */
export default function MasterDetails() {
  return (
    <div className="mx-auto w-full max-w-4xl md:w-4/5 lg:w-2/3 xl:w-2/2">
      <MasterDetailsContent />
    </div>
  )
}

function MasterDetailsContent() {
  const { activeCompanyName: compName } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)
  const email = getEmail() || ''

  // Fetched once for the whole tab and shared by the view and the form, so
  // going in and out of Edit never asks again.
  const samples = useSampleInvoices()

  // The record and which company it belongs to. A result for an older key
  // (the company changed while it was on its way) is not this company's.
  const loadKey = `${compName}|${email}`
  const [state, setState] = useState({ status: 'loading', record: null, error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  // The key Edit was clicked under - so a company switch leaves edit mode.
  const [editingKey, setEditingKey] = useState(null)
  const request = useRef(null)

  useEffect(() => {
    if (!compName) return

    const requestKey = `${loadKey}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getMasterDetails({ compName, email })
      .then((record) => {
        if (request.current === requestKey) setState({ status: 'ready', record, error: null, forKey: loadKey })
      })
      .catch((failure) => {
        if (request.current === requestKey) {
          // A real failure - "no record yet" never gets here (see
          // getMasterDetails), it opens the Add form instead. The backend's
          // own `msg` is the message, as everywhere (see authService).
          toast.error(failure.message)
          setState({ status: 'failed', record: null, error: failure.message, forKey: loadKey })
        }
      })
  }, [loadKey, attempt, compName, email])

  /** Asks again - Retry, and after a save whose reply carried no record. */
  const reload = () => {
    setState((previous) => ({ ...previous, forKey: null }))
    setAttempt((count) => count + 1)
  }

  /* ---------------- No company to ask about ---------------- */
  if (!compName) {
    const waiting = companyStatus === 'idle' || companyStatus === 'loading'

    return (
      <Panel title="Master Details">
        {waiting ? (
          <Loader variant="section" label="Loading master details..." />
        ) : (
          <StateMessage icon={Building2} title="No company selected">
            Select a company in the header to set up its master details.
          </StateMessage>
        )}
      </Panel>
    )
  }

  const current = state.forKey === loadKey ? state : { status: 'loading' }

  if (current.status === 'loading') {
    return (
      <Panel title="Master Details">
        <Loader variant="section" label="Loading master details..." />
      </Panel>
    )
  }

  if (current.status === 'failed') {
    return (
      <Panel title="Master Details">
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load the master details"
          action={<RetryButton onClick={reload} />}
        >
          {current.error}
        </StateMessage>
      </Panel>
    )
  }

  /** After a save: show what the reply carried, or read it again. */
  const handleSaved = (saved) => {
    setEditingKey(null)
    if (saved) setState({ status: 'ready', record: saved, error: null, forKey: loadKey })
    else reload()
  }

  const { record } = current

  if (record && editingKey !== loadKey) {
    return (
      <MasterDetailsView
        record={record}
        compName={compName}
        email={email}
        samples={samples}
        onEdit={() => setEditingKey(loadKey)}
      />
    )
  }

  return (
    <MasterDetailsForm
      // A fresh form for each record and each company, so its fields always
      // start from what is saved - this is what makes Cancel a plain discard.
      key={`${loadKey}#${record ? 'edit' : 'add'}`}
      record={record}
      compName={compName}
      email={email}
      samples={samples}
      onSaved={handleSaved}
      onCancel={() => setEditingKey(null)}
    />
  )
}

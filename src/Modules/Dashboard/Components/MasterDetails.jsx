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
 * The record is not this tab's alone - the Warehouse form reads its
 * `business_type` - so it is kept in the store and reached through
 * Hooks/useMasterDetails. Saving here is what changes it for everyone.
 */

import { useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, Building2 } from 'lucide-react'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import useMasterDetails from '@/Hooks/useMasterDetails'
import useSampleInvoices from '@/Hooks/useSampleInvoices'
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
  // The record, shared with every other screen that needs it. `loadKey`
  // names the company and user it is for; until the answer for THIS key is
  // in, the status is 'loading'.
  const { key: loadKey, compName, email, status, record, error, reload, setRecord } = useMasterDetails()
  const companyStatus = useSelector(selectCompanyStatus)

  // Fetched once for the whole tab and shared by the view and the form, so
  // going in and out of Edit never asks again.
  const samples = useSampleInvoices()

  // The key Edit was clicked under - so a company switch leaves edit mode.
  const [editingKey, setEditingKey] = useState(null)

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

  if (status === 'loading') {
    return (
      <Panel title="Master Details">
        <Loader variant="section" label="Loading master details..." />
      </Panel>
    )
  }

  if (status === 'failed') {
    return (
      <Panel title="Master Details">
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load the master details"
          action={<RetryButton onClick={reload} />}
        >
          {error}
        </StateMessage>
      </Panel>
    )
  }

  /** After a save: show what the reply carried, or read it again. */
  const handleSaved = (saved) => {
    setEditingKey(null)
    if (saved) setRecord(saved)
    else reload()
  }

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

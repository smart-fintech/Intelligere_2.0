import { useState } from 'react'
import { Download, TriangleAlert } from 'lucide-react'

import { FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { MONTH_OPTIONS, checkSyncRange, syncYearOptions } from '@/Modules/PayableReceivable/LedgerExport/ledgerExport'

/**
 * SYNC LEDGERS FROM TALLY - everything about a sync in one window: which company,
 * when it last ran, the period to bring over, and, once there is data to lose,
 * that it will be replaced.
 *
 *   initialRange   the period to begin with - the one last asked for, or blanks
 *   hasData        a sync has run before, or may have
 *   onStart        (range) the period is complete and in order; closes this
 *
 * Mounted only while it is wanted. The sync itself runs after it closes, with
 * its loader on the screen behind (useTallySync).
 */

const YEAR_OPTIONS = syncYearOptions()

export default function LedgerSyncModal({ companyName, lastSyncText, hasData, initialRange, onClose, onStart }) {
  const [range, setRange] = useState(initialRange)
  const [errors, setErrors] = useState({})

  const start = () => {
    const found = checkSyncRange(range)
    setErrors(found)
    if (Object.keys(found).length === 0) onStart(range)
  }

  const selectFor = (id, field, label, options) => (
    <SelectField
      id={id}
      label={label}
      required
      placeholder="Select"
      options={options}
      value={range[field]}
      error={errors[field]}
      onValueChange={(value) => setRange((previous) => ({ ...previous, [field]: value }))}
    />
  )

  const summary = [
    ['Company', companyName],
    ['Last Sync', lastSyncText],
  ]

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title="Sync Ledgers from Tally"
      description="Choose the period to bring over."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" icon={Download} onClick={start}>
            Start Sync
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-border p-3 text-xs sm:grid-cols-2">
          {summary.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>

        <FormGrid>
          {selectFor('le-start-month', 'startMonth', 'From Month', MONTH_OPTIONS)}
          {selectFor('le-start-year', 'startYear', 'From Year', YEAR_OPTIONS)}
          {selectFor('le-end-month', 'endMonth', 'To Month', MONTH_OPTIONS)}
          {selectFor('le-end-year', 'endYear', 'To Year', YEAR_OPTIONS)}
        </FormGrid>

        {hasData ? (
          <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            All previous data will be replaced.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

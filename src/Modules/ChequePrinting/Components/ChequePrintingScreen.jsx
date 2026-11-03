import { useState } from 'react'

import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { CHEQUE_VIEW, CHEQUE_VIEW_OPTIONS } from '@/Constants/chequePrinting'
import ChequeEntry from '@/Modules/ChequePrinting/Components/ChequeEntry'
import ChequeHistory from '@/Modules/ChequePrinting/Components/ChequeHistory'

/**
 * The module's screen: the three radio buttons, and what they show.
 *
 *   Cheque Printing   ChequeEntry - kept mounted, so a request on its way and
 *                     the cheques waiting to be printed survive a look at a list
 *   View Voucher,     ChequeHistory, the same component with `type` saying
 *   Past Data         which - a remount per list, so its filters are its own
 */
export default function ChequePrintingScreen({ companyName, companyId }) {
  const [view, setView] = useState(CHEQUE_VIEW.PRINT)

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Cheque Printing</h1>

        <ViewSwitch
          options={CHEQUE_VIEW_OPTIONS}
          value={view}
          onValueChange={setView}
          label="Cheque Printing view"
          idPrefix="cheque-view"
          className="mx-auto w-fit max-w-full"
        />
      </div>

      <div hidden={view !== CHEQUE_VIEW.PRINT}>
        <ChequeEntry companyId={companyId} />
      </div>

      {view === CHEQUE_VIEW.PRINT ? null : (
        <ChequeHistory key={view} companyName={companyName} companyId={companyId} type={view} />
      )}
    </div>
  )
}

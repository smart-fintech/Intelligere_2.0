import { useState } from 'react'
import { useSelector } from 'react-redux'

import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { SALES_ENTRIES_VIEW, SALES_ENTRIES_VIEW_OPTIONS } from '@/Constants/salesEntries'
import useSectionAccess from '@/Hooks/useSectionAccess'
import { cn } from '@/Library/utils'
import InventoryView from '@/Modules/SalesEntries/Inventory/InventoryView'
import MultiLedgerView from '@/Modules/SalesEntries/MultiLedger/MultiLedgerView'
import SingleLedgerView from '@/Modules/SalesEntries/SingleLedger/SingleLedgerView'
import { ACCESS_SECTIONS } from '@/Services/Auth/accessService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * SALES ENTRIES - three kinds of sales entry, one view each, chosen at the top:
 *
 *   Multi Ledger     w/o inventory, each invoice with its own ledger lines (MultiLedger/)
 *   Single Ledger    w/o inventory, one sales ledger per invoice           (SingleLedger/)
 *   With Inventory   product lines as stock items, charges, GST            (Inventory/)
 *
 * Each keeps its own upload, batches, picks and Tally message; they share only
 * the frame (shared/). A view is mounted the first time it is opened and then
 * KEPT, hidden, while another is shown: a send still waiting for Tally keeps
 * listening - its entries are marked sent when the answer comes - and the
 * picks made are there on the way back.
 */
export default function SalesEntriesScreen({ companyId, companyName }) {
  const isTally = useSelector(selectIsTallyErp)
  const canCreateLedger = useSectionAccess(ACCESS_SECTIONS.LEDGER).create
  const [current, setCurrent] = useState(SALES_ENTRIES_VIEW.MULTI_LEDGER)
  const [opened, setOpened] = useState(() => new Set([SALES_ENTRIES_VIEW.MULTI_LEDGER]))

  const open = (next) => {
    setCurrent(next)
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])))
  }

  const props = { companyId, companyName, isTally, canCreateLedger }
  const views = [
    [SALES_ENTRIES_VIEW.MULTI_LEDGER, MultiLedgerView],
    [SALES_ENTRIES_VIEW.SINGLE_LEDGER, SingleLedgerView],
    [SALES_ENTRIES_VIEW.INVENTORY, InventoryView],
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Sales Entries</h1>
        <ViewSwitch
          options={SALES_ENTRIES_VIEW_OPTIONS}
          value={current}
          onValueChange={open}
          label="Kind of sales entry"
          idPrefix="sales-entries-view"
          className="mx-auto w-fit max-w-full"
        />
      </div>

      {views.map(([key, View]) =>
        opened.has(key) ? (
          <div key={key} className={cn(current !== key && 'hidden')}>
            <View {...props} />
          </div>
        ) : null,
      )}
    </div>
  )
}

import { useState } from 'react'

import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { BH_VIEW, BH_VIEW_OPTIONS } from '@/Constants/businessHealth'
import MisDashboard from '@/Modules/BusinessHealth/Components/MisDashboard'
import ReportTab from '@/Modules/BusinessHealth/Components/ReportTab'
import { CASH_FINANCE_REPORTS } from '@/Modules/BusinessHealth/Reports/cashFinance'
import { SALE_MARGINS_REPORTS } from '@/Modules/BusinessHealth/Reports/saleMargins'
import { CUSTOMER_RECEIVABLES_REPORTS } from '@/Modules/BusinessHealth/Reports/customerReceivables'
import { PURCHASE_SUPPLIERS_REPORTS } from '@/Modules/BusinessHealth/Reports/purchaseSuppliers'
import { INVENTORY_CAPITAL_REPORTS } from '@/Modules/BusinessHealth/Reports/inventoryCapital'

/**
 * The module's screen: the six radio buttons, and what they show.
 *
 *   Dashboard     the reports the user pinned for this company
 *   the others    one report category each - pick a report, its period,
 *                 and Generate
 *
 * A remount per view, so each category's filters and result are its own,
 * as they were in the old project's separate tabs.
 */
/** Each report category's reports, by its view. */
const CATEGORY_REPORTS = {
  [BH_VIEW.CASH_FINANCE]: CASH_FINANCE_REPORTS,
  [BH_VIEW.SALE_MARGINS]: SALE_MARGINS_REPORTS,
  [BH_VIEW.CUSTOMER_RECEIVABLES]: CUSTOMER_RECEIVABLES_REPORTS,
  [BH_VIEW.PURCHASE_SUPPLIERS]: PURCHASE_SUPPLIERS_REPORTS,
  [BH_VIEW.INVENTORY_CAPITAL]: INVENTORY_CAPITAL_REPORTS,
}

export default function BusinessHealthScreen({ company, companyId }) {
  const [view, setView] = useState(BH_VIEW.DASHBOARD)

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col items-center gap-3">
        <h1 className="self-start text-xl font-semibold text-brand sm:text-2xl">Business Health Indicators</h1>

        <ViewSwitch
          options={BH_VIEW_OPTIONS}
          value={view}
          onValueChange={setView}
          label="Business Health Indicators view"
          idPrefix="bh-view"
          className="w-fit max-w-full"
        />
      </div>

      {view === BH_VIEW.DASHBOARD ? <MisDashboard companyId={companyId} companyName={company?.comp_name} /> : null}

      {CATEGORY_REPORTS[view] ? (
        <ReportTab key={view} reports={CATEGORY_REPORTS[view]} company={company} companyId={companyId} />
      ) : null}
    </div>
  )
}

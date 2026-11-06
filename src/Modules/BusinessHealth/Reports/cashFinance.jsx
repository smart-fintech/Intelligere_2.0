import { ComparisonTable, Figure, HealthDot, NoteBox } from '@/Modules/BusinessHealth/Components/ReportCard'
import { hasActiveModule } from '@/Services/Auth/accessService'

/**
 * The Cash & Finance tab's reports (old CashFinanceReports.js). Each report:
 *
 *   label         its name in the dropdown and on its card - and its id here
 *   request       its entry in BH_REPORT_REQUESTS (Constants/businessHealth) -
 *                 what it sends, and so which filters it has; change a
 *                 report's request there, not here
 *   isOffered     (company) => false lists it greyed out, as the old tab did
 *   benchmark     its key in BH_BENCHMARKS; lowerIsBetter for the dot
 *   infoMessage   the (i) beside its title
 *   Plain         (data, benchmark) => the sentence, with no comparative
 *   Comparison    (data) => the table, with a comparative
 *
 * Cash Profit Ratio stays out, as it was commented out in the old tab.
 */

const twoDecimals = (value) =>
  Math.abs(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const CASH_FINANCE_REPORTS = [
  {
    label: 'Cash Flow Adequacy Ratio',
    request: 'cash_flow_adequacy',
    isOffered: (company) => hasActiveModule(company, 'Bank Statement'),
    benchmark: 'cash_flow_adequacy_ratio',
    infoMessage: 'More cash is coming in than going out.',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            For every ₹1 going out
            <Figure>{twoDecimals(data?.adequacy_ratio)}</Figure>
            came in as cash.
          </div>
          <HealthDot value={data?.adequacy_ratio} benchmark={benchmark} />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current', 'Comparative', 'Difference', '% Change']}
        cells={[
          data?.adequacy_ratio ?? 0,
          data?.comparative_adequacy_ratio ?? 0,
          data?.difference ?? 0,
          `${data?.percentage_change ?? 0}%`,
        ]}
      />
    ),
  },
]

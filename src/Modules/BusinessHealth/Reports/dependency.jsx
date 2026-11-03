import { ComparisonTable, HealthDot, NoteBox } from '@/Modules/BusinessHealth/Components/ReportCard'

/**
 * The views of Customer and Supplier Dependency, which differ only in their
 * words and field names. Both answers are keyed by the party asked for:
 *
 *   { "<party>": { <totalKey>, <valueKey>, dependency_ratio_pct,
 *                  comparative_<valueKey>, comparative_dependency_ratio_pct,
 *                  difference, percentage_change } }
 *
 *   party       'Customer' | 'Supplier' - the first column's heading
 *   totalLabel  'Total Sales' | 'Total Purchase'
 *   totalKey    total_sales | total_purchase
 *   valueKey    customer_sales | supplier_purchase
 *   valueLabel  'Sales' | 'Purchase' - in "Current …" / "Comparative …"
 *
 * The old tabs had the two tables' fields swapped, so each showed 0.
 */

const amount = (value) => (value || 0).toLocaleString('en-IN')

export const dependencyViews = ({ party, totalLabel, totalKey, valueKey, valueLabel }) => ({
  Plain: (data, benchmark) => (
    <div className="space-y-2">
      {Object.entries(data || {}).map(([name, item]) => (
        <NoteBox key={name}>
          <div className="mb-2">
            {totalLabel}:<span className="mx-2 text-lg font-semibold">₹ {amount(item?.[totalKey])}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              Your dependency on <span className="font-semibold capitalize">{name}</span> is
              <span className="mx-2 text-lg font-semibold">{item?.dependency_ratio_pct || 0}%</span>.
            </div>
            <HealthDot value={item?.dependency_ratio_pct} benchmark={benchmark} lowerIsBetter />
          </div>
        </NoteBox>
      ))}
    </div>
  ),
  Comparison: (data) => (
    <ComparisonTable
      headers={[
        party,
        `Current ${valueLabel}`,
        'Current Dependency',
        `Comparative ${valueLabel}`,
        'Comparative Dependency',
        'Difference',
        'Percentage Change',
      ]}
      rows={Object.entries(data || {}).map(([name, item]) => [
        name,
        `₹ ${amount(item?.[valueKey])}`,
        `${item?.dependency_ratio_pct || 0}%`,
        `₹ ${amount(item?.[`comparative_${valueKey}`])}`,
        `${item?.comparative_dependency_ratio_pct || 0}%`,
        `${item?.difference || 0}%`,
        `${item?.percentage_change || 0}%`,
      ])}
    />
  ),
})

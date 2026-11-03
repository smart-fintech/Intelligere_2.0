import { cn } from '@/Library/utils'
import { ComparisonTable, Figure, HealthDot, NoteBox } from '@/Modules/BusinessHealth/Components/ReportCard'
import { dependencyViews } from '@/Modules/BusinessHealth/Reports/dependency'
import { hasActiveModule } from '@/Services/accessService'

/**
 * The Purchase & Suppliers tab's reports (old PurchaseSuppliersReports.js) -
 * each in the shape described in Reports/cashFinance.jsx. Every one needs the
 * company's purchases ("Invoice Import" in the old plans, "Purchase Invoice"
 * here).
 *
 *   Purchase Price Inflation   products are optional; with none chosen the
 *                              answer carries only the overall %
 *   Vendor Lead Time           no Comparatives, as in the old tab; in days
 *   Supplier Dependency        suppliers are picked in the Buyer Name box and
 *                              sent as buyerName, as the old tab and the API
 *                              do; the table reads supplier_purchase - the old
 *                              one read the customer fields, never sent here
 */

const hasPurchase = (company) => hasActiveModule(company, 'Purchase Invoice')

const amount = (value) => (value || 0).toLocaleString('en-IN')
const twoDecimals = (value) => (value || 0).toFixed(2)

/** The per-product entries of an inflation answer - its top level also holds the overall figures. */
const inflationProducts = (data) =>
  Object.entries(data || {}).filter(([, item]) => item !== null && typeof item === 'object')

/** Old badge colours of a supplier's efficiency. */
const EFFICIENCY_TONE = {
  Excellent: 'bg-emerald-100 text-emerald-700',
  Good: 'bg-sky-100 text-sky-700',
  Average: 'bg-amber-100 text-amber-700',
}

export const PURCHASE_SUPPLIERS_REPORTS = [
  {
    label: 'Input Cost Ratio',
    request: 'input_cost_ratio',
    isOffered: hasPurchase,
    Plain: (data) => (
      <NoteBox>
        Out of every ₹100 of sales,
        <Figure>₹{amount(data?.input_cost_ratio)}</Figure>
        went toward purchase cost.
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Input Cost Ratio', 'Comparative Input Cost Ratio', 'Difference', '% Change']}
        cells={[
          `₹${data?.input_cost_ratio ?? 0}`,
          `₹${data?.comparative_input_cost_ratio ?? 0}`,
          data?.difference ?? 0,
          `${data?.percentage_change ?? 0}%`,
        ]}
      />
    ),
  },
  {
    label: 'Payable Days',
    request: 'payable_days',
    isOffered: hasPurchase,
    benchmark: 'payable_days',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            You take an average of
            <Figure>{data?.payable_days || 0}</Figure>
            days to pay suppliers.
          </div>
          <HealthDot value={data?.payable_days} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Payable Days', 'Comparative Payable Days', 'Difference', '% Change']}
        cells={[
          data?.payable_days ?? 0,
          data?.comparative_payable_days ?? 0,
          data?.difference ?? 0,
          `${data?.percentage_change ?? 0}%`,
        ]}
      />
    ),
  },
  {
    label: 'Price Volatility Ratio',
    request: 'price_volatility',
    isOffered: hasPurchase,
    infoMessage: 'How unstable supplier pricing is.',
    Plain: (data) => (
      <NoteBox>
        Purchase prices fluctuated by average
        <Figure>{amount(data?.overall_volatility_pct)}%</Figure>
        during the period.
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Price Volatility Ratio', 'Comparative Price Volatility Ratio', 'Difference', '% Change']}
        cells={[
          `${amount(data?.overall_volatility_pct)}%`,
          `${amount(data?.comparative_overall_volatility_pct)}%`,
          amount(data?.difference),
          `${data?.percentage_change || 0}%`,
        ]}
      />
    ),
  },
  {
    label: 'Purchase Price Inflation Ratio',
    request: 'purchase_price_inflation',
    isOffered: hasPurchase,
    benchmark: 'purchase_price_inflation_ratio',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p>
              Purchase costs increased by
              <span className="mx-2 text-lg font-semibold">{amount(data?.overall_inflation_pct)}%</span>
              compared with earlier periods.
            </p>
            <div className="mt-2">
              <strong>Product-wise Price Changes:</strong>
              <ul className="mt-2 list-disc pl-5">
                {inflationProducts(data).map(([name, item]) => (
                  <li key={name}>
                    <strong>{name}</strong>: ₹{amount(item.prev_price)} → ₹{amount(item.curr_price)} (
                    <span
                      className={cn(
                        item.inflation_pct > 0 && 'text-destructive',
                        item.inflation_pct < 0 && 'text-emerald-600',
                      )}
                    >
                      {twoDecimals(item.inflation_pct)}%
                    </span>
                    )
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <HealthDot value={data?.overall_inflation_pct} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <div className="space-y-4">
        <ComparisonTable
          headers={['Current Inflation %', 'Comparative Inflation %', 'Difference', '% Change']}
          cells={[
            `${amount(data?.overall_inflation_pct)}%`,
            `${amount(data?.comparative_overall_inflation_pct)}%`,
            `${amount(data?.difference)}%`,
            `${amount(data?.percentage_change)}%`,
          ]}
        />
        {inflationProducts(data).length ? (
          <ComparisonTable
            headers={['Product', 'Current Inflation %', 'Comparative Inflation %', 'Difference']}
            rows={inflationProducts(data).map(([name, item]) => [
              name,
              `${twoDecimals(item.inflation_pct)}%`,
              `${twoDecimals(item.comparative_inflation_pct)}%`,
              `${twoDecimals((item.inflation_pct || 0) - (item.comparative_inflation_pct || 0))}%`,
            ])}
          />
        ) : null}
      </div>
    ),
  },
  {
    label: 'Vendor Lead Time',
    request: 'vendor_lead_time',
    isOffered: hasPurchase,
    infoMessage: 'How fast suppliers deliver.',
    Plain: (data) => (
      <div className="space-y-4">
        <NoteBox>
          Suppliers take an average of
          <Figure>{amount(data?.overall_avg_lead_time_days)}</Figure>
          days to deliver purchase orders.
        </NoteBox>
        <div className="space-y-2">
          <h3 className="font-semibold">Supplier Lead Time Analysis</h3>
          <ComparisonTable
            headers={['Supplier', 'Avg Lead Time', 'Min', 'Max', 'Orders', 'Efficiency']}
            rows={(data?.per_supplier || []).map((supplier) => [
              supplier.supplier,
              `${supplier.avg_lead_time} Days`,
              `${supplier.min} Days`,
              `${supplier.max} Days`,
              supplier.count,
              <span
                key="efficiency"
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  EFFICIENCY_TONE[supplier.efficiency] ?? 'bg-destructive/10 text-destructive',
                )}
              >
                {supplier.efficiency}
              </span>,
            ])}
          />
        </div>
      </div>
    ),
  },
  {
    label: 'Supplier Dependency Ratio',
    request: 'supplier_dependency_ratio',
    isOffered: hasPurchase,
    benchmark: 'supplier_concentration_ratio',
    ...dependencyViews({
      party: 'Supplier',
      totalLabel: 'Total Purchase',
      totalKey: 'total_purchase',
      valueKey: 'supplier_purchase',
      valueLabel: 'Purchase',
    }),
  },
]

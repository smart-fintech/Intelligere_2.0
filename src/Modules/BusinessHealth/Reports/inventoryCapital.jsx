import { ComparisonTable, EntryBoxes, Figure, HealthDot, NoteBox } from '@/Modules/BusinessHealth/Components/ReportCard'
import { hasActiveModule } from '@/Services/accessService'
import { hasInventoryManagement } from '@/Services/inventoryService'

/**
 * The Inventory & Working Capital tab's reports (old InventoryCapitalReports.js)
 * - each in the shape described in Reports/cashFinance.jsx. Most need the
 * premium Inventory Management (hasInventoryManagement - the check the rest
 * of the app uses); Revenue per Bank Credit needs Bank Statement; the two
 * product reports need neither, as in the old tab.
 *
 *   Cash Conversion Cycle,     no Comparatives, as in the old tab
 *   Inventory Holding Days
 *   Revenue per Bank Credit    in rupees - the old tab showed the ratio
 *                              (sales / bank receipts) with a % sign
 */

const amount = (value) => (value || 0).toLocaleString('en-IN')

/** The per-product entries of a Holding Days answer - its top level also holds the overall figures. */
const holdingEntries = (data) =>
  Object.entries(data || {}).filter(([, item]) => item !== null && typeof item === 'object' && item.holding_days !== undefined)

/** The one-row current / comparative / difference / % change table, each value formatted by `format`. */
const changeTable = (data, valueKey, format = (value) => value, headers = ['Current', 'Comparative', 'Difference', '% Change']) => (
  <ComparisonTable
    headers={headers}
    cells={[
      format(data?.[valueKey] ?? 0),
      format(data?.[`comparative_${valueKey}`] ?? 0),
      format(data?.difference ?? 0),
      `${data?.percentage_change ?? 0}%`,
    ]}
  />
)

export const INVENTORY_CAPITAL_REPORTS = [
  {
    label: 'Cash Conversion Cycle (CCC)',
    request: 'cash_conversion_cycle',
    isOffered: hasInventoryManagement,
    benchmark: 'cash_conversion_cycle',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            Your cash is locked for about
            <Figure>{amount(data?.cash_conversion_cycle_days)}</Figure>
            days before it comes back.
          </div>
          <HealthDot value={data?.cash_conversion_cycle_days} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
  },
  {
    label: 'Dead Stock Ratio',
    request: 'dead_stock_ratio',
    isOffered: hasInventoryManagement,
    benchmark: 'dead_stock_percent',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Figure>{amount(data?.dead_stock_ratio_pct)}%</Figure>
            of your inventory remains non-moving.
          </div>
          <HealthDot value={data?.dead_stock_ratio_pct} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => changeTable(data, 'dead_stock_ratio_pct'),
  },
  {
    label: 'Inventory Holding Days',
    request: 'inventory_holding_days',
    isOffered: hasInventoryManagement,
    benchmark: 'inventory_holding_days',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            Your stock remained in warehouse for
            <Figure>{amount(data?.holding_days)}</Figure>
            days before getting sold.
          </div>
          <HealthDot value={data?.holding_days} benchmark={benchmark} />
        </div>
        {holdingEntries(data).map(([name, item]) => (
          <div key={name} className="mb-2">
            <strong>{name}</strong> stock remained for
            <span className="mx-2 font-semibold">{item.holding_days}</span>
            days before getting sold.
          </div>
        ))}
      </NoteBox>
    ),
  },
  {
    label: 'Inventory Turnover',
    request: 'inventory_turnover',
    isOffered: hasInventoryManagement,
    benchmark: 'inventory_turnover_per_year',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            Your stock got sold and replaced
            <Figure>{amount(data?.turnover_ratio)}</Figure>
            times during the period.
          </div>
          <HealthDot value={data?.turnover_ratio} benchmark={benchmark} />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => changeTable(data, 'turnover_ratio'),
  },
  {
    label: 'Product sold in numbers max–min & profit %',
    request: 'product_stats',
    Plain: (data) => (
      <EntryBoxes data={data}>
        {(item) => (
          <>
            This product sold
            <Figure>{amount(item?.sold_qty)}</Figure>
            units and gave a profit margin of
            <Figure>{amount(item?.profit_pct)}%</Figure>.
          </>
        )}
      </EntryBoxes>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Product', 'Sold QTY', 'Comparative Sold QTY', 'Profit', 'Comparative Profit']}
        rows={Object.entries(data || {}).map(([name, item]) => [
          name,
          item?.sold_qty,
          item?.comparative_sold_qty,
          `₹${amount(item?.profit)}`,
          `₹${amount(item?.comparative_profit)}`,
        ])}
      />
    ),
  },
  {
    label: 'Product-wise Sales / Profit',
    request: 'gross_margin',
    Plain: (data) => (
      <EntryBoxes data={data}>
        {(item) => (
          <>
            This product generated sales of
            <Figure>₹{amount(item?.sales)}</Figure>
            and profit of
            <Figure>₹{amount(item?.profit)}</Figure>.
          </>
        )}
      </EntryBoxes>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Product', 'Sales', 'Comparative Sales', 'Profit', 'Comparative Profit']}
        rows={Object.entries(data || {}).map(([name, item]) => [
          name,
          item?.sales,
          item?.comparative_sales,
          `₹${amount(item?.profit)}`,
          `₹${amount(item?.comparative_profit)}`,
        ])}
      />
    ),
  },
  {
    label: 'Revenue per Bank Credit',
    request: 'revenue_per_bank_credit',
    isOffered: (company) => hasActiveModule(company, 'Bank Statement'),
    Plain: (data) => (
      <NoteBox>
        Each bank credit entry brought an average of
        <Figure>₹{amount(data?.revenue_per_credit)}</Figure>
        in revenue.
      </NoteBox>
    ),
    Comparison: (data) =>
      changeTable(data, 'revenue_per_credit', (value) => `₹${amount(value)}`, [
        'Current Ratio',
        'Comparative Ratio',
        'Difference',
        '% Change',
      ]),
  },
  {
    label: 'Stock-to-Sales Ratio',
    request: 'stock_to_sales_ratio',
    isOffered: hasInventoryManagement,
    benchmark: 'stock_to_sales_ratio',
    infoMessage: 'Stock compared to monthly sales.',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            For every ₹100 of sales, you are holding
            <Figure>{data?.ratio || 0}%</Figure>
            worth of stock.
          </div>
          <HealthDot value={data?.ratio} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Ratio', 'Comparative Ratio', 'Difference', '% Change']}
        cells={[
          `${data?.ratio ?? 0}%`,
          `${data?.comparative_ratio ?? 0}%`,
          `${data?.difference ?? 0}%`,
          `${data?.percentage_change ?? 0}%`,
        ]}
      />
    ),
  },
  {
    label: 'Working Capital Stress Indicator',
    request: 'working_capital_stress',
    isOffered: hasInventoryManagement,
    benchmark: 'working_capital_stress_indicator',
    infoMessage: 'How much money is stuck in receivables & inventory.',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            Daily operations are putting pressure on cash for about
            <Figure>{data?.stress_ratio || 0}</Figure>
            days.
          </div>
          <HealthDot value={data?.stress_ratio} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Ratio', 'Comparative Ratio']}
        cells={[`${data?.stress_ratio ?? 0} Days`, `${data?.comparative_stress_ratio ?? 0} Days`]}
      />
    ),
  },
]

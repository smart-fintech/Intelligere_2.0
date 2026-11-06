import { cn } from '@/Library/utils'
import { ComparisonTable, EntryBoxes, Figure, HealthDot, NoteBox } from '@/Modules/BusinessHealth/Components/ReportCard'
import { hasActiveModule } from '@/Services/Auth/accessService'

/**
 * The Sale & Margins tab's reports (old SaleMarginReports.js) - each in the
 * shape described in Reports/cashFinance.jsx. Net Profit, and with it the
 * Overhead % field, stays out: it was commented out in the old tab.
 *
 * Changed from the old tab, on purpose:
 *   Discount Dependency   the table reads discount_dependency_pct - the old
 *                         one read discount_dependency_ratio, which the API
 *                         does not send, so it always showed 0
 *   MoM / YoY Profit      a comparative is required (without one the API
 *                         answers only { msg }), and the table shows the
 *                         profit fields the API sends - the old one read
 *                         comparative_profit_change*, which it never does
 *   Period-wise           its table shows the four amounts in rupees - the
 *                         old one had no ₹ and a stray % after the last
 */

/** "Invoice Create" in the old plans is "Sales Invoice" here. */
const hasSales = (company) => hasActiveModule(company, 'Sales Invoice')

const amount = (value) => (value || 0).toLocaleString('en-IN')

/** The currency of the Period-wise table only - change it here and nowhere else. */
const PERIOD_WISE_CURRENCY = '₹'

/** A % change, green when it did not fall, red when it did (old Gross & Net tables). */
const changeCell = (value) => (
  <span className={cn('font-bold', value >= 0 ? 'text-emerald-600' : 'text-destructive')}>{value || 0}%</span>
)

/** The Gross & Net Profit figure cards and comparison tables, one per half. */
const profitHalf = (title, amountValue, sentence) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <h3 className="mb-3 text-sm text-muted-foreground">{title}</h3>
    <p className="mb-2 text-2xl font-bold">₹{amount(amountValue)}</p>
    <p className="text-sm text-muted-foreground">{sentence}</p>
  </div>
)

const profitComparison = (title, report, valueKey) => (
  <div className="space-y-2">
    <h3 className="text-sm font-bold text-muted-foreground">{title}</h3>
    <ComparisonTable
      headers={['Current Period', 'Comparative Period', 'Difference', '% Change']}
      cells={[
        `₹${amount(report?.[valueKey])}`,
        `₹${amount(report?.[`comparative_${valueKey}`])}`,
        `₹${amount(report?.difference)}`,
        changeCell(report?.percentage_change),
      ]}
    />
  </div>
)

export const SALE_MARGINS_REPORTS = [
  {
    label: 'Average Invoice Value',
    request: 'average_invoice_value',
    isOffered: hasSales,
    Plain: (data) => (
      <NoteBox>
        Each invoice was worth
        <Figure>₹{amount(data?.avg_invoice_value)}</Figure>
        on average.
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current', 'Comparative', 'Difference', '% Change']}
        cells={[
          data?.avg_invoice_value ?? 0,
          data?.comparative_avg_invoice_value ?? 0,
          data?.difference ?? 0,
          `${data?.percentage_change ?? 0}%`,
        ]}
      />
    ),
  },
  {
    label: 'Average Selling Price',
    request: 'average_selling_price',
    isOffered: hasSales,
    Plain: (data) => (
      <EntryBoxes data={data}>
        {(item) => (
          <>
            Each unit sold at average price of
            <Figure>₹{amount(item?.avg_selling_price)}</Figure>.
          </>
        )}
      </EntryBoxes>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Product', 'Current ASP', 'Comparative ASP']}
        rows={Object.entries(data || {}).map(([name, item]) => [
          name,
          `₹${amount(item?.avg_selling_price)}`,
          `₹${amount(item?.comparative_avg_selling_price)}`,
        ])}
      />
    ),
  },
  {
    label: 'Discount Dependency Ratio',
    request: 'discount_dependency',
    isOffered: hasSales,
    benchmark: 'discount_dependency_ratio',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Figure>{data?.discount_dependency_pct || 0}%</Figure>
            of your sales depended on discounts.
          </div>
          <HealthDot value={data?.discount_dependency_pct} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Ratio', 'Comparative Ratio', 'Difference', '% Change']}
        cells={[
          `${data?.discount_dependency_pct ?? 0}%`,
          `${data?.comparative_discount_dependency_pct ?? 0}%`,
          `${data?.difference ?? 0}%`,
          `${data?.percentage_change ?? 0}%`,
        ]}
      />
    ),
  },
  {
    label: 'Gross & Net Profit',
    request: 'gross_net_profit',
    Plain: (data) => (
      <NoteBox>
        <div className="grid gap-3 md:grid-cols-2">
          {profitHalf(
            'Gross Profit',
            data?.gross_profit_report?.gross_profit,
            <>
              From every ₹100 of sales, you kept
              <span className="mx-2 font-bold text-foreground">{data?.gross_profit_report?.gross_profit_pct || 0}</span>
              after direct costs.
            </>,
          )}
          {profitHalf(
            'Net Profit',
            data?.net_profit_report?.net_profit,
            <>
              After paying all expenses,
              <span className="mx-2 font-bold text-foreground">{data?.net_profit_report?.net_profit_pct || 0}</span>
              is the money actually left in your pocket.
            </>,
          )}
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <div className="grid gap-4 lg:grid-cols-2">
        {profitComparison('Gross Profit Comparison', data?.gross_profit_report, 'gross_profit')}
        {profitComparison('Net Profit Comparison', data?.net_profit_report, 'net_profit')}
      </div>
    ),
  },
  {
    label: 'MoM / YoY Profit Change',
    request: 'profit_change',
    Plain: (data) => (
      <NoteBox>
        Compared with the previous period, profit changed by
        <Figure>₹{Math.abs(data?.profit_change || 0).toLocaleString('en-IN')}</Figure>
        or
        <Figure>{Math.abs(data?.profit_change_pct || 0).toLocaleString('en-IN')}%</Figure>.
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Current Profit', 'Comparative Profit', 'Profit Change', 'Change %']}
        cells={[
          `₹${amount(data?.profit)}`,
          `₹${amount(data?.comparative_profit)}`,
          `₹${amount(data?.profit_change)}`,
          `${(data?.profit_change_pct || 0).toLocaleString('en-IN')}%`,
        ]}
      />
    ),
  },
  {
    label: 'Period-wise Sales / Profit',
    request: 'period_profitsales',
    Plain: (data) => (
      <NoteBox>
        During this period, sales were
        <Figure>₹{amount(data?.sales)}</Figure>
        and profit was
        <Figure>₹{amount(data?.profit)}</Figure>.
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Sale', 'Comparative Sale', 'Profit', 'Comparative Profit']}
        cells={[data?.sales, data?.comparative_sales, data?.profit, data?.comparative_profit].map(
          (value) => `${PERIOD_WISE_CURRENCY}${amount(value)}`,
        )}
      />
    ),
  },
  {
    label: 'Sales Growth Momentum',
    request: 'sales_growth_momentum',
    isOffered: hasSales,
    infoMessage: 'Month-to-month sales growth.',
    Plain: (data) => (
      <NoteBox>
        Sales moved by
        <Figure>₹{amount(data?.growth_amount)}</Figure>
        or
        <Figure>{amount(data?.growth_pct)}%</Figure>
        compared with the previous period.
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Growth Amount', 'Growth %', 'Current Sales', 'Previous Period Sales']}
        cells={[
          data?.growth_amount ?? 0,
          `${data?.growth_pct ?? 0}%`,
          data?.current_sales ?? 0,
          // spelt as the API sends it
          data?.Compartive_sales ?? 0,
        ]}
      />
    ),
  },
  {
    label: 'Sales Return Ratio',
    request: 'sales_return_ratio',
    isOffered: hasSales,
    benchmark: 'sales_return_ratio',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Figure>{amount(data?.return_ratio_pct)}%</Figure>
            of sold goods came back as returns.
          </div>
          <HealthDot value={data?.return_ratio_pct} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Return Ratio', 'Comparative Return Ratio', 'Difference', 'Percentage Change']}
        cells={[
          data?.return_ratio_pct || 0,
          data?.comparative_return_ratio_pct ?? 0,
          data?.difference ?? 0,
          data?.percentage_change ?? 0,
        ]}
      />
    ),
  },
]

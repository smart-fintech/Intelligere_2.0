import { ComparisonTable, EntryBoxes, Figure, HealthDot, NoteBox } from '@/Modules/BusinessHealth/Components/ReportCard'
import { dependencyViews } from '@/Modules/BusinessHealth/Reports/dependency'
import { hasActiveModule } from '@/Services/accessService'

/**
 * The Customer & Receivables tab's reports (old CustomerReceivablesReports.js)
 * - each in the shape described in Reports/cashFinance.jsx. The buyer-wise
 * reports and Customer Dependency need buyers (their requests' `buyers`), sent as buyerName
 * [ledger names]; the answer is keyed by buyer. As in the old tab, the
 * buyers chosen stay chosen when another buyer report is picked.
 *
 * Changed from the old tab, on purpose:
 *   Revenue Concentration   no Comparatives (the API has no comparative for
 *                           it - the old table read a key it never sends,
 *                           under "Receivable Days" headings); its dot is
 *                           lower-is-better, as its "<30%" range says - the
 *                           old check could only ever be red
 *   Customer Dependency     the table reads customer_sales - the old one read
 *                           the supplier fields, which this report never sends
 *                           (its views are Reports/dependency.jsx)
 */

const hasSales = (company) => hasActiveModule(company, 'Sales Invoice')

const amount = (value) => (value || 0).toLocaleString('en-IN')

/** A buyer report's table: the buyer, then one cell per field. */
const buyerRows = (data, fields) =>
  Object.entries(data || {}).map(([buyer, item]) => [buyer, ...fields.map((field) => field(item))])

export const CUSTOMER_RECEIVABLES_REPORTS = [
  {
    label: 'Buyer-wise Payment Receipt Days',
    request: 'buyer_paymentdays',
    Plain: (data) => (
      <EntryBoxes data={data}>
        {(item) => (
          <>
            Cash from this buyer usually comes back after
            <Figure>{amount(item?.avg_payment_days)}</Figure>
            days.
          </>
        )}
      </EntryBoxes>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Buyer', 'Current Payment Days', 'Comparative Payment Days']}
        rows={buyerRows(data, [(item) => amount(item?.avg_payment_days), (item) => amount(item?.comparative_avg_payment_days)])}
      />
    ),
  },
  {
    label: 'Buyer-wise Profit %',
    request: 'buyer_profitpct',
    Plain: (data) => (
      <EntryBoxes data={data}>
        {(item) => (
          <>
            From every ₹100 sold to this buyer, you kept
            <Figure>{amount(item?.profit_pct)}%</Figure>
            as profit.
          </>
        )}
      </EntryBoxes>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Buyer', 'Current Profit %', 'Comparative Profit %']}
        rows={buyerRows(data, [(item) => amount(item?.profit_pct), (item) => amount(item?.comparative_profit_pct)])}
      />
    ),
  },
  {
    label: 'Buyer-wise Sales / Profit',
    request: 'buyer_profitsales',
    Plain: (data) => (
      <EntryBoxes data={data}>
        {(item) => (
          <>
            This buyer gave sales of
            <Figure>₹{amount(item?.sales)}</Figure>
            and profit of
            <Figure>₹{amount(item?.profit)}.</Figure>
          </>
        )}
      </EntryBoxes>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Buyer', 'Current Sales', 'Current Profit', 'Comparative Sales', 'Comparative Profit']}
        rows={buyerRows(data, [
          (item) => amount(item?.sales),
          (item) => amount(item?.profit),
          (item) => amount(item?.comparative_sales),
          (item) => amount(item?.comparative_profit),
        ])}
      />
    ),
  },
  {
    label: 'Credit Sales Ratio',
    request: 'credit_sales_ratio',
    isOffered: hasSales,
    benchmark: 'credit_sales_ratio',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Figure>{data?.credit_sales_ratio_pct || 0}%</Figure>
            of your sales were made on credit.
          </div>
          <HealthDot value={data?.credit_sales_ratio_pct} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Credit Sales Ratio', 'Comparative Credit Sales Ratio', 'Total Sales']}
        cells={[
          `${data?.credit_sales_ratio_pct ?? 0}%`,
          `${data?.comparative_credit_sales_ratio_pct ?? 0}%`,
          data?.total_sales ?? 0,
        ]}
      />
    ),
  },
  {
    label: 'Customer Repeat Ratio',
    request: 'customer_repeat_ratio',
    isOffered: hasSales,
    benchmark: 'customer_repeat_ratio',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Figure>{data?.repeat_ratio_pct || 0}%</Figure>
            of your sales came from repeat customers.
          </div>
          <HealthDot value={data?.repeat_ratio_pct} benchmark={benchmark} />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Customer Repeat Ratio', 'Comparative Customer Repeat Ratio', 'Difference', 'Percentage Change']}
        cells={[
          `${data?.repeat_ratio_pct ?? 0}%`,
          `${data?.comparative_repeat_ratio_pct ?? 0}%`,
          data?.difference ?? 0,
          data?.percentage_change ?? 0,
        ]}
      />
    ),
  },
  {
    label: 'Receivable Days',
    request: 'receivable_days',
    isOffered: hasSales,
    benchmark: 'receivable_days',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            Your money stays stuck with customers for an average
            <Figure>{data?.receivable_days || 0}</Figure>
            days after sale.
          </div>
          <HealthDot value={data?.receivable_days} benchmark={benchmark} />
        </div>
      </NoteBox>
    ),
    Comparison: (data) => (
      <ComparisonTable
        headers={['Receivable Days', 'Comparative Receivable Days', 'Difference', 'Percentage Change']}
        cells={[
          data?.receivable_days ?? 0,
          data?.comparative_receivable_days ?? 0,
          data?.difference ?? 0,
          data?.percentage_change ?? 0,
        ]}
      />
    ),
  },
  {
    label: 'Revenue Concentration Ratio',
    request: 'revenue_concentration',
    isOffered: (company) => hasActiveModule(company, 'Bank Statement'),
    benchmark: 'revenue_concentration_ratio_cash',
    Plain: (data, benchmark) => (
      <NoteBox>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Figure>{data?.concentration_ratio || 0}%</Figure>
            of your cash collections came from 5 customers.
          </div>
          <HealthDot value={data?.concentration_ratio} benchmark={benchmark} lowerIsBetter />
        </div>
      </NoteBox>
    ),
  },
  {
    label: 'Customer Dependency Ratio',
    request: 'customer_dependency_ratio',
    benchmark: 'customer_dependency_ratio',
    ...dependencyViews({
      party: 'Customer',
      totalLabel: 'Total Sales',
      totalKey: 'total_sales',
      valueKey: 'customer_sales',
      valueLabel: 'Sales',
    }),
  },
]

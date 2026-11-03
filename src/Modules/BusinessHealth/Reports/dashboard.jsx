import { BH_DASHBOARD_PERIOD } from '@/Constants/businessHealth'
import { requestOf } from '@/Modules/BusinessHealth/businessHealth'
import { Figure } from '@/Modules/BusinessHealth/Components/ReportCard'

/**
 * What the Dashboard can pin (the old MISDashboard's `reports` and
 * `reportTemplates`, joined), by section. Each report:
 *
 *   label                 its tick box
 *   title                 its card's heading
 *   request               its entry in BH_REPORT_REQUESTS - the same one its
 *                         tab uses; a card sends only BH_DASHBOARD_PERIOD,
 *                         the responseType and params (no comparative,
 *                         products or buyers), as in the old Dashboard
 *   responseKey           the figure the sentence and the dot read (v1)
 *   responseSecondryKey   a second figure (v2) - spelt as the old saved
 *                         dashboards spell it
 *   range                 the card's fixed range and dot (isWithinRange) -
 *                         the old Dashboard's own, not the industry's
 *   sentence(v1, v2)      the card's text
 *
 * Changed from the old Dashboard, on purpose:
 *   Sales Return Ratio            reads return_ratio_pct (the old card showed
 *                                 the returns amount with a % after it)
 *   Vendor Lead Time,             in days - the old cards put ₹ before them
 *   Working Capital Stress
 *   Revenue Concentration         its dot is lower-is-better, as its "<30%"
 *                                 says - the old check could only be red
 *
 * Cash Profit Ratio, Gross / Net Profit (apart) and Inventory Turnover stay
 * out - they were commented out in the old Dashboard.
 */

const show = (value) => value ?? 0

const profitHalf = (title, amount, sentence) => (
  <div>
    <h3 className="mb-2 text-sm text-muted-foreground">{title}</h3>
    <p className="mb-2 text-2xl font-bold">₹{(amount ?? 0).toLocaleString('en-IN')}</p>
    <p className="text-sm text-muted-foreground">{sentence}</p>
  </div>
)

export const DASHBOARD_SECTIONS = [
  {
    id: 'cash_finance',
    title: 'Cash & Finance',
    reports: [
      {
        label: 'Cash Flow Adequacy Ratio',
        request: 'cash_flow_adequacy',
        title: 'Cash Flow Adequacy Ratio',
        responseKey: 'adequacy_ratio',
        range: { display: '>1.05', min: 1.05, lower: false },
        sentence: (v1) => (
          <>
            For every ₹1 going out<Figure>₹{show(v1)}</Figure>came in as cash.
          </>
        ),
      },
    ],
  },
  {
    id: 'sales_margin',
    title: 'Sales & Margin',
    reports: [
      {
        label: 'Average Invoice Value',
        request: 'average_invoice_value',
        title: 'Average Invoice Value',
        responseKey: 'avg_invoice_value',
        sentence: (v1) => (
          <>
            Each invoice was worth<Figure>₹{show(v1)}</Figure>on average.
          </>
        ),
      },
      {
        label: 'Discount Dependency Ratio',
        request: 'discount_dependency',
        title: 'Discount Dependency Ratio',
        responseKey: 'discount_dependency_pct',
        range: { display: '<8%', max: 8, lower: true },
        sentence: (v1) => (
          <>
            <Figure>{show(v1)}%</Figure>of your sales depended on discounts.
          </>
        ),
      },
      {
        label: 'Gross & Net Profit',
        request: 'gross_net_profit',
        title: 'Gross & Net Profit',
        responseKey: 'gross_profit_report',
        responseSecondryKey: 'net_profit_report',
        sentence: (gross, net) => (
          <span className="grid gap-4 md:grid-cols-2">
            {profitHalf(
              'Gross Profit',
              gross?.gross_profit,
              <>
                From every ₹100 of sales, you kept
                <span className="mx-2 font-bold text-foreground">{gross?.gross_profit_pct ?? 0}</span>
                after direct cost.
              </>,
            )}
            {profitHalf(
              'Net Profit',
              net?.net_profit,
              <>
                After paying all expenses,
                <span className="mx-2 font-bold text-foreground">{net?.net_profit_pct ?? 0}</span>
                is the money actually left in your pocket.
              </>,
            )}
          </span>
        ),
      },
      {
        label: 'MoM / YoY Profit Change',
        request: 'profit_change',
        title: 'MoM / YoY Profit Change',
        responseKey: 'profit_change',
        responseSecondryKey: 'profit_change_pct',
        sentence: (v1, v2) => (
          <>
            Compared with the previous period, profit changed by<Figure>₹{show(v1)}</Figure>or
            <Figure>{show(v2)}%</Figure>.
          </>
        ),
      },
      {
        label: 'Period-wise Sales / Profit',
        request: 'period_profitsales',
        title: 'Period-wise Sales / Profit',
        responseKey: 'sales',
        responseSecondryKey: 'profit',
        sentence: (v1, v2) => (
          <>
            During this period, sales were<Figure>₹{show(v1)}</Figure>and profit was<Figure>₹{show(v2)}</Figure>.
          </>
        ),
      },
      {
        label: 'Sales Growth Momentum',
        request: 'sales_growth_momentum',
        title: 'Sales Growth Momentum',
        responseKey: 'growth_amount',
        responseSecondryKey: 'growth_pct',
        sentence: (v1, v2) => (
          <>
            Sales moved by<Figure>₹{show(v1)}</Figure>or<Figure>{show(v2)}%</Figure>compared with the previous period.
          </>
        ),
      },
      {
        label: 'Sales Return Ratio',
        request: 'sales_return_ratio',
        title: 'Sales Return Ratio',
        responseKey: 'return_ratio_pct',
        range: { display: '<3%', max: 3, lower: true },
        sentence: (v1) => (
          <>
            <Figure>{show(v1)}%</Figure>of sold goods came back as returns.
          </>
        ),
      },
    ],
  },
  {
    id: 'customer_receivables',
    title: 'Customer Receivables',
    reports: [
      {
        label: 'Credit Sales Ratio',
        request: 'credit_sales_ratio',
        title: 'Credit Sales Ratio',
        responseKey: 'credit_sales_ratio_pct',
        range: { display: '<70%', max: 70, lower: true },
        sentence: (v1) => (
          <>
            <Figure>{show(v1)}%</Figure>of your sales were made on credit.
          </>
        ),
      },
      {
        label: 'Customer Repeat Ratio',
        request: 'customer_repeat_ratio',
        title: 'Customer Repeat Ratio',
        responseKey: 'repeat_ratio_pct',
        range: { display: '40-60%', min: 40, max: 60, lower: false },
        sentence: (v1) => (
          <>
            <Figure>{show(v1)}%</Figure>of your sales came from repeat customers.
          </>
        ),
      },
      {
        label: 'Receivable Days',
        request: 'receivable_days',
        title: 'Receivable Days',
        responseKey: 'receivable_days',
        range: { display: '45-75 Days', min: 45, max: 75, lower: false },
        sentence: (v1) => (
          <>
            Your money stays stuck with customers for average<Figure>{show(v1)}</Figure>days after sale.
          </>
        ),
      },
      {
        label: 'Revenue Concentration Ratio',
        request: 'revenue_concentration',
        title: 'Revenue Concentration Ratio',
        responseKey: 'concentration_ratio',
        range: { display: 'Top 5 Customer <30%', max: 30, lower: true },
        sentence: (v1) => (
          <>
            <Figure>{show(v1)}%</Figure>of your cash collections came from 5 customers.
          </>
        ),
      },
    ],
  },
  {
    id: 'purchase_supplier',
    title: 'Purchase Supplier',
    reports: [
      {
        label: 'Input Cost Ratio',
        request: 'input_cost_ratio',
        title: 'Input Cost Ratio',
        responseKey: 'input_cost_ratio',
        sentence: (v1) => (
          <>
            Out of every ₹100 of sales,<Figure>₹{show(v1)}</Figure>went toward purchase cost.
          </>
        ),
      },
      {
        label: 'Payable Days',
        request: 'payable_days',
        title: 'Payable Days',
        responseKey: 'payable_days',
        range: { display: '45-75 Days', min: 45, max: 75, lower: true },
        sentence: (v1) => (
          <>
            You usually take average<Figure>{show(v1)}</Figure>days to pay suppliers.
          </>
        ),
      },
      {
        label: 'Price Volatility Ratio',
        request: 'price_volatility',
        title: 'Price Volatility Ratio',
        responseKey: 'overall_volatility_pct',
        sentence: (v1) => (
          <>
            Purchase prices fluctuated by about<Figure>{show(v1)}%</Figure>during the period.
          </>
        ),
      },
      {
        label: 'Purchase Price Inflation Ratio',
        request: 'purchase_price_inflation',
        title: 'Purchase Price Inflation Ratio',
        responseKey: 'overall_inflation_pct',
        sentence: (v1) => (
          <>
            Purchase prices fluctuated by average<Figure>{show(v1)}%</Figure>during the period.
          </>
        ),
      },
      {
        label: 'Vendor Lead Time',
        request: 'vendor_lead_time',
        title: 'Vendor Lead Time',
        responseKey: 'overall_avg_lead_time_days',
        sentence: (v1) => (
          <>
            Suppliers take an average of<Figure>{show(v1)}</Figure>days to deliver purchase orders.
          </>
        ),
      },
    ],
  },
  {
    id: 'inventory_capital',
    title: 'Inventory Capital',
    reports: [
      {
        label: 'Cash Conversion Cycle (CCC)',
        request: 'cash_conversion_cycle',
        title: 'Cash Conversion Cycle',
        responseKey: 'cash_conversion_cycle_days',
        sentence: (v1) => (
          <>
            Your cash is locked for about<Figure>{show(v1)}</Figure>days before it comes back.
          </>
        ),
      },
      {
        label: 'Dead Stock Ratio',
        request: 'dead_stock_ratio',
        title: 'Dead Stock Ratio',
        responseKey: 'dead_stock_ratio_pct',
        range: { display: '<5%', max: 5, lower: true },
        sentence: (v1) => (
          <>
            <Figure>{show(v1)}%</Figure>of your inventory remains non-moving.
          </>
        ),
      },
      {
        label: 'Revenue per Bank Credit',
        request: 'revenue_per_bank_credit',
        title: 'Revenue per Bank Credit',
        responseKey: 'revenue_per_credit',
        sentence: (v1) => (
          <>
            Each bank credit entry brought an average of<Figure>₹{show(v1)}</Figure>in revenue.
          </>
        ),
      },
      {
        label: 'Stock-to-Sales Ratio',
        request: 'stock_to_sales_ratio',
        title: 'Stock-to-Sales Ratio',
        responseKey: 'ratio',
        range: { display: '10-25%', min: 10, max: 25, lower: true },
        sentence: (v1) => (
          <>
            For every ₹100 of sales, you are holding<Figure>₹{show(v1)}</Figure>worth of stock.
          </>
        ),
      },
      {
        label: 'Working Capital Stress Indicator',
        request: 'working_capital_stress',
        title: 'Working Capital Stress Indicator',
        responseKey: 'working_capital',
        range: { display: '<30 Days', max: 30, lower: true },
        sentence: (v1) => (
          <>
            Daily operations are putting pressure on cash for about<Figure>{show(v1)}</Figure>days.
          </>
        ),
      },
    ],
  },
]

/** The most reports a dashboard may pin. */
export const DASHBOARD_MAX_REPORTS = 6

/** Whether a saved entry is this report - a report is its request's reportType and responseType. */
const isSameReport = (report, saved) => {
  const request = requestOf(report)
  return request.reportType === saved.reportType && (request.responseType || '') === (saved.responseType || '')
}

/** A dashboard report as the old project saved it, so either app reads the other's dashboards. */
export const toSavedReport = (report) => ({
  reportType: requestOf(report).reportType,
  responseType: requestOf(report).responseType || '',
  current_period: BH_DASHBOARD_PERIOD,
  range: report.range,
  responseKey: report.responseKey,
  ...(report.responseSecondryKey && { responseSecondryKey: report.responseSecondryKey }),
})

/** The pinnable report a saved entry stands for, or null for one this app does not know. */
export const findDashboardReport = (saved) =>
  DASHBOARD_SECTIONS.flatMap((section) => section.reports).find((report) => isSameReport(report, saved)) ?? null

/**
 * The Business Health Indicators module's fixed names (old project: MIS Reports).
 *
 *   BUSINESS_HEALTH_MODULE   its entry in `active_modules` - its key in
 *                            Constants/dashboardModules. The backend's plans
 *                            still call it "MIS Reports" (see accessService)
 *   BH_VIEW                  the six views: the pinned-reports Dashboard and
 *                            the five report categories
 *   BH_VIEW_OPTIONS          the radio buttons at the top of the page, in order
 *   BH_PERIOD_OPTIONS        `current_period`, as the API names them
 *   BH_COMPARATIVE_OPTIONS   the `comparative` choices each period offers
 *   BH_EMPTY_FILTERS         a report tab's filters before anything is chosen,
 *                            and after Clear
 *   BH_BENCHMARKS            each industry's healthy range per indicator
 *   BH_DEFAULT_INDUSTRY      the industry used when Master Details has none
 *   BH_PAYLOAD_FIELDS        which filter goes into which request field
 *   BH_REPORT_REQUESTS       what every report sends - THE place to change a
 *                            report's request (see the note above it)
 *   BH_DASHBOARD_PERIOD      the period every Dashboard card is asked for
 */

export const BUSINESS_HEALTH_MODULE = 'Business Health Indicators'

export const BH_VIEW = Object.freeze({
  DASHBOARD: 'dashboard',
  CASH_FINANCE: 'cashFinance',
  SALE_MARGINS: 'saleMargins',
  CUSTOMER_RECEIVABLES: 'customerReceivables',
  PURCHASE_SUPPLIERS: 'purchaseSuppliers',
  INVENTORY_CAPITAL: 'inventoryCapital',
})

export const BH_VIEW_OPTIONS = Object.freeze([
  { value: BH_VIEW.DASHBOARD, label: 'Dashboard' },
  { value: BH_VIEW.CASH_FINANCE, label: 'Cash & Finance' },
  { value: BH_VIEW.SALE_MARGINS, label: 'Sale & Margins' },
  { value: BH_VIEW.CUSTOMER_RECEIVABLES, label: 'Customer & Receivables' },
  { value: BH_VIEW.PURCHASE_SUPPLIERS, label: 'Purchase & Suppliers' },
  { value: BH_VIEW.INVENTORY_CAPITAL, label: 'Inventory & Working Capital' },
])

/* ------------------------------------------------------------------ */
/* A report tab's filters                                             */
/* ------------------------------------------------------------------ */

export const BH_PERIOD_OPTIONS = Object.freeze([
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_year', label: 'Half Year' },
  { value: 'financial_year', label: 'Financial Year' },
  { value: 'custom', label: 'Custom' },
])

export const BH_COMPARATIVE_OPTIONS = Object.freeze({
  monthly: [
    { value: 'last_month', label: 'Last Month' },
    { value: 'current_month_last_year', label: 'Current Month Last Year' },
  ],
  quarterly: [
    { value: 'last_quarter', label: 'Last Quarter' },
    { value: 'current_quarter_last_year', label: 'Current Quarter Last Year' },
  ],
  half_year: [{ value: 'last_half_year', label: 'Last Half Year' }],
  financial_year: [{ value: 'last_financial_year', label: 'Last Financial Year' }],
  custom: [{ value: 'custom', label: 'Custom' }],
})

/** `report` is the chosen report's label; dates are YYYY-MM-DD; names are lists. */
export const BH_EMPTY_FILTERS = Object.freeze({
  report: '',
  current_period: 'monthly',
  fromDate: '',
  toDate: '',
  comparative: '',
  comparativeFromDate: '',
  comparativeToDate: '',
  productNames: [],
  buyerNames: [],
})

/* ------------------------------------------------------------------ */
/* Report requests                                                    */
/* ------------------------------------------------------------------ */

/**
 * The request field each filter is sent as (by buildReportPayload in
 * BusinessHealth/businessHealth.js). Rename a request field here and every
 * report follows. `company_id` is always sent - the backend requires it.
 */
export const BH_PAYLOAD_FIELDS = Object.freeze({
  current_period: 'current_period',
  fromDate: 'fromDate',
  toDate: 'toDate',
  comparative: 'comparative',
  comparativeFromDate: 'comparativeFromDate',
  comparativeToDate: 'comparativeToDate',
  productNames: 'productName',
  buyerNames: 'buyerName',
})

/**
 * WHAT EVERY REPORT SENDS - POST mis_reports/reports/ (Services/
 * businessHealthService). Each report screen (Reports/*.jsx) and each
 * Dashboard card names its entry by `request: '<id>'`; nothing else decides
 * what goes into a request, so a change made here reaches the tab, its
 * filters, its validation and the Dashboard together.
 *
 *   reportType    sent as reportType: [reportType]
 *   responseType  sent when set - the report's detail variant
 *   comparative   'optional' (the default) - the Comparatives box, sent
 *                 when chosen (with its two dates when Custom)
 *                 'required' - the same, and Generate needs one
 *                 'none' - no Comparatives box, never sent
 *   products      'none' (the default) | 'optional' | 'required' - the
 *                 Product Name box, sent as productName: [names]
 *   buyers        'none' (the default) | 'required' - the Buyer Name box,
 *                 sent as buyerName: [ledger names]
 *   params        fixed fields sent as they are, e.g. { topN: 5 }
 *
 * The period (current_period, and fromDate / toDate when Custom) and
 * company_id are sent for every report. The Dashboard sends only the period
 * (BH_DASHBOARD_PERIOD), responseType and params - never a comparative,
 * products or buyers, as in the old Dashboard.
 *
 * EXAMPLES
 *   send the top 10 customers:      revenue_concentration: { ..., params: { topN: 10 } }
 *   let products be optional:       average_selling_price: { ..., products: 'optional' }
 *   ask for a report's detail:      receivable_days: { reportType: 'receivable_days', responseType: 'receivable_buyer' }
 */
export const BH_REPORT_REQUESTS = Object.freeze({
  // Cash & Finance
  cash_flow_adequacy: { reportType: 'cash_flow_adequacy' },

  // Sale & Margins
  average_invoice_value: { reportType: 'average_invoice_value' },
  average_selling_price: { reportType: 'average_selling_price', products: 'required' },
  discount_dependency: { reportType: 'discount_dependency' },
  gross_net_profit: { reportType: 'profit_report', responseType: 'gross_net_profit' },
  profit_change: { reportType: 'period_profit', responseType: 'profit_change', comparative: 'required' },
  period_profitsales: { reportType: 'period_profit', responseType: 'period_profitsales' },
  sales_growth_momentum: { reportType: 'sales_growth_momentum', comparative: 'required' },
  sales_return_ratio: { reportType: 'sales_return_ratio' },

  // Customer & Receivables
  buyer_paymentdays: { reportType: 'buyer_stats', responseType: 'buyer_paymentdays', buyers: 'required' },
  buyer_profitpct: { reportType: 'buyer_stats', responseType: 'buyer_profitpct', buyers: 'required' },
  buyer_profitsales: { reportType: 'buyer_stats', responseType: 'buyer_profitsales', buyers: 'required' },
  credit_sales_ratio: { reportType: 'credit_sales_ratio' },
  customer_repeat_ratio: { reportType: 'customer_repeat_ratio' },
  receivable_days: { reportType: 'receivable_days' },
  revenue_concentration: { reportType: 'revenue_concentration', comparative: 'none' },
  customer_dependency_ratio: { reportType: 'customer_dependency_ratio', buyers: 'required' },

  // Purchase & Suppliers
  input_cost_ratio: { reportType: 'input_cost_ratio' },
  payable_days: { reportType: 'payable_days' },
  price_volatility: { reportType: 'price_volatility' },
  purchase_price_inflation: { reportType: 'purchase_price_inflation', responseType: 'inflation_product', products: 'optional' },
  vendor_lead_time: { reportType: 'vendor_lead_time', responseType: 'vendor_lead_supplier', comparative: 'none' },
  supplier_dependency_ratio: { reportType: 'supplier_dependency_ratio', buyers: 'required' },

  // Inventory & Working Capital
  cash_conversion_cycle: { reportType: 'cash_conversion_cycle', comparative: 'none' },
  dead_stock_ratio: { reportType: 'dead_stock_ratio' },
  inventory_holding_days: {
    reportType: 'inventory_holding_days',
    responseType: 'holding_inventory',
    products: 'required',
    comparative: 'none',
  },
  inventory_turnover: { reportType: 'inventory_turnover' },
  product_stats: { reportType: 'product_stats', responseType: 'profit_minmax', products: 'required' },
  gross_margin: { reportType: 'gross_margin', responseType: 'product_type', products: 'required' },
  revenue_per_bank_credit: { reportType: 'revenue_per_bank_credit' },
  stock_to_sales_ratio: { reportType: 'stock_to_sales_ratio' },
  working_capital_stress: { reportType: 'working_capital_stress', responseType: 'working_capital_detail' },
})

/** The period every Dashboard card is asked for, as in the old Dashboard. */
export const BH_DASHBOARD_PERIOD = 'monthly'

/* ------------------------------------------------------------------ */
/* Industry benchmarks                                                */
/* ------------------------------------------------------------------ */

export const BH_DEFAULT_INDUSTRY = 'Other'

/**
 * The healthy range of an indicator: `display` is what the card's "Range:"
 * says; `min` / `max` are what the health dot compares with (see isHealthy in
 * BusinessHealth/businessHealth.js). The same for every industry ...
 */
const COMMON_BENCHMARKS = {
  revenue_concentration_ratio_cash: { display: 'Top 5 Customer <30%', max: 30 },
  customer_dependency_ratio: { display: 'Top 1 Customer <20%', max: 20 },
  customer_repeat_ratio: { display: '40-60%', min: 40, max: 60 },
  discount_dependency_ratio: { display: '<8%', max: 8 },
  credit_sales_ratio: { display: '<70%', max: 70 },
  sales_return_ratio: { display: '<3%', max: 3 },
  supplier_concentration_ratio: { display: 'Top 1 Supplier <35%', max: 35 },
  purchase_price_inflation_ratio: { display: '<8%', max: 8 },
  stock_to_sales_ratio: { display: '10-25%', min: 10, max: 25 },
  working_capital_stress_indicator: { display: '<30 Days', max: 30 },
}

/** ... and these per industry - the names are Master Details' INDUSTRY_TYPES. */
const industry = (receivable, payable, holding, ccc, turnover, deadStock, adequacy) => ({
  receivable_days: { display: `${receivable[0]}-${receivable[1]} Days`, min: receivable[0], max: receivable[1] },
  payable_days: { display: `${payable[0]}-${payable[1]} Days`, min: payable[0], max: payable[1] },
  inventory_holding_days: { display: `${holding[0]}-${holding[1]} Days`, min: holding[0], max: holding[1] },
  cash_conversion_cycle: { display: `${ccc[0]}-${ccc[1]} Days`, min: ccc[0], max: ccc[1] },
  inventory_turnover_per_year: { display: `${turnover[0]}-${turnover[1]} Times`, min: turnover[0], max: turnover[1] },
  dead_stock_percent: { display: `<${deadStock}%`, max: deadStock },
  cash_flow_adequacy_ratio: { display: `>${adequacy.toFixed(2)}`, min: adequacy },
  ...COMMON_BENCHMARKS,
})

export const BH_BENCHMARKS = Object.freeze({
  //          receivable   payable    holding     CCC         turnover  dead  adequacy
  Automobile: industry([45, 75], [45, 75], [35, 60], [20, 60], [6, 10], 5, 1.05),
  Chemical: industry([45, 90], [30, 75], [45, 90], [30, 90], [4, 8], 8, 1.05),
  Electrical: industry([45, 75], [30, 60], [40, 75], [25, 70], [5, 9], 6, 1.05),
  Engineering: industry([60, 120], [45, 90], [50, 100], [40, 110], [3, 7], 8, 1.05),
  Food: industry([20, 45], [20, 45], [15, 40], [5, 35], [9, 18], 3, 1.1),
  Metal: industry([30, 75], [30, 75], [30, 60], [10, 60], [6, 12], 5, 1.03),
  Other: industry([45, 75], [30, 60], [30, 75], [20, 70], [4, 10], 7, 1.05),
  Packaging: industry([45, 75], [30, 60], [25, 55], [15, 55], [6, 12], 5, 1.05),
  Pharma: industry([45, 90], [30, 60], [60, 120], [45, 120], [3, 6], 8, 1.08),
  Plastics: industry([45, 75], [30, 60], [30, 70], [20, 70], [5, 10], 6, 1.05),
  Textile: industry([45, 120], [30, 75], [45, 120], [30, 120], [3, 8], 10, 1.03),
})

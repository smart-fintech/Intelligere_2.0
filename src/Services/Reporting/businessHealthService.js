/**
 * BUSINESS HEALTH INDICATORS - every URL of the module (old project: MIS/).
 *
 *   POST  mis_reports/reports/     { company_id, current_period, comparative?,
 *                                    fromDate?, toDate?, comparativeFromDate?,
 *                                    comparativeToDate?, reportType: [key],
 *                                    responseType?, buyerName?, productName? }
 *           -> { "<reportType>": {...}, period: "October-2026",
 *                comparative_period: "September-2026" | "" }
 *   GET   mis_reports/dashboard/   ?company_id=
 *           -> { reports: [...] }    the reports this user pinned for the company
 *   POST  mis_reports/dashboard/   { company_id, reports: [...] }
 *           -> { reports: [...] }    saved, for this user and company
 *
 * The body of a report is built by buildReportPayload (BusinessHealth/
 * businessHealth.js). A pinned report is kept in the object form the old
 * project saved - { reportType, responseType, current_period, range,
 * responseKey, responseSecondryKey? } - so dashboards saved there still load.
 *
 * Every failure is a 400 { msg }, which the shared setup (Services/Global/apiService)
 * hands back as an Error carrying that text, for the screen to show.
 * The Dashboard's Fetch Data goes to Tally instead - see the end of this file.
 */

import { api } from '@/Services/Global/apiService'

const REPORTS_URL = 'mis_reports/reports/'
const DASHBOARD_URL = 'mis_reports/dashboard/'

/** One report - the body from buildReportPayload. */
export const getMisReport = (payload) => api.post(REPORTS_URL, payload)

/** The reports this user pinned on the company's dashboard. */
export const getDashboardReports = (companyId) => api.get(DASHBOARD_URL, { params: { company_id: companyId } })

/** Saves the pinned reports - the whole list, replacing what was there. */
export const saveDashboardReports = (companyId, reports) =>
  api.post(DASHBOARD_URL, { company_id: companyId, reports })

/* ------------------------------------------------------------------ */
/* The Dashboard's Fetch Data (Tally)                                 */
/* ------------------------------------------------------------------ */

/**
 * Fetch Data brings the figures the reports read over from Tally, on the
 * app's one WebSocket. Sales and Purchase use tally_invoice_fetch
 * (Services/Invoice/salesInvoiceService) and Receivable / Payable receivable_payable
 * (Services/Accounting/payableReceivableService); the bank vouchers are this one - the
 * old project's get_bank_transactions, under the same name:
 *
 *   { "payload": { "module_name": "get_bank_transactions",
 *                  "company_name": "<active company>",
 *                  "data": { "year": "2026", "start_month": "4", "end_month": "3" } } }
 *
 * answered as return_module_name "get_bank_transactions", ending on
 * action_status "stop_loader". An end month before the start month runs into
 * the next year (4 -> 3 = April 2026 to March 2027), as the Tally agent reads it.
 */
export const TALLY_BANK_TRANSACTIONS_MODULE = 'get_bank_transactions'

export const buildBankTransactionsMessage = (companyName, { year, startMonth, endMonth }) => ({
  payload: {
    module_name: TALLY_BANK_TRANSACTIONS_MODULE,
    company_name: companyName,
    data: { year: String(year), start_month: String(Number(startMonth)), end_month: String(Number(endMonth)) },
  },
})

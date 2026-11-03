/**
 * Business Health Indicators - turning the screen's choices into a request,
 * and the answer back into what a card shows. No React and no requests here.
 *
 *   requestOf            a report's entry in BH_REPORT_REQUESTS
 *   buildReportPayload   the body of POST mis_reports/reports/ (old buildMISPayload)
 *   readReport           one report out of the answer, with its two periods
 *   validateReport       what stops a Generate, as the old project worded it
 *   benchmarkFor         an indicator's range for the company's industry
 *   isHealthy            the health dot's rule
 *   isWithinRange        the Dashboard card's own dot rule
 */

import {
  BH_BENCHMARKS,
  BH_DEFAULT_INDUSTRY,
  BH_PAYLOAD_FIELDS as FIELD,
  BH_REPORT_REQUESTS,
} from '@/Constants/businessHealth'

/**
 * What a report sends (its `request` id in BH_REPORT_REQUESTS), with the
 * defaults filled in: comparative 'optional', products and buyers 'none'.
 */
export const requestOf = (report) => ({
  comparative: 'optional',
  products: 'none',
  buyers: 'none',
  ...BH_REPORT_REQUESTS[report.request],
})

/**
 * The body for one report - everything it sends is decided by its entry in
 * BH_REPORT_REQUESTS and the field names in BH_PAYLOAD_FIELDS.
 *
 *   companyId   the active company's company_id
 *   report      { request: '<id>' } - a report screen or Dashboard card
 *   filters     { current_period, comparative, fromDate, toDate,
 *                 comparativeFromDate, comparativeToDate,
 *                 productNames: [name], buyerNames: [name] }
 *
 * The dates go only with their "custom" choice; a comparative, products and
 * buyers only when the report takes them and some are chosen - exactly as the
 * old project sent them. Dates are YYYY-MM-DD.
 */
export const buildReportPayload = (companyId, report, filters) => {
  const request = requestOf(report)
  const comparative = request.comparative === 'none' ? '' : filters.comparative
  const payload = {
    company_id: companyId,
    reportType: [request.reportType],
    [FIELD.current_period]: filters.current_period,
  }

  if (request.responseType) payload.responseType = request.responseType
  if (comparative) payload[FIELD.comparative] = comparative

  if (filters.current_period === 'custom') {
    payload[FIELD.fromDate] = filters.fromDate
    payload[FIELD.toDate] = filters.toDate
  }
  if (comparative === 'custom') {
    payload[FIELD.comparativeFromDate] = filters.comparativeFromDate
    payload[FIELD.comparativeToDate] = filters.comparativeToDate
  }

  if (request.products !== 'none' && filters.productNames?.length) payload[FIELD.productNames] = filters.productNames
  if (request.buyers !== 'none' && filters.buyerNames?.length) payload[FIELD.buyerNames] = filters.buyerNames

  return { ...payload, ...request.params }
}

/**
 * One report of an answer: { data, period, comparativePeriod }.
 *
 * `comparativePeriod` is "" when no comparative was asked for - which is what
 * decides between a report's plain card and its comparison table. `data` is
 * the report's own object; all-zero values are a real answer (nothing in the
 * period), not a failure.
 */
export const readReport = (response, reportType) => ({
  data: response?.[reportType] ?? null,
  period: response?.period ?? '',
  comparativePeriod: response?.comparative_period ?? '',
})

/**
 * Why the chosen report cannot be asked for yet, or null when it can - the
 * old validateMISForm, in its order and with its messages. What a report
 * needs comes from its request: comparative / products / buyers 'required'.
 * Dates are YYYY-MM-DD, so comparing them as text compares the days.
 */
export const validateReport = (report, filters) => {
  if (!report) return 'Please select report type'
  const request = requestOf(report)
  if (request.comparative === 'required' && !filters.comparative) return 'Please select a comparative period.'

  if (filters.current_period === 'custom') {
    if (!filters.fromDate || !filters.toDate) return 'Please select date range'
    if (filters.fromDate > filters.toDate) return 'From date cannot be greater than To date'
  }
  if (filters.comparative === 'custom') {
    if (!filters.comparativeFromDate || !filters.comparativeToDate) return 'Please select comparative date range'
    if (filters.comparativeFromDate > filters.comparativeToDate) {
      return 'Comparative From date cannot be greater than Comparative To date'
    }
  }

  if (request.products === 'required' && !filters.productNames.length) return 'Please select at least one product'
  if (request.buyers === 'required' && !filters.buyerNames.length) return 'Please select at least one Buyer'
  return null
}

/**
 * The range of one indicator for an industry (Master Details' industry_type),
 * or undefined. No industry saved means "Other", as in the old project.
 */
export const benchmarkFor = (industryType, key) =>
  key ? BH_BENCHMARKS[industryType || BH_DEFAULT_INDUSTRY]?.[key] : undefined

/**
 * The old HealthIndicator's rule, unchanged: where lower is better the value
 * must be at most `max`, otherwise at least `min`. A missing range is never
 * healthy.
 */
export const isHealthy = (value, benchmark, lowerIsBetter = false) =>
  lowerIsBetter ? value <= benchmark?.max : value >= benchmark?.min

/**
 * The old Dashboard card's rule, which is its own: a range with both ends
 * must hold the value; one marked `lower` must be at most `max`; otherwise
 * the value must be at least `min`. Null when there is nothing to judge (no
 * number, or no range) - then the card shows no dot.
 */
export const isWithinRange = (value, range) => {
  if (typeof value !== 'number' || !range) return null
  if (range.min !== undefined && range.max !== undefined) return value >= range.min && value <= range.max
  if (range.lower === true) return value <= range.max
  if (range.min !== undefined) return value >= range.min
  return false
}

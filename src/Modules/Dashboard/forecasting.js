/**
 * AI FORECASTING - everything read from, and sent to, inventory/forecastRules/
 * and inventory/forecast/ (see inventoryService), with no React in it:
 *
 *   readForecastRules(reply)     whether the module can be used, and each
 *                                voucher group's rules - as many as come
 *   voucherTypesOf(rules)        the voucher types, each with its rules and
 *                                whether all of them are met
 *   yearOptions(now)             the From / To Year choices, around this year
 *   newForecastForm(...) / checkForecastForm(form, ...)   the form, and what is wrong with it
 *   buildForecastBody(form, ...) the form as inventory/forecast/ takes it
 *   readForecasts(reply)         one result per product - its forecast, or why there is none
 *
 * Nothing is assumed about the rules: their names are shown as they come,
 * and a group or a rule the backend adds later is shown too.
 */

import { FORECAST_METRICS, FORECAST_VOUCHER_TYPES, FORECAST_YEARS_AHEAD, FORECAST_YEARS_BACK, MONTH_NAMES } from '@/Constants/inventory'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

const listOf = (value) => (Array.isArray(value) ? value : [])

/** A number the backend sent, or null when it sent none. */
const numberOrNull = (value) => {
  if (value === null || value === undefined || text(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const SHOW_MODULE = 'show_module'

/** "sales" -> "Sales", "purchase_return" -> "Purchase Return". */
const groupLabel = (key) =>
  text(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

/**
 * A group's rules - [{ "<rule>": true }, ...] as they come today, or one
 * { "<rule>": true, ... } - as [{ label, met }].
 */
const readRules = (value) => {
  const entries = Array.isArray(value) ? value.filter(isObject).flatMap((rule) => Object.entries(rule)) : isObject(value) ? Object.entries(value) : []
  return entries.map(([label, met]) => ({ label: text(label), met: met === true }))
}

/**
 * { showModule, groups: [{ key, label, rules: [{ label, met }], eligible }] } -
 * every key but show_module is a group. `eligible` is all its rules met.
 */
export const readForecastRules = (reply) => {
  const value = isObject(reply) ? reply : {}
  const groups = Object.entries(value)
    .filter(([key, rules]) => key !== SHOW_MODULE && (Array.isArray(rules) || isObject(rules)))
    .map(([key, rules]) => {
      const read = readRules(rules)
      return { key, label: groupLabel(key), rules: read, eligible: read.every((rule) => rule.met) }
    })
  return { showModule: value[SHOW_MODULE] === true, groups }
}

/**
 * The voucher types (FORECAST_VOUCHER_TYPES), each with its group of rules:
 * { value, label, group, eligible }. One the rules say nothing about is not
 * held back - only the backend's own "not met" holds one back.
 */
export const voucherTypesOf = (rules) =>
  FORECAST_VOUCHER_TYPES.map((type) => {
    const group = rules.groups.find((entry) => entry.key.toLowerCase() === type.rules) ?? null
    return { ...type, group, eligible: group ? group.eligible : true }
  })

/** The years offered - FORECAST_YEARS_BACK before this one to FORECAST_YEARS_AHEAD after. */
export const yearOptions = (now = new Date()) => {
  const year = now.getFullYear()
  return Array.from({ length: FORECAST_YEARS_BACK + FORECAST_YEARS_AHEAD + 1 }, (_, index) => String(year - FORECAST_YEARS_BACK + index))
}

export const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: name }))

export const monthName = (month) => MONTH_NAMES[Number(month) - 1] ?? ''

/** A forecast value as it is shown - up to two decimals, Indian grouping; '--' for none. */
export const formatForecastValue = (value) => (value === null || value === undefined ? '--' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }))

/** Empty but for this year and the first voucher type the rules allow. */
export const newForecastForm = (voucherTypes, now = new Date()) => ({
  voucherType: (voucherTypes.find((type) => type.eligible) ?? voucherTypes[0])?.value ?? '',
  fromYear: String(now.getFullYear()),
  fromMonth: '',
  toYear: String(now.getFullYear()),
  toMonth: '',
  metric: FORECAST_METRICS[0],
  productList: [],
})

/** A month as one number, so two can be compared: 2026 * 12 + 3. */
const monthIndex = (year, month) => Number(year) * 12 + Number(month)

/**
 * Everything wrong with the form, by field - {} when it can be sent. A
 * voucher type whose rules are not all met cannot be sent; the rules it
 * misses are named.
 */
export const checkForecastForm = (form, voucherTypes) => {
  const found = {}
  const type = voucherTypes.find((entry) => entry.value === form.voucherType)
  if (!type) found.voucherType = 'Select the voucher type'
  else if (!type.eligible) {
    const missing = type.group.rules.filter((rule) => !rule.met).map((rule) => rule.label)
    found.voucherType = `${type.label} data does not meet: ${missing.join('; ')}`
  }
  if (!form.fromYear) found.fromYear = 'Select the From Year'
  if (!form.fromMonth) found.fromMonth = 'Select the From Month'
  if (!form.toYear) found.toYear = 'Select the To Year'
  if (!form.toMonth) found.toMonth = 'Select the To Month'
  if (form.fromYear && form.fromMonth && form.toYear && form.toMonth && monthIndex(form.toYear, form.toMonth) < monthIndex(form.fromYear, form.fromMonth)) {
    found.toMonth = 'The To month cannot be earlier than the From month'
  }
  if (!form.metric) found.metric = 'Select the metric'
  if (form.productList.length === 0) found.productList = 'Select at least one product'
  return found
}

/** The form as inventory/forecast/ takes it - years and months as numbers, products by name. */
export const buildForecastBody = (form, { companyName }) => ({
  company_name: companyName,
  voucherType: form.voucherType,
  fromYear: Number(form.fromYear),
  fromMonth: Number(form.fromMonth),
  toYear: Number(form.toYear),
  toMonth: Number(form.toMonth),
  metric: form.metric,
  productList: [...form.productList],
})

/** "200" (or 200) is a forecast made; anything else is the reason there is none. */
const SUCCESS = '200'

/**
 * One result per product: { key, item, unit, metric, ok, msg, availableMonths,
 * minimumRequired, monthsUsed, forecast: [{ key, year, month, label, prediction }] }.
 * `ok` needs both the status and a forecast to show - one without either is
 * shown with its message, never as an empty chart.
 */
export const readForecasts = (reply) =>
  listOf(Array.isArray(reply) ? reply : reply?.data)
    .filter(isObject)
    .map((result, index) => {
      const forecast = listOf(result.forecast)
        .filter(isObject)
        .map((point, place) => ({
          key: `${text(point.year)}-${text(point.month)}#${place}`,
          year: text(point.year),
          month: text(point.month),
          label: `${monthName(point.month).slice(0, 3) || text(point.month)} ${text(point.year)}`.trim(),
          prediction: numberOrNull(point.prediction),
        }))
        .filter((point) => point.prediction !== null)
      const succeeded = text(result.status) === SUCCESS
      return {
        key: `${text(result.item) || 'product'}#${index}`,
        item: text(result.item),
        unit: text(result.unit),
        metric: text(result.metric ?? result.Metrix),
        status: text(result.status),
        ok: succeeded && forecast.length > 0,
        msg: text(result.msg),
        availableMonths: numberOrNull(result.available_months),
        minimumRequired: numberOrNull(result.minimum_required),
        monthsUsed: numberOrNull(result.historical_months_used),
        forecast,
      }
    })

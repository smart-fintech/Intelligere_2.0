/**
 * AI Forecasting - the rules a company may forecast with, and a forecast.
 */

import { api } from '@/Services/Global/apiService'

/*
 *   POST  inventory/forecastRules/  { company_name, source: "prediction" }
 *         -> { show_module, sales: [{ "<rule>": true | false }], purchase: [...] }
 *   POST  inventory/forecast/       { company_name, voucherType, fromYear, fromMonth, toYear,
 *                                     toMonth, metric, productList: ["<product name>", ...] }
 *         -> [{ item, unit, metric, forecast: [{ year, month, prediction }], status ("200" | "400"),
 *              msg, available_months, minimum_required, historical_months_used }]
 *
 * (see forecasting). Neither changes anything, so neither marks anything stale.
 */
const FORECAST_RULES_URL = 'inventory/forecastRules/'
const FORECAST_URL = 'inventory/forecast/'
const FORECAST_SOURCE = 'prediction'

export const getForecastRules = ({ companyName }) => api.post(FORECAST_RULES_URL, { company_name: companyName, source: FORECAST_SOURCE })

export const generateForecast = (body) => api.post(FORECAST_URL, body)

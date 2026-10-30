/**
 * The AI Forecasting section of Inventory Details: how much of chosen
 * products is likely to be sold - or bought - month by month.
 *
 *   Data Readiness    the backend's rules for each voucher group (sales,
 *                     purchase, and any it adds), each met or not - shown
 *                     as they come, never written here
 *   Forecast Settings Voucher Type, From Month / Year, To Month / Year,
 *                     Metric, Products (several) - Generate Forecast
 *   Forecast Results  one card per product: its unit, metric, status, the
 *                     months of history it had, needed and used, and the
 *                     backend's message - with the forecast as a chart and a
 *                     table, or, when there is none, why
 *
 * When the rules say the module cannot be used yet (`show_module` false),
 * only Data Readiness is shown, saying what is missing.
 *
 * WHO CAN USE IT: a company whose `active_modules` lists Forecasting (see
 * InventoryDetails, which shows the section disabled otherwise). Checked here
 * again, so nothing is asked for a company without it.
 *
 * WHAT REACHES THE NETWORK
 *   the section first opened for a company   inventory/forecastRules/ - once a
 *                                            session (useForecastRules); never
 *                                            while the section is not showing
 *   the form first shown                     the product list (useProducts - shared)
 *   Generate Forecast                        inventory/forecast/ - once, however
 *                                            often it is pressed
 */

import { useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Lock, Sparkles, TrendingUp, XCircle } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { FORECASTING_UNAVAILABLE_MESSAGE, FORECAST_METRICS, toOptions } from '@/Constants/inventory'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useForecastRules from '@/Hooks/useForecastRules'
import useProducts from '@/Hooks/useProducts'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  MONTH_OPTIONS,
  buildForecastBody,
  checkForecastForm,
  formatForecastValue,
  monthName,
  newForecastForm,
  readForecasts,
  voucherTypesOf,
  yearOptions,
} from '@/Modules/Dashboard/forecasting'
import { readProducts } from '@/Modules/Dashboard/productList'
import { listsModule } from '@/Services/accessService'
import { generateForecast } from '@/Services/inventoryService'
import ForecastChart from './ForecastChart'

const FORECASTING_MODULE = 'Forecasting'

/* ---------------- Data Readiness ---------------- */

function RuleGroup({ group, highlighted }) {
  return (
    <div className={cn('rounded-md border p-3 transition-colors duration-200', highlighted ? 'border-brand/40 bg-brand-soft/40 dark:bg-brand/10' : 'border-border bg-card')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand">{group.label}</p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            group.eligible ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
          )}
        >
          {group.eligible ? 'Ready' : 'Not enough data'}
        </span>
      </div>
      {group.rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">No rules came for this group.</p>
      ) : (
        <ul className="space-y-1.5">
          {group.rules.map((rule) => (
            <li key={rule.label} className="flex items-start gap-2 text-xs">
              {rule.met ? (
                <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Met" />
              ) : (
                <XCircle className="mt-px size-3.5 shrink-0 text-destructive" aria-label="Not met" />
              )}
              <span className={cn(rule.met ? 'text-foreground' : 'text-muted-foreground')}>{rule.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DataReadiness({ rules, selectedGroup }) {
  if (rules.groups.length === 0) return <p className="text-xs text-muted-foreground">The backend sent no rules to check.</p>
  return (
    <div className="space-y-2">
      {rules.groups.map((group) => (
        <RuleGroup key={group.key} group={group} highlighted={group.key === selectedGroup} />
      ))}
    </div>
  )
}

/* ---------------- Forecast Results ---------------- */

const STAT = 'rounded-md border border-border bg-card px-2.5 py-1.5'

function Stat({ label, value }) {
  return (
    <div className={STAT}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value ?? '--'}</p>
    </div>
  )
}

function ForecastCard({ result, index }) {
  const valueUnit = result.metric.toLowerCase() === 'quantity' ? result.unit : ''
  return (
    <article
      className="animate-in space-y-3 rounded-lg border border-border bg-card p-3 shadow-xs duration-300 fade-in-0 slide-in-from-bottom-1"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: 'backwards' }}
      data-testid="forecast-result"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold [overflow-wrap:anywhere] text-brand">{result.item || 'Unnamed product'}</h3>
          <p className="text-xs text-muted-foreground">
            {result.metric || '--'} · {result.unit || '--'}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            result.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
          )}
        >
          {result.ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {result.ok ? 'Forecast ready' : 'No forecast'}
          {result.status ? <span className="opacity-70">({result.status})</span> : null}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Available Months" value={result.availableMonths} />
        <Stat label="Minimum Required" value={result.minimumRequired} />
        <Stat label="Months Used" value={result.monthsUsed} />
      </div>

      {result.msg ? (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-xs',
            result.ok ? 'border-border bg-muted/40 text-muted-foreground' : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
          )}
        >
          {result.msg}
        </p>
      ) : null}

      {result.ok ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ForecastChart points={result.forecast} unit={valueUnit} label={`Forecast of ${result.item}`} />
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2 text-left">Month</th>
                  <th className="px-2 py-2 text-left">Year</th>
                  <th className="px-2 py-2 text-right">Prediction</th>
                </tr>
              </thead>
              <tbody>
                {result.forecast.map((point) => (
                  <tr key={point.key} className="border-t border-border">
                    <td className="px-2 py-1.5">{monthName(point.month) || point.month || '--'}</td>
                    <td className="px-2 py-1.5 tabular-nums">{point.year || '--'}</td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {formatForecastValue(point.prediction)}
                      {valueUnit ? <span className="ml-1 text-xs text-muted-foreground">{valueUnit}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </article>
  )
}

/* ---------------- The form - shown once the rules allow it ---------------- */

function ForecastWorkspace({ companyName, rules }) {
  const productRows = useProducts()
  const productOptions = useMemo(() => {
    const names = readProducts(productRows.rows).map((product) => product.name).filter(Boolean)
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }, [productRows.rows])

  const voucherTypes = useMemo(() => voucherTypesOf(rules), [rules])
  const years = useMemo(() => yearOptions(), [])
  const [form, setForm] = useState(() => newForecastForm(voucherTypes))
  const [errors, setErrors] = useState({})
  // { status: 'idle' | 'loading' | 'ready' | 'failed', items, error }
  const [results, setResults] = useState({ status: 'idle', items: [], error: '' })
  const inFlight = useRef(false)

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    // A change to either end of the range may settle the other's message too.
    setErrors((current) => ({ ...current, [field]: undefined, ...(field.startsWith('from') || field.startsWith('to') ? { toMonth: undefined } : null) }))
  }

  const selectedType = voucherTypes.find((type) => type.value === form.voucherType)
  const fromIndex = form.fromYear && form.fromMonth ? Number(form.fromYear) * 12 + Number(form.fromMonth) : null

  const handleGenerate = async () => {
    if (inFlight.current) return
    const found = checkForecastForm(form, voucherTypes)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0])
      return
    }

    inFlight.current = true
    setResults((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const reply = await generateForecast(buildForecastBody(form, { companyName }))
      const items = readForecasts(reply)
      setResults({ status: 'ready', items, error: '' })
      const made = items.filter((item) => item.ok).length
      if (items.length === 0) toast.info('The forecast came back empty.')
      else if (made === items.length) toast.success(made === 1 ? 'Forecast generated successfully' : `Forecasts generated for all ${made} products`)
      else toast.info(`Forecast generated for ${made} of ${items.length} products`)
    } catch (failure) {
      // The backend's own message (see authService); the form stays as it was.
      setResults((current) => ({ ...current, status: 'failed', error: failure.message || 'The forecast could not be generated.' }))
      toast.error(failure.message || 'The forecast could not be generated.')
    } finally {
      inFlight.current = false
    }
  }

  const loading = results.status === 'loading'
  const made = results.items.filter((item) => item.ok).length

  return (
    <>
      <Panel title="Forecast Settings">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                id="forecast-voucher-type"
                label="Voucher Type"
                required
                className="sm:col-span-2"
                value={form.voucherType}
                onValueChange={(value) => set('voucherType', value)}
                placeholder="Select Voucher Type"
                options={voucherTypes.map((type) => ({ value: type.value, label: type.eligible ? type.label : `${type.label} (not enough data)` }))}
                error={errors.voucherType}
              />
              <SelectField
                id="forecast-metric"
                label="Metric"
                required
                className="sm:col-span-2"
                value={form.metric}
                onValueChange={(value) => set('metric', value)}
                options={toOptions(FORECAST_METRICS)}
                error={errors.metric}
              />
              <SelectField
                id="forecast-from-month"
                label="From Month"
                required
                value={form.fromMonth}
                onValueChange={(value) => set('fromMonth', value)}
                placeholder="Month"
                options={MONTH_OPTIONS}
                error={errors.fromMonth}
              />
              <SelectField
                id="forecast-from-year"
                label="From Year"
                required
                value={form.fromYear}
                onValueChange={(value) => set('fromYear', value)}
                placeholder="Year"
                options={toOptions(years)}
                error={errors.fromYear}
              />
              <SelectField
                id="forecast-to-month"
                label="To Month"
                required
                value={form.toMonth}
                onValueChange={(value) => set('toMonth', value)}
                placeholder="Month"
                // A month before From is offered greyed out, never taken.
                options={MONTH_OPTIONS.map((option) => ({ ...option, disabled: fromIndex !== null && form.toYear && Number(form.toYear) * 12 + Number(option.value) < fromIndex }))}
                error={errors.toMonth}
              />
              <SelectField
                id="forecast-to-year"
                label="To Year"
                required
                value={form.toYear}
                onValueChange={(value) => set('toYear', value)}
                placeholder="Year"
                options={years.map((year) => ({ value: year, label: year, disabled: Boolean(form.fromYear) && Number(year) < Number(form.fromYear) }))}
                error={errors.toYear}
              />
              <MultiSelectField
                id="forecast-products"
                label="Products"
                required
                className="sm:col-span-2 lg:col-span-4"
                options={productOptions}
                value={form.productList}
                onChange={(next) => set('productList', next)}
                disabled={productOptions.length === 0}
                placeholder={
                  productRows.status === 'loading' && productOptions.length === 0
                    ? 'Loading the products...'
                    : productRows.status === 'failed' && productOptions.length === 0
                      ? 'The products could not be loaded'
                      : productOptions.length === 0
                        ? 'No products yet'
                        : 'Select products'
                }
                searchPlaceholder="Search products"
                error={errors.productList}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {form.productList.length > 0 ? (
                <span className="mr-auto text-xs text-muted-foreground">
                  {form.productList.length} product{form.productList.length === 1 ? '' : 's'} selected
                </span>
              ) : null}
              <Button type="button" icon={Sparkles} loading={loading} disabled={loading} onClick={handleGenerate}>
                {loading ? 'Generating...' : 'Generate Forecast'}
              </Button>
            </div>
          </div>

          <aside className="space-y-2 lg:border-l lg:border-border lg:pl-4" aria-label="Data readiness">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Data Readiness</p>
            <DataReadiness rules={rules} selectedGroup={selectedType?.group?.key} />
          </aside>
        </div>
      </Panel>

      <Panel title="Forecast Results" meta={results.status === 'ready' && results.items.length > 0 ? `(${made} of ${results.items.length} forecast)` : undefined}>
        {results.status === 'idle' ? (
          <StateMessage icon={TrendingUp} title="No forecast yet">
            Choose the products and months above, then Generate Forecast.
          </StateMessage>
        ) : loading && results.items.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : results.status === 'failed' ? (
          <StateMessage icon={AlertCircle} tone="error" title="Could not generate the forecast" action={<RetryButton onClick={handleGenerate} />}>
            {results.error}
          </StateMessage>
        ) : results.items.length === 0 ? (
          <StateMessage icon={TrendingUp} title="Nothing came back">
            The forecast had no products in it.
          </StateMessage>
        ) : (
          <div className={cn('grid grid-cols-1 gap-3 transition-opacity xl:grid-cols-2', loading && 'opacity-60')}>
            {results.items.map((result, index) => (
              <ForecastCard key={result.key} result={result} index={index} />
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}

/* ---------------- The section ---------------- */

export default function AIForecasting({ active = true }) {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const allowed = listsModule(activeCompany?.active_modules, [FORECASTING_MODULE])
  // Asked only while the section is showing, and only for a company that has it.
  const rules = useForecastRules(active && allowed)

  if (!companyName) {
    return (
      <Panel title="AI Forecasting">
        <StateMessage icon={TrendingUp} title="No company selected">
          Choose a company in the header to forecast its products.
        </StateMessage>
      </Panel>
    )
  }
  if (!allowed) {
    return (
      <Panel title="AI Forecasting">
        <StateMessage icon={Lock} title="AI Forecasting is not available">
          {FORECASTING_UNAVAILABLE_MESSAGE}
        </StateMessage>
      </Panel>
    )
  }
  if (rules.status === 'failed' && !rules.rules) {
    return (
      <Panel title="AI Forecasting">
        <StateMessage icon={AlertCircle} tone="error" title="Could not check the forecasting rules" action={<RetryButton onClick={rules.reload} />}>
          {rules.error}
        </StateMessage>
      </Panel>
    )
  }
  if (!rules.rules) {
    return (
      <Panel title="AI Forecasting">
        <ListSkeleton rows={4} />
      </Panel>
    )
  }
  if (!rules.rules.showModule) {
    return (
      <Panel title="AI Forecasting">
        <div className="mx-auto max-w-2xl animate-in space-y-3 duration-300 fade-in-0">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            AI Forecasting will work once the data below is available.
          </div>
          <DataReadiness rules={rules.rules} />
        </div>
      </Panel>
    )
  }

  // `key`: another company starts the form, and its results, afresh.
  return (
    <div className="animate-in space-y-3 duration-300 fade-in-0">
      <ForecastWorkspace key={companyName} companyName={companyName} rules={rules.rules} />
    </div>
  )
}

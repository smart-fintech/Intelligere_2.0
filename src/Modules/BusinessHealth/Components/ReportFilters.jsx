import { useMemo } from 'react'
import { Info } from 'lucide-react'

import { Field, SelectField } from '@/Components/Common/FormFields'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Button } from '@/Components/ui/button'
import { Tooltip } from '@/Components/ui/tooltip'
import { BH_COMPARATIVE_OPTIONS, BH_PERIOD_OPTIONS } from '@/Constants/businessHealth'
import useProducts from '@/Hooks/useProducts'
import { requestOf } from '@/Modules/BusinessHealth/businessHealth'
import { useLedgerOptions } from '@/Modules/ChequePrinting/useChequeOptions'

/**
 * The filters above a report tab (the old tabs' form, once for all five):
 * Report, Current period (+ its dates when Custom), Comparatives (+ dates when
 * Custom), and Products / Buyers for the reports that take them - then
 * Generate and Clear.
 *
 * It only shows and edits `filters`; the tab owns them, validates them and
 * asks for the report. As in the old tabs, a new report empties the
 * comparative and the products, and a new period empties the comparative
 * and its dates. Which boxes a report has - Comparatives, Product Name,
 * Buyer Name - is its request's (BH_REPORT_REQUESTS).
 */

const productNameOf = (row) => String(row?.['Product Name'] ?? '').trim()

/** The company's product names, each once, A to Z. */
function ProductPicker({ value, onChange, required }) {
  const products = useProducts()
  const options = useMemo(
    () => [...new Set(products.rows.map(productNameOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products.rows],
  )
  const loading = products.status === 'loading'

  return (
    <MultiSelectField
      id="bh-products"
      label="Product Name"
      required={required}
      options={options}
      value={value}
      onChange={onChange}
      disabled={loading}
      placeholder={loading ? 'Loading...' : 'Select products'}
      className="w-full sm:w-64"
    />
  )
}

/** The company's ledgers, by name - what the reports match a buyer or supplier on. */
function BuyerPicker({ companyId, value, onChange }) {
  const ledgers = useLedgerOptions(companyId)

  return (
    <MultiSelectField
      id="bh-buyers"
      label="Buyer Name"
      required
      options={ledgers.options}
      value={value}
      onChange={onChange}
      disabled={ledgers.loading}
      placeholder={ledgers.loading ? 'Loading...' : ledgers.error || 'Select buyers'}
      className="w-full sm:w-64"
    />
  )
}

export default function ReportFilters({ reports, report, company, companyId, filters, onChange, onGenerate, onClear, loading }) {
  const set = (changes) => onChange({ ...filters, ...changes })
  // Which boxes the chosen report has - from its request (BH_REPORT_REQUESTS).
  const request = report ? requestOf(report) : null

  const reportOptions = reports.map((entry) => ({
    value: entry.label,
    label: entry.label,
    disabled: entry.isOffered ? !entry.isOffered(company) : false,
  }))

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        id="bh-report"
        label="Report Type"
        placeholder="Select Report"
        options={reportOptions}
        value={filters.report}
        onValueChange={(value) => set({ report: value, comparative: '', productNames: [] })}
        className="w-full sm:w-64"
      />

      <SelectField
        id="bh-period"
        label="Current period"
        options={BH_PERIOD_OPTIONS}
        value={filters.current_period}
        onValueChange={(value) =>
          set({ current_period: value, comparative: '', comparativeFromDate: '', comparativeToDate: '' })
        }
        className="w-full sm:w-40"
      />

      {filters.current_period === 'custom' ? (
        <>
          <Field
            id="bh-from"
            label="From Date"
            type="date"
            value={filters.fromDate}
            onChange={(event) => set({ fromDate: event.target.value })}
            className="w-full sm:w-40"
          />
          <Field
            id="bh-to"
            label="To Date"
            type="date"
            value={filters.toDate}
            onChange={(event) => set({ toDate: event.target.value })}
            className="w-full sm:w-40"
          />
        </>
      ) : null}

      {request?.comparative === 'none' ? null : (
        <SelectField
          id="bh-comparative"
          label="Comparatives"
          placeholder="Select option"
          options={BH_COMPARATIVE_OPTIONS[filters.current_period] ?? []}
          value={filters.comparative}
          onValueChange={(value) => set({ comparative: value })}
          className="w-full sm:w-56"
        />
      )}

      {filters.comparative === 'custom' ? (
        <>
          <Field
            id="bh-comparative-from"
            label="Comparative From Date"
            type="date"
            value={filters.comparativeFromDate}
            onChange={(event) => set({ comparativeFromDate: event.target.value })}
            className="w-full sm:w-44"
          />
          <Field
            id="bh-comparative-to"
            label="Comparative To Date"
            type="date"
            value={filters.comparativeToDate}
            onChange={(event) => set({ comparativeToDate: event.target.value })}
            className="w-full sm:w-44"
          />
        </>
      ) : null}

      {request && request.products !== 'none' ? (
        <ProductPicker
          value={filters.productNames}
          onChange={(productNames) => set({ productNames })}
          required={request.products === 'required'}
        />
      ) : null}

      {request && request.buyers !== 'none' ? (
        <BuyerPicker companyId={companyId} value={filters.buyerNames} onChange={(buyerNames) => set({ buyerNames })} />
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" loading={loading} onClick={onGenerate}>
          Generate
        </Button>
        <Button type="button" variant="outline" onClick={onClear}>
          Clear
        </Button>
        <Tooltip text="Report accuracy depends on source data">
          <span tabIndex={0} aria-label="Report accuracy depends on source data" className="text-brand">
            <Info className="size-5" />
          </span>
        </Tooltip>
      </div>
    </div>
  )
}

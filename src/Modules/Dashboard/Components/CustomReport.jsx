/**
 * The Custom Report view of the Inventory tab: the company's products with
 * every field it keeps for them, one row each, and the stock of each behind
 * its arrow.
 *
 *   POST inventory/ProductCustomizedReport/ { company_name }  (getProductCustomReport)
 *
 * Read the first time the view is opened, kept while the user is elsewhere,
 * and read again on Refresh or when the company changes (useCompanyReport).
 * The columns are the reply's own (see ../customReport) - nothing here names
 * a field of the company's.
 *
 * READ-ONLY. The Actions column holds the arrow that opens a row onto its
 * warehouses, and nothing else.
 *
 * FILTERS - all on the rows already loaded, no request:
 *   the search box   the product's name (when the report has such a column)
 *   Warehouse        a warehouse the product has stock in - not offered to a
 *                    company whose plan allows one warehouse
 *   Expiry           a date range - only when the report HAS an expiry date
 *                    column; none is assumed
 */

import { Fragment, useMemo, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, FileSpreadsheet, RefreshCw } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import {
  DataTable,
  DateRangeFilter,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useCompanyReport from '@/Hooks/useCompanyReport'
import { useListView } from '@/Hooks/useListView'
import { cn } from '@/Library/utils'
import { getProductCustomReport, hasSingleWarehouseLimit } from '@/Services/inventoryService'
import { orDash } from '@/Utils/display'
import { filterCustomReport, readCustomReport, reportWarehouses } from '../customReport'
import { displayValue } from '../productList'

const WAREHOUSE_FILTER = 'warehouse'
const NO_RANGE = { from: '', to: '' }

/** The opened row's warehouse lines: a heading, then one line per stock entry. */
const GRID = 'grid min-w-[40rem] grid-cols-[minmax(9rem,1.6fr)_6rem_6rem_6rem_6rem_minmax(8rem,1.4fr)] gap-x-3'

function WarehouseLines({ warehouses }) {
  if (warehouses.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">No warehouse allocation for this product.</p>
  }

  return (
    <div className="overflow-x-auto px-3 py-2">
      <div className={cn(GRID, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
        <span>Warehouse</span>
        <span>Level</span>
        <span>Shelf</span>
        <span>Rack No.</span>
        <span>Quantity</span>
        <span>Other</span>
      </div>
      {warehouses.map((warehouse, index) => (
        <div key={index} className={cn(GRID, 'items-start py-1.5 text-xs text-foreground')}>
          <span className="font-medium break-words">{orDash(warehouse.label)}</span>
          <span>{orDash(warehouse.level)}</span>
          <span>{orDash(warehouse.shelf)}</span>
          <span>{orDash(warehouse.rackNo)}</span>
          <span>{orDash(warehouse.quantity)}</span>
          <span className="break-words text-muted-foreground">
            {warehouse.others.length > 0
              ? warehouse.others.map(({ label, value }) => `${label}: ${displayValue(value)}`).join('  ·  ')
              : '--'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function CustomReport({ enabled = true }) {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const singleWarehouse = hasSingleWarehouseLimit(activeCompany)

  const report = useCompanyReport(getProductCustomReport, enabled)
  const loading = report.status === 'loading'

  const read = useMemo(() => readCustomReport(report.rows), [report.rows])
  const warehouses = useMemo(() => (singleWarehouse ? [] : reportWarehouses(read.rows)), [read.rows, singleWarehouse])

  /* ---------------- Filters ---------------- */
  const [warehouse, setWarehouse] = useState('')
  const [expiry, setExpiry] = useState(NO_RANGE)

  // A warehouse no longer in the report is not applied.
  const activeWarehouse = warehouses.includes(warehouse) ? warehouse : ''
  const expirySet = Boolean(read.expiryKey && (expiry.from || expiry.to))

  const filtered = useMemo(
    () => filterCustomReport(read.rows, { warehouse: activeWarehouse, ...expiry, expiryKey: read.expiryKey }),
    [read.rows, activeWarehouse, expiry, read.expiryKey],
  )

  const view = useListView(filtered, { searchFields: read.nameKey ? [read.nameKey] : [] })

  const filterView = {
    ...view,
    filterFields: warehouses.length > 0 ? { [WAREHOUSE_FILTER]: 'Warehouse' } : {},
    filterOptions: { [WAREHOUSE_FILTER]: warehouses },
    filters: { [WAREHOUSE_FILTER]: activeWarehouse },
    setFilter: (_field, value) => {
      setWarehouse(value)
      view.setPage(1)
    },
    isFiltered: view.isFiltered || Boolean(activeWarehouse) || expirySet,
    clear: () => {
      setWarehouse('')
      setExpiry(NO_RANGE)
      view.clear()
    },
  }

  /* ---------------- Opened rows ---------------- */
  const [expanded, setExpanded] = useState([])
  const toggle = (key) =>
    setExpanded((previous) => (previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key]))

  const columnCount = read.columns.length + 1

  const renderBody = () => {
    if (!companyName) {
      return (
        <StateMessage icon={FileSpreadsheet} title="No company selected">
          Choose a company in the header to see its report.
        </StateMessage>
      )
    }

    if (read.rows.length === 0) {
      if (loading || report.status === 'idle') return <ListSkeleton />

      if (report.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the custom report"
            action={<RetryButton onClick={report.reload} />}
          >
            {report.error}
          </StateMessage>
        )
      }

      return (
        <StateMessage icon={FileSpreadsheet} title="No products found">
          The custom report has nothing to show for this company yet.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={filterView}
          searchPlaceholder={read.nameKey ? `Search ${read.nameKey.toLowerCase()}` : 'Search'}
          extra={
            read.expiryKey ? (
              <DateRangeFilter
                label="Expiry"
                from={expiry.from}
                to={expiry.to}
                onChange={(range) => {
                  setExpiry(range)
                  view.setPage(1)
                }}
              />
            ) : null
          }
        />

        {view.total === 0 ? (
          <StateMessage icon={FileSpreadsheet} title="No matching products">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <DataTable
            defaultColumnWidth={140}
            head={
              <>
                {read.columns.map(({ key, label }) => (
                  <SortableHead key={key} view={view} field={key} width={key === read.nameKey ? 200 : undefined}>
                    {label}
                  </SortableHead>
                ))}
                <PlainHead width={72} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((row) => {
              const open = expanded.includes(row.key)
              const name = (read.nameKey && row[read.nameKey]) || 'product'

              return (
                <Fragment key={row.key}>
                  <TableRow className="text-brand">
                    {read.columns.map(({ key }) => (
                      <TableCell
                        key={key}
                        className={cn(key === read.nameKey && 'font-medium')}
                        title={row[key] || undefined}
                      >
                        {orDash(row[key])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="iconEdit"
                          size="icon-sm"
                          icon={open ? ChevronDown : ChevronRight}
                          tooltip={open ? 'Hide warehouse details' : 'Show warehouse details'}
                          aria-label={`${open ? 'Hide' : 'Show'} warehouse details of ${name}`}
                          aria-expanded={open}
                          onClick={() => toggle(row.key)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>

                  {open ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columnCount} wrap className="bg-muted/40 p-0">
                        <WarehouseLines warehouses={row.warehouses} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </DataTable>
        )}

        <TablePager view={view} />
      </>
    )
  }

  return (
    <Panel
      title="Custom Report"
      meta={read.rows.length > 0 ? `(Total Count: ${read.rows.length})` : undefined}
      actions={
        <Button
          type="button"
          size="sm"
          onClick={report.reload}
          disabled={!companyName || loading}
          aria-label="Refresh custom report"
        >
          <RefreshCw className={cn(loading && companyName && 'animate-spin')} />
          Refresh
        </Button>
      }
    >
      {report.status === 'failed' && read.rows.length > 0 ? (
        <InlineAlert action={<RetryButton onClick={report.reload} />}>{report.error}</InlineAlert>
      ) : null}

      {renderBody()}
    </Panel>
  )
}

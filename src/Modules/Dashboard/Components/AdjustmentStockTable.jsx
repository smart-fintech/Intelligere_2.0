/**
 * What a product search found (Adjust Inventory) - ONE ROW PER WAREHOUSE OF
 * PER ENTRY (readStockRows): a product's SKUs, each SKU's product_details, each
 * of those's warehouses. Nothing is added up here.
 *
 *   rows              readStockRows(...) of the search
 *   picks             { [row.key]: { row, selected, removeQty } } - the dialog keeps them,
 *                     so they outlive a page, and a search
 *   onChange(row, { selected | removeQty })
 *   warehouseDetails(id)   { address, email } - the shared warehouse list; no request
 *   errors            what the last Save found, by 'lines.<row.key>'
 *
 * A row's tick and its Remove Qty are its own: neither touches another row. A
 * ticked row opens out, right under itself, into what else is known of that
 * record. Ten rows to a page - rows, not products - and no pager for ten or
 * fewer. A row with nothing to remove (no warehouse, no stock, a SKU without
 * a product_id) is still shown, with its controls off.
 */

import { Fragment } from 'react'

import { TablePager } from '@/Components/Common/TableTools'
import { Checkbox } from '@/Components/ui/checkbox'
import { Input } from '@/Components/ui/input'
import { useListView } from '@/Hooks/useListView'
import { cn } from '@/Library/utils'
import { removeQtyProblem } from '@/Modules/Dashboard/inventoryAdjustments'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { orDash } from '@/Utils/display'

const TH = 'px-2 py-2 text-left whitespace-nowrap'
const TD = 'px-2 py-2'
const HEAD = 'bg-muted/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const COLUMNS = 14

/** A Remove Qty box - the same in this table and in To Remove. */
export function QuantityInput({ value, max, error, label, disabled, onChange }) {
  return (
    <>
      <Input
        type="number"
        min="0"
        max={max}
        step="any"
        inputMode="decimal"
        placeholder="0"
        className={cn('h-8 text-right tabular-nums', error && 'border-destructive')}
        aria-label={label}
        aria-invalid={Boolean(error) || undefined}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="mt-1 text-[11px] whitespace-normal text-destructive">{error}</p> : null}
    </>
  )
}

/** A row's SKU code - its sku_details on hover, and no tooltip at all when it has none. */
export function RowSku({ code, details }) {
  const hasDetails = Object.values(details ?? {}).some((value) => String(value ?? '').trim() !== '')
  if (!code) return '--'
  return hasDetails ? <SkuCode code={code} details={details} /> : <span className="break-all">{code}</span>
}

/** Under a ticked row: the rest of what the API says of that record. */
function SelectedRowDetails({ row }) {
  const known = [
    ['Sr No.', row.srNo],
    ['Entry Quantity', row.entryQuantity],
    ['Expiry Date', row.expiryDate],
  ]
  return (
    <div className="sticky left-0 flex w-fit max-w-[calc(100vw-5rem)] animate-in flex-wrap gap-x-6 gap-y-1 px-3 py-2 text-xs duration-200 fade-in-0 slide-in-from-top-1">
      {known.map(([label, value]) => (
        <div key={label}>
          <span className="text-muted-foreground">{label}: </span>
          <span className="font-medium tabular-nums">{orDash(value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdjustmentStockTable({ rows, picks, onChange, warehouseDetails, errors }) {
  const view = useListView(rows)

  return (
    <div className="animate-in duration-200 fade-in-0 slide-in-from-top-1">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[88rem] text-sm">
          <thead className={HEAD}>
            <tr>
              <th className="w-10 px-2 py-2" aria-label="Select" />
              <th className={TH}>Product Name</th>
              <th className={TH}>SKU Code</th>
              <th className={TH}>HSN</th>
              <th className={TH}>Per</th>
              <th className={cn(TH, 'text-right')}>Unit Rate</th>
              <th className={TH}>Warehouse Name</th>
              <th className={cn(TH, 'text-right')}>Quantity</th>
              <th className={cn(TH, 'w-36 text-right')}>Remove Qty</th>
              <th className={TH}>Shelf</th>
              <th className={TH}>Level</th>
              <th className={TH}>Rack No.</th>
              <th className={TH}>Warehouse Address</th>
              <th className={TH}>Created At</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, index) => {
              const pick = picks[row.key]
              const selected = Boolean(pick?.selected)
              const removeQty = pick?.removeQty ?? ''
              const error = removeQtyProblem(removeQty, row.available) || (selected ? errors[`lines.${row.key}`] : undefined)
              // A product's rows read as one group: its name on the first of them on this page.
              const firstOfProduct = index === 0 || view.rows[index - 1].productKey !== row.productKey
              const where = row.warehouseName || 'this warehouse'
              return (
                <Fragment key={row.key}>
                  <tr
                    className={cn('align-top transition-colors', firstOfProduct ? 'border-t border-border' : 'border-t border-border/40', selected ? 'bg-brand/5' : 'hover:bg-muted/40')}
                    data-testid="adjustment-stock-row"
                  >
                    <td className={cn(TD, 'text-center')}>
                      <Checkbox
                        className="mt-0.5"
                        checked={selected}
                        disabled={!row.canRemove}
                        aria-label={`Select ${row.skuCode || row.name || 'this record'} in ${where}`}
                        onCheckedChange={(next) => onChange(row, { selected: next === true })}
                      />
                    </td>
                    <td className={cn(TD, 'max-w-56 font-medium [overflow-wrap:anywhere]')}>
                      {firstOfProduct ? orDash(row.name) : <span className="sr-only">{row.name}</span>}
                    </td>
                    <td className={cn(TD, 'max-w-48')}>
                      <RowSku code={row.skuCode} details={row.skuDetails} />
                    </td>
                    <td className={TD}>{orDash(row.hsn)}</td>
                    <td className={TD}>{orDash(row.unit)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{orDash(row.unitRate)}</td>
                    <td className={cn(TD, 'max-w-44 [overflow-wrap:anywhere]')}>{orDash(row.warehouseName)}</td>
                    <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{orDash(row.quantity)}</td>
                    <td className="w-36 px-1 py-1">
                      <QuantityInput
                        value={removeQty}
                        max={row.available}
                        error={error}
                        disabled={!row.canRemove}
                        label={`Quantity to remove of ${row.skuCode || row.name || 'this record'} from ${where}`}
                        onChange={(value) => onChange(row, { removeQty: value })}
                      />
                    </td>
                    <td className={TD}>{orDash(row.shelf)}</td>
                    <td className={TD}>{orDash(row.level)}</td>
                    <td className={TD}>{orDash(row.rackNo)}</td>
                    <td className={cn(TD, 'max-w-56 [overflow-wrap:anywhere]')}>{orDash(row.address || (row.warehouseId ? warehouseDetails(row.warehouseId).address : ''))}</td>
                    <td className={cn(TD, 'whitespace-nowrap')}>{orDash(row.createdAt)}</td>
                  </tr>
                  {selected ? (
                    <tr className="border-l-2 border-l-brand bg-brand/5">
                      <td colSpan={COLUMNS} className="p-0">
                        <SelectedRowDetails row={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <TablePager view={view} pageSizeChoice={false} />
    </div>
  )
}

import { Fragment, useState } from 'react'
import { Check, PackageX } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { bookingKey, buildStockUpdateBody, checkStockRemoval, hasStockProblems, totalRemoved, warehouseKey } from '@/Modules/SalesInvoice/challanStock'
import { toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'

const cell = 'px-2 py-1.5'
const quantity = (value) => String(Number(Number(value).toFixed(3)))
const inputClass =
  'h-8 w-full rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50'

/**
 * TAKE A CHALLAN'S STOCK OUT - before a Challan with no Prefill From is saved
 * (the workspace's save; challanStock): each product the stock summary
 * returned (inventory/SKUWarehouseSummaryAPI/'s POST), with its SKU code (its
 * SKU details on hover) and order quantity, then each warehouse that holds it
 * - Qty, Total Booked, Free (Qty - booked) and Take from free stock - and, under
 * it, the Sales Orders booked there: SO No., Buyer, Date, Booked and Take from
 * this booking. OK works once every product adds up to its order quantity
 * (checkStockRemoval) and sends nothing: onDone(body) - the body of what is
 * taken out (buildStockUpdateBody), which the Challan is created with (its
 * `skuWarehouseSummary`). Close takes nothing out and saves nothing (onClose).
 *
 *   rows          readStockSummary(...) - never empty
 *   initialEntered   the quantities it starts with - editing, the saved ones (withSavedStock); none by default
 *   companyName   the active company's
 *   documentNo    the Challan's number, for the title
 */
export default function ChallanStockModal({ rows, initialEntered, companyName, documentNo, onDone, onClose }) {
  const [entered, setEntered] = useState(() => initialEntered ?? {})
  const problems = checkStockRemoval(rows, entered)
  const valid = !hasStockProblems(problems)
  // A product's total error shows once something is typed for it.
  const typedFor = (row) => Object.keys(entered).some((key) => key.startsWith(`${row.key}|`) && String(entered[key]).trim() !== '')

  const type = (key, text) => setEntered((current) => ({ ...current, [key]: toDecimalInput(text) }))

  const confirm = () => {
    if (!valid) return
    onDone(buildStockUpdateBody({ companyName, rows, entered }))
  }

  const input = (key, label, { disabled = false } = {}) => (
    <>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={Boolean(problems.cells[key])}
        className={inputClass}
        value={entered[key] ?? ''}
        disabled={disabled}
        onChange={(event) => type(key, event.target.value)}
      />
      {problems.cells[key] ? <p className="mt-0.5 text-[11px] text-destructive">{problems.cells[key]}</p> : null}
    </>
  )

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title={`Take stock out - ${documentNo || 'Challan'}`}
      description="Take each product's order quantity from a warehouse's free stock, or from a Sales Order booked there."
      size="xl"
      autoFocus={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {valid ? null : <p className="mr-auto text-xs text-muted-foreground">Take out each product&apos;s whole order quantity to continue.</p>}
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" icon={Check} disabled={!valid} onClick={confirm}>
            OK
          </Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="challan-stock">
        {rows.map((row) => {
          const total = totalRemoved(row, entered)
          const error = problems.items[row.key] && (typedFor(row) || row.productId === null || row.warehouses.length === 0) ? problems.items[row.key] : null
          return (
            <section key={row.key} className="space-y-1.5 rounded-md border border-border p-3" aria-label={`Stock of ${row.productName}`} data-testid="challan-stock-item">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold break-words text-brand">
                  {row.productName || 'Product'}
                  {row.skuCode ? (
                    <span className="ml-2 text-xs font-normal text-foreground">
                      <SkuCode code={row.skuCode} details={row.skuDetails} />
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Order Quantity <span className="font-semibold text-foreground tabular-nums" data-testid="challan-stock-order">{quantity(row.orderQty)}</span>
                  {' '}- Taken <span className={cn('font-semibold tabular-nums', error ? 'text-destructive' : 'text-foreground')} data-testid="challan-stock-total">{quantity(total)}</span>
                </p>
              </div>
              {row.warehouses.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PackageX className="size-3.5" aria-hidden="true" />
                  No warehouse holds this product.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className={cn(cell, 'font-medium')}>Warehouse</th>
                        <th className={cn(cell, 'text-right font-medium')}>Qty</th>
                        <th className={cn(cell, 'text-right font-medium')}>Total Booked</th>
                        <th className={cn(cell, 'text-right font-medium')}>Free</th>
                        <th className={cn(cell, 'w-40 font-medium')}>Take from free stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.warehouses.map((warehouse) => (
                        <Fragment key={warehouse.id}>
                          <tr className="border-t border-border align-top" data-testid="challan-stock-warehouse">
                            <td className={cn(cell, 'font-medium break-words')}>{warehouse.name}</td>
                            <td className={cn(cell, 'text-right tabular-nums')}>{quantity(warehouse.qty)}</td>
                            <td className={cn(cell, 'text-right tabular-nums')}>{quantity(warehouse.booked)}</td>
                            <td className={cn(cell, 'text-right font-semibold tabular-nums')}>{quantity(warehouse.free)}</td>
                            <td className={cell}>
                              {input(warehouseKey(row, warehouse), `Take ${row.productName} from ${warehouse.name}'s free stock`, { disabled: warehouse.free <= 0 })}
                            </td>
                          </tr>
                          {warehouse.bookings.length > 0 ? (
                            <tr className="bg-muted/30">
                              <td colSpan={5} className="px-2 pt-1 pb-2">
                                <p className="pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Sales Orders booked in {warehouse.name}</p>
                                <div className="overflow-hidden rounded-md border border-border bg-card">
                                  <table className="w-full text-xs">
                                    <thead className="text-left text-muted-foreground">
                                      <tr>
                                        <th className={cn(cell, 'font-medium')}>SO No.</th>
                                        <th className={cn(cell, 'font-medium')}>Buyer</th>
                                        <th className={cn(cell, 'font-medium')}>Date</th>
                                        <th className={cn(cell, 'text-right font-medium')}>Booked</th>
                                        <th className={cn(cell, 'w-40 font-medium')}>Take from this booking</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {warehouse.bookings.map((booking) => (
                                        <tr key={booking.soNo} className="border-t border-border align-top" data-testid="challan-stock-booking">
                                          <td className={cn(cell, 'font-medium')}>{booking.soNo || '--'}</td>
                                          <td className={cn(cell, 'break-words')}>{booking.buyerName || '--'}</td>
                                          <td className={cell}>{booking.date || '--'}</td>
                                          <td className={cn(cell, 'text-right tabular-nums')}>{quantity(booking.qty)}</td>
                                          <td className={cell}>{input(bookingKey(row, warehouse, booking), `Take ${row.productName} from ${booking.soNo}'s booking in ${warehouse.name}`)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {error ? (
                <p className="text-xs text-destructive" role="alert" data-testid="challan-stock-error">
                  {error}
                </p>
              ) : null}
            </section>
          )
        })}
      </div>
    </Modal>
  )
}

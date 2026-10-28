import { Fragment, useState } from 'react'
import { ChevronRight, FileQuestion } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { QuotationFooter, QuotationSteps, SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { PROCUREMENT_STATE as STATE, QUOTATION_STATES, stockIsShort, stockRequiredQty } from '@/Modules/SalesInvoice/procurement'

// The stock's categories, in the order their products are listed - one table, no sections.
const CATEGORIES = ['finished_product', 'semi_finished_product', 'raw_product']
const cell = 'px-2 py-1.5'
const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const number = (value) => (text(value) !== '' && Number.isFinite(Number(value)) ? Number(value) : null)
const quantity = (value) => (number(value) === null ? '--' : String(Number(number(value).toFixed(3))))
const listOf = (value) => (Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [])

/** Every product of the stock, each once with its own key (its category and place in it) - whatever its category. */
const stockRows = (stock) => CATEGORIES.flatMap((field) => listOf(stock?.[field]).map((row, index) => ({ key: `${field}:${index}:${text(row.sku_code)}`, row, orders: listOf(row.msg) })))

/** The Sales Orders a product is held for (its `msg`) - never its warehouses. */
function OrderLines({ rows }) {
  return (
    <div className="overflow-x-auto px-3 py-2">
      <div className="grid min-w-[420px] grid-cols-[minmax(8rem,1.6fr)_minmax(7rem,1fr)_5.5rem_5.5rem] gap-x-3 border-b border-border pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span>Buyer Name</span>
        <span>SO Number</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Booked Qty</span>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${text(row.so_no)}-${index}`}
          className="grid min-w-[420px] grid-cols-[minmax(8rem,1.6fr)_minmax(7rem,1fr)_5.5rem_5.5rem] gap-x-3 py-1 text-xs [overflow-wrap:anywhere]"
          data-testid="inventory-order-line"
        >
          <span>{text(row.buyer_name) || '--'}</span>
          <span>{text(row.so_no) || '--'}</span>
          <span className="text-right tabular-nums">{quantity(row.ordered_qty)}</span>
          <span className="text-right tabular-nums">{quantity(row.booked_qty)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * INVENTORY DETAILS - a saved Sales Order's stock, as its PDF save answered
 * it (invoice/save-document-pdf/'s `stock` - nothing asked for here): every
 * product, whatever its category, a row of one table - Product Name, SKU Code
 * (its sku_details on hover), Ordered, Available and Minimum Quantity,
 * Required Quantity - the shortfall the PDF save calculated (remain_qty
 * below 0; red when there is one, Minimum red when below_min_qty) - and
 * Details: the other Sales Orders it is held for (`msg`: Buyer Name, SO
 * Number, Qty, Booked Qty), never its warehouses. Only a product with such
 * orders has the arrow; with none anywhere, there is no Details column.
 *
 * Request for Quotation sits at the bottom - the only way into the request -
 * whenever this order's stock is short of something (stockIsShort - booked
 * or not); with nothing short, it is not offered and the modal says so.
 * It calculates what the order still needs (inventory/order_requirement/ -
 * its progress and failure shown here, retried from the same button), then
 * the request's steps take this same modal over (RequestQuotation); once
 * calculated, it only goes back into them. Back from the first step returns
 * to the stock; Done closes.
 *
 *   stock        the reply's `stock`, or null (closed)
 *   documentNo   the order's number
 *   procurement  useProcurement(...) - this order's purchasing; null when it
 *                has none (an order updated, or saved without the booking)
 */
export default function InventoryDetailsModal({ stock, documentNo, procurement = null, onClose }) {
  // 'stock' or 'quotation' - the request shows once its requirements are in.
  const [view, setView] = useState('stock')
  const quoting = Boolean(procurement) && view === 'quotation' && QUOTATION_STATES.includes(procurement.state)
  const submitting = procurement?.state === STATE.QUOTATION_SUBMITTING
  const requestQuotation = () => {
    if (!procurement.actions.requestQuotation) return
    setView('quotation')
    if (!QUOTATION_STATES.includes(procurement.state)) procurement.loadRequirements()
  }
  const close = () => {
    setView('stock')
    onClose()
  }
  const rows = stockRows(stock)
  // This order's own stock, every time it opens - never an earlier order's answer.
  const short = stockIsShort(stock)
  // The Details column - only when some product is held by other Sales Orders.
  const withDetails = rows.some(({ orders }) => orders.length > 0)
  const [open, setOpen] = useState(() => new Set())
  const toggle = (key) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Modal
      open={Boolean(stock)}
      // Not while a request for quotation is being sent - its answer is waited for.
      onOpenChange={(next) => !next && !submitting && close()}
      title={`${quoting ? 'Request for Quotation' : 'Inventory Details'} - ${documentNo || 'Sales Order'}`}
      size="xxl"
      autoFocus={false}
      footer={
        quoting ? (
          <QuotationFooter procurement={procurement} onStock={() => setView('stock')} onDone={close} />
        ) : (
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {/* Offered only when this order's own stock leaves something to buy. */}
              {!short ? null : !procurement ? (
                <Button type="button" variant="outline" icon={FileQuestion} disabled tooltip="Offered for a new Sales Order, once its inventory is booked">
                  Request for Quotation
                </Button>
              ) : procurement.state === STATE.NO_PURCHASE_REQUIRED ? null : (
                <Button
                  type="button"
                  variant="outline"
                  icon={FileQuestion}
                  loading={procurement.actions.loading}
                  disabled={!procurement.actions.requestQuotation}
                  tooltip={procurement.actions.requestQuotation || procurement.actions.loading ? undefined : 'Once the order’s PDF has returned its stock'}
                  onClick={requestQuotation}
                >
                  {procurement.actions.loading
                    ? 'Calculating requirements...'
                    : QUOTATION_STATES.includes(procurement.state)
                      ? 'Open Request'
                      : requirementsFailed(procurement)
                        ? 'Retry Request for Quotation'
                        : 'Request for Quotation'}
                </Button>
              )}
            </div>
            <Button type="button" onClick={close}>
              Close
            </Button>
          </div>
        )
      }
    >
      {quoting ? (
        <QuotationSteps procurement={procurement} />
      ) : (
        <div className="space-y-4" data-testid="inventory-details">
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground" data-testid="inventory-empty">
              No products in this order.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-40" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                  {withDetails ? <col className="w-20" /> : null}
                </colgroup>
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className={cn(cell, 'font-medium')}>Product Name</th>
                    <th className={cn(cell, 'font-medium')}>SKU Code</th>
                    <th className={cn(cell, 'text-right font-medium')}>Ordered Qty</th>
                    <th className={cn(cell, 'text-right font-medium')}>Available Qty</th>
                    <th className={cn(cell, 'text-right font-medium')}>Minimum Qty</th>
                    <th className={cn(cell, 'text-right font-medium')}>Required Qty</th>
                    {withDetails ? <th className={cn(cell, 'text-center font-medium')}>Details</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ key, row, orders }) => {
                    const isOpen = orders.length > 0 && open.has(key)
                    const required = stockRequiredQty(row)
                    const name = text(row['Product Name']) || text(row.product_name)
                    return (
                      <Fragment key={key}>
                        <tr className="border-t border-border align-top" data-testid="inventory-row">
                          <td className={cn(cell, 'font-medium break-words')}>{name || '--'}</td>
                          <td className={cn(cell, 'text-xs')}>
                            <SkuCode code={row.sku_code} details={row.sku_details} />
                          </td>
                          <td className={cn(cell, 'text-right tabular-nums')}>{quantity(row.ordered_qty)}</td>
                          <td className={cn(cell, 'text-right tabular-nums')}>{quantity(row.available_qty)}</td>
                          <td className={cn(cell, 'text-right tabular-nums', row.below_min_qty === true && 'font-semibold text-destructive')}>{quantity(row.min_qty)}</td>
                          <td className={cn(cell, 'text-right tabular-nums', required > 0 && 'font-semibold text-destructive')} data-testid="inventory-required">
                            {quantity(required)}
                          </td>
                          {withDetails ? (
                            <td className={cn(cell, 'text-center')}>
                              {/* Only a product other Sales Orders hold has details to show. */}
                              {orders.length > 0 ? (
                                <Button
                                  type="button"
                                  variant="iconEdit"
                                  size="icon-sm"
                                  icon={ChevronRight}
                                  className={cn('[&_svg]:transition-transform [&_svg]:duration-200', isOpen && '[&_svg]:rotate-90')}
                                  tooltip={isOpen ? 'Hide details' : 'More details'}
                                  aria-label={`${isOpen ? 'Hide' : 'More'} details of ${name || 'this product'}`}
                                  aria-expanded={isOpen}
                                  onClick={() => toggle(key)}
                                />
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                        {isOpen ? (
                          <tr className="bg-muted/30">
                            <td colSpan={7} className="p-0">
                              <OrderLines rows={orders} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!short && rows.length > 0 ? <NoPurchaseNeeded /> : procurement ? <PurchaseStatus procurement={procurement} /> : null}
        </div>
      )}
    </Modal>
  )
}

const requirementsFailed = (procurement) => procurement.state === STATE.REQUIREMENTS_LOADING && Boolean(procurement.machine.error)

/** No product of the order is short - there is nothing to request a quotation for. */
function NoPurchaseNeeded() {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground" data-testid="no-purchase-required">
      No purchase needed - the stock covers this order.
    </p>
  )
}

/** Where the order's purchase requirements are - shown only when there is something to say. */
function PurchaseStatus({ procurement }) {
  const { state, machine } = procurement
  return (
    <div className="space-y-1.5" aria-live="polite" data-testid="purchase-status" data-state={state}>
      {requirementsFailed(procurement) ? <InlineAlert>{machine.error.message} Press Retry Request for Quotation to try again.</InlineAlert> : null}
      {state === STATE.NO_PURCHASE_REQUIRED ? <NoPurchaseNeeded /> : null}
    </div>
  )
}

import { Check, Plus } from 'lucide-react'

import { RetryButton } from '@/Components/Common/DataList'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { findDocumentType } from '@/Constants/salesInvoice'
import { cn } from '@/Library/utils'
import { InvoiceCard } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import { orderRowAvailable } from '@/Modules/SalesInvoice/orderProducts'

const cell = 'px-2 py-1.5'
const quantityText = (value) => (value === null ? '--' : String(value))

/**
 * THE PRODUCTS OF THE PARTY'S ORDERS (useOrderProducts) - above Product
 * Details, for a type that takes them (Challan: Sales Order; Inbound Challan:
 * Outbound Purchase Order; Purchase Invoice: Inbound Challan):
 *
 *   the order numbers (asked for at Step 2's Next), several at once, and OK
 *   the chosen orders' products: Select, Document No., Product, Reference No.,
 *   HSN Code, SKU Code, Remaining Quantity, Original Quantity, and + - which
 *   fills the entry form below with that product at its remaining quantity
 *   (Add Product then makes it a line). A row with nothing left cannot be used.
 *
 * It is on two steps, with the same choices: Document (above Document
 * Details - the rows ticked fill the Reference No. checked there) without
 * the +, and Products & Save with it.
 *
 *   orders       useOrderProducts(...)
 *   partyLabel   whose orders - 'buyer' / 'supplier'
 *   onFill(row)  + was pressed - left out on the Document step (no + there)
 */
export default function OrderProducts({ orders, partyLabel, disabled, onFill }) {
  const { numbers, products } = orders
  const label = findDocumentType(orders.source)?.label ?? orders.source

  return (
    <InvoiceCard title={`Products from ${label}`}>
      {numbers.status === 'idle' ? (
        <p className="text-xs text-muted-foreground" data-testid="order-products-idle">
          Choose the {partyLabel} and press Next on Step 2 - this {partyLabel}&apos;s {label} numbers are loaded then.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <MultiSelectField
              id="order-numbers"
              label={`${label} No.`}
              className="min-w-0 flex-1 sm:max-w-md"
              options={numbers.rows}
              value={orders.chosen}
              onChange={orders.choose}
              disabled={disabled || numbers.status !== 'ready' || numbers.rows.length === 0}
              placeholder={
                numbers.status === 'loading'
                  ? 'Loading...'
                  : numbers.status === 'failed'
                    ? 'Could not load them'
                    : numbers.rows.length === 0
                      ? `No ${label} for this ${partyLabel}`
                      : `Select ${label} No.`
              }
              searchPlaceholder={`Search ${label}`}
              error={numbers.status === 'failed' ? numbers.error : undefined}
            />
            {numbers.status === 'failed' ? (
              <RetryButton onClick={orders.retryNumbers} />
            ) : (
              <Button
                type="button"
                icon={Check}
                loading={products.status === 'loading'}
                disabled={disabled || numbers.status !== 'ready' || numbers.rows.length === 0 || products.status === 'loading'}
                onClick={orders.loadProducts}
              >
                OK
              </Button>
            )}
          </div>

          {products.status === 'loading' ? <p className="text-xs text-muted-foreground">Loading the products...</p> : null}
          {products.status === 'ready' && products.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="order-products-empty">
              No product details were found for the chosen {label} numbers.
            </p>
          ) : null}
          {products.status === 'ready' && products.rows.length > 0 ? (
            <div className="max-h-72 overflow-auto rounded-md border border-border" data-testid="order-products">
              {/* The columns share the form's width (long values wrap in their own column), down to a floor
                  below which the table scrolls inside its box - the page never does. */}
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className={cn(cell, 'font-medium')}>Select</th>
                    <th className={cn(cell, 'font-medium')}>Document No.</th>
                    <th className={cn(cell, 'font-medium')}>Product</th>
                    <th className={cn(cell, 'font-medium')}>Reference No.</th>
                    <th className={cn(cell, 'font-medium')}>HSN Code</th>
                    <th className={cn(cell, 'font-medium')}>SKU Code</th>
                    <th className={cn(cell, 'text-right font-medium')}>Remaining Qty</th>
                    <th className={cn(cell, 'text-right font-medium')}>Original Qty</th>
                    {onFill ? (
                      <th className={cell}>
                        <span className="sr-only">Action</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {products.rows.map((row) => {
                    const available = orderRowAvailable(row)
                    const name = row.productName || 'this product'
                    return (
                      <tr key={row.key} className="border-t border-border align-top" data-testid="order-product-row">
                        <td className={cell}>
                          <Checkbox
                            aria-label={`Select ${name} of ${row.documentNo}`}
                            checked={orders.checked.includes(row.key)}
                            disabled={disabled}
                            onCheckedChange={() => orders.toggle(row.key)}
                          />
                        </td>
                        <td className={cn(cell, 'whitespace-nowrap')}>{row.documentNo || '--'}</td>
                        <td className={cn(cell, 'break-words')}>{row.productName || '--'}</td>
                        <td className={cn(cell, 'break-words')}>{row.referenceNo || '--'}</td>
                        <td className={cn(cell, 'break-words')}>{row.hsn || '--'}</td>
                        <td className={cn(cell, 'text-xs break-all')}>{row.skuCode || '--'}</td>
                        <td className={cn(cell, 'text-right font-semibold tabular-nums', !available && 'text-destructive')}>{quantityText(row.remainQty)}</td>
                        <td className={cn(cell, 'text-right tabular-nums text-muted-foreground')}>{quantityText(row.quantity)}</td>
                        {onFill ? (
                          <td className={cn(cell, 'text-right')}>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-xs"
                              icon={Plus}
                              tooltip={available ? 'Fill the product form' : 'Nothing left to deliver'}
                              aria-label={`Use ${name} of ${row.documentNo}`}
                              disabled={disabled || !available}
                              onClick={() => onFill(row)}
                            />
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {!onFill && products.status === 'ready' && products.rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">Tick the rows whose Reference No. this document carries. Their products are added on Products &amp; Save, with +.</p>
          ) : null}
        </div>
      )}
    </InvoiceCard>
  )
}

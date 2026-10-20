import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { formatINR } from '@/Modules/Payment/pricing'
import { isServiceLine, lineVariant, rateText, textOf } from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * The two lists under the Product Details entry form:
 *
 *   AddedProducts   the lines already on the invoice - what the preview and
 *                   the totals show - each with Edit (back into the entry
 *                   form) and Remove
 *   BuyerProducts   the products this buyer has had before
 *                   (invoice/unique-products/) - name, SKU code and HSN/SAC,
 *                   and a + that fills the entry form with it
 */

const cell = 'px-2 py-1.5'

/**
 *   lines           form.lines
 *   productsByKey   Map of the products, for names and SKUs
 *   ledgersById     Map of the ledgers, for a service line's name
 *   challan         a Challan's lines - no Rate, GST or Amount columns
 *   figures         invoiceFigures(form).lines - each line's amounts
 *   editingLineId   the line loaded into the entry form, highlighted
 *   errors          the form's errors - a line with any is flagged
 */
export function AddedProducts({ lines, productsByKey, ledgersById, figures, editingLineId, errors, disabled, onEdit, onRemove, challan = false }) {
  if (lines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {challan ? 'No products added yet' : 'No products or services added yet'} - fill in the form above and press Add Product.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className={cn(cell, 'w-8 font-medium')}>#</th>
            <th className={cn(cell, 'font-medium')}>Product</th>
            <th className={cn(cell, 'font-medium')}>HSN/SAC</th>
            <th className={cn(cell, 'text-right font-medium')}>Qty</th>
            {challan ? null : (
              <>
                <th className={cn(cell, 'text-right font-medium')}>Rate</th>
                <th className={cn(cell, 'text-right font-medium')}>GST</th>
                <th className={cn(cell, 'text-right font-medium')}>Amount</th>
              </>
            )}
            <th className={cn(cell, 'w-16')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const service = isServiceLine(line)
            const product = service ? null : productsByKey.get(line.productKey)
            const variant = lineVariant(product, line)
            const name = service
              ? (ledgersById?.get(String(line.ledgerId))?.ledeger_name ?? 'Ledger no longer listed')
              : (product?.name ?? 'Product no longer listed')
            const flagged = Object.keys(errors).some((key) => key.startsWith(`lines.${line.id}.`))
            return (
              <tr key={line.id} className={cn('border-t border-border', line.id === editingLineId && 'bg-brand-soft/60')}>
                <td className={cn(cell, 'text-xs text-muted-foreground tabular-nums')}>{index + 1}</td>
                <td className={cell}>
                  <span className="font-medium">{name}</span>
                  {service ? (
                    <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">Service</span>
                  ) : null}
                  {variant?.skuCode ? <span className="block text-xs text-muted-foreground">{variant.skuCode}</span> : null}
                  {flagged ? <span className="block text-xs text-destructive">Needs attention - Edit to fix</span> : null}
                </td>
                <td className={cell}>{textOf(line.hsn) || '--'}</td>
                <td className={cn(cell, 'text-right tabular-nums')}>
                  {line.quantity} {line.per}
                </td>
                {challan ? null : (
                  <>
                    <td className={cn(cell, 'text-right tabular-nums')}>{line.rate}</td>
                    <td className={cn(cell, 'text-right tabular-nums')}>{line.gstRate ? `${rateText(line.gstRate)}%` : '--'}</td>
                    <td className={cn(cell, 'text-right tabular-nums')}>{formatINR(figures[line.id]?.taxablePaise)}</td>
                  </>
                )}
                <td className={cn(cell, 'whitespace-nowrap text-right')}>
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-xs"
                    icon={Pencil}
                    tooltip="Edit"
                    aria-label={`Edit product ${index + 1}`}
                    disabled={disabled}
                    onClick={() => onEdit(line.id)}
                  />{' '}
                  <Button
                    type="button"
                    variant="iconDelete"
                    size="icon-xs"
                    icon={Trash2}
                    tooltip="Remove"
                    aria-label={`Remove product ${index + 1}`}
                    disabled={disabled}
                    onClick={() => onRemove(line.id)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 *   status   useBuyerProducts' status - 'idle' (no buyer step completed yet) shows nothing
 *   rows     the buyer's earlier products
 *   onPick(row)   + was pressed
 *
 * Nothing at all - not even the heading - once the server has ANSWERED that
 * this buyer has none. While the answer is on its way, or when it could not
 * be had, the section stays: neither of those says there are none.
 */
export function BuyerProducts({ status, rows, disabled, onPick }) {
  if (status === 'idle') return null
  if (status === 'ready' && rows.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold tracking-wide text-brand uppercase">This buyer&apos;s earlier products</p>
      {status === 'loading' ? <p className="text-xs text-muted-foreground">Loading...</p> : null}
      {status === 'failed' ? <p className="text-xs text-muted-foreground">They could not be loaded - products can still be chosen above.</p> : null}
      {status === 'ready' && rows.length > 0 ? (
        <div className="max-h-56 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className={cn(cell, 'font-medium')}>Product Name</th>
                <th className={cn(cell, 'font-medium')}>SKU Code</th>
                <th className={cn(cell, 'font-medium')}>HSN/SAC</th>
                <th className={cn(cell, 'w-10')}>
                  <span className="sr-only">Add</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const name = textOf(row['Product Name'] ?? row.product_name ?? row.Products)
                return (
                  <tr key={`${name}|${textOf(row.sku_code)}|${index}`} className="border-t border-border">
                    <td className={cell}>{name}</td>
                    <td className={cn(cell, 'text-xs')}>{textOf(row.sku_code) || '--'}</td>
                    <td className={cell}>{textOf(row.hsn_sac_code ?? row.Hsn_code) || '--'}</td>
                    <td className={cn(cell, 'text-right')}>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        icon={Plus}
                        tooltip="Fill the product form"
                        aria-label={`Use ${name}`}
                        disabled={disabled}
                        onClick={() => onPick(row)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

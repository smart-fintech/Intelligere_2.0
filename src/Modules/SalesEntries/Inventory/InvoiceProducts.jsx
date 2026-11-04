import { Plus } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { MATCH_LABEL } from '@/Modules/SalesEntries/Inventory/productMatch'
import { Amount } from '@/Modules/SalesEntries/shared/EntryCells'

/**
 * An invoice's product lines, opened under its row: what the file says, and
 * the STOCK ITEM each will go to Tally as (productMatch) - with how it was
 * matched, a pick of another, and Create when nothing matches.
 *
 * A grid, not a <table>: DataTable's cell rules would reach a nested table.
 *
 *   matchOf(product)       productMatch's answer
 *   stockNameOf(product)   the item it goes as - the user's pick, else the match
 *   stockOptions           every stock item of the company
 *   onChoose(product, name | null), onCreate(product) - absent: no Create
 */

const ROW = 'grid min-w-[56rem] grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5rem_4rem_4.5rem_6rem_6.5rem_minmax(0,1fr)] items-start gap-2 px-2 py-1.5'

export default function InvoiceProducts({ invoice, matchOf, stockNameOf, stockOptions, overrideOf, onChoose, onCreate, disabled }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card" role="list" aria-label={`Products of invoice ${invoice.invoiceNo}`}>
      <div className={cn(ROW, 'bg-muted font-semibold text-muted-foreground')}>
        <span>Product (file)</span>
        <span>Stock item in Tally</span>
        <span>HSN</span>
        <span>GST %</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span>GST</span>
      </div>
      {invoice.products.map((product) => {
        const match = matchOf(product)
        const chosen = overrideOf(product)
        const stockName = stockNameOf(product)
        return (
          <div key={product.key} role="listitem" className={cn(ROW, 'border-t border-border/60')}>
            <span className="min-w-0 break-words">{product.name || '--'}</span>
            <div className="min-w-0 space-y-1">
              <SelectField
                id={`stock-item-${product.key}`}
                ariaLabel={`Stock item for ${product.name}`}
                size="sm"
                searchable
                searchPlaceholder="Search stock item"
                placeholder="Select stock item"
                options={stockOptions}
                value={stockName}
                disabled={disabled}
                onValueChange={(name) => onChoose(product, name)}
                onClear={chosen ? () => onChoose(product, null) : undefined}
              />
              {stockName ? (
                <span className="block text-[11px] text-muted-foreground">{chosen ? MATCH_LABEL.chosen : MATCH_LABEL[match.how]}</span>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-destructive">
                    {match.candidates.length > 1 ? `${match.candidates.length} stock items share HSN ${product.hsn} - pick one` : 'No stock item matches'}
                  </span>
                  {onCreate ? (
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" icon={Plus} disabled={disabled} onClick={() => onCreate(product)}>
                      Create
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <span>{product.hsn || '--'}</span>
            <span>{product.gstRate || '--'}</span>
            <span className="text-right tabular-nums">{product.quantity}</span>
            <Amount value={product.rate} className="text-right" />
            <Amount value={product.amount} className="text-right" />
            <span className="min-w-0 space-y-0.5">
              {product.taxes.length === 0 ? (
                <span className="text-muted-foreground">--</span>
              ) : (
                product.taxes.map((line) => (
                  <span key={`${line.tax}-${line.name}`} className="flex justify-between gap-2">
                    <span className="truncate" title={line.name}>
                      {line.name}
                    </span>
                    <Amount value={line.amount} className="shrink-0 text-muted-foreground" />
                  </span>
                ))
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

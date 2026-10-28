import { cn } from '@/Library/utils'
import { formatIndianCurrency } from '@/Utils/currency'

/**
 * One line's columns - S.No., Product, HSN/SAC, Qty, Rate, Disc. %, Taxable
 * Amount, GST %, GST Amount - the SAME template for the headings and every
 * line, so they always line up. Each column has a floor its heading and usual
 * values fit in, and shares out the room above that (Product the most); the
 * grid is never narrower than the floors added up, and below that it scrolls
 * sideways inside its own box. A value longer than its column wraps inside it
 * (CELL) - it never runs into the next one.
 */
const GRID =
  'grid min-w-[60rem] grid-cols-[2.5rem_minmax(12rem,3fr)_minmax(6rem,1fr)_minmax(6.5rem,1fr)_minmax(7rem,1fr)_minmax(4.5rem,0.6fr)_minmax(8rem,1.2fr)_minmax(4.5rem,0.6fr)_minmax(7.5rem,1.1fr)] gap-x-3'
const CELL = 'min-w-0 [overflow-wrap:anywhere]'
const HEADINGS = [
  ['S.No.'],
  ['Product'],
  ['HSN/SAC'],
  ['Qty'],
  ['Rate', true],
  ['Disc. %', true],
  ['Taxable Amount', true],
  ['GST %', true],
  ['GST Amount', true],
]

const rupees = (paise) => (paise === null ? '--' : formatIndianCurrency(paise / 100))
const percent = (value) => (value === null ? '--' : `${Number(value.toFixed(2))}%`)

/**
 * What a History row opens out into: the document's product lines
 * (readHistoryProducts - its product_data, nothing asked for), one line each.
 * Plain boxes in a grid, not a <table> - it sits in a cell of the history
 * table, whose rules reach every cell beneath it (see DataTable). It scrolls
 * sideways inside its own box on a narrow screen, so the page never does.
 *
 *   products     readHistoryProducts(...)
 *   documentNo   for the region's name
 */
export default function HistoryProductRows({ products, documentNo }) {
  if (products.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">No product details are saved for this document.</p>
  }
  return (
    <div className="overflow-x-auto px-3 py-2" role="region" aria-label={`Products of ${documentNo || 'the document'}`}>
      <div className={cn(GRID, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
        {HEADINGS.map(([heading, right]) => (
          <span key={heading} className={cn(CELL, right && 'text-right')}>
            {heading}
          </span>
        ))}
      </div>
      {products.map((line, index) => (
        <div key={line.key} className={cn(GRID, 'items-start py-1.5 text-xs text-foreground', index > 0 && 'border-t border-border/60')} data-testid="history-product-line">
          <span className={cn(CELL, 'tabular-nums text-muted-foreground')}>{index + 1}</span>
          <span className={CELL}>
            <span className="font-medium">{line.name || '--'}</span>
            {line.description ? <span className="block text-muted-foreground">{line.description}</span> : null}
          </span>
          <span className={CELL}>{line.hsn || '--'}</span>
          <span className={cn(CELL, 'tabular-nums')}>{line.quantity ? [line.quantity, line.per].filter(Boolean).join(' ') : '--'}</span>
          <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.ratePaise)}</span>
          <span className={cn(CELL, 'text-right tabular-nums')}>{percent(line.discount)}</span>
          <span className={cn(CELL, 'text-right font-medium tabular-nums')}>{rupees(line.taxablePaise)}</span>
          <span className={cn(CELL, 'text-right tabular-nums')}>{percent(line.gstRate)}</span>
          <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.gstPaise)}</span>
        </div>
      ))}
    </div>
  )
}

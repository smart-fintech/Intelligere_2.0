/**
 * What a product's row opens out into: its SKUs, and where each one's stock
 * is - one line per warehouse allocation.
 *
 *   SKU Code   SKU Details          SKU Qty   SKU Amount   Unit Rate   Warehouse   Wh. Qty   Expiry
 *   PRI-001    Fabric: Cotton ...   300       36000        120         Main        200       --
 *                                                                      Godown 2    100
 *   PRI-002    Fabric: Cotton ...   100       13500        135         Main        100       31-12-2026
 *
 * A SKU's own columns are written once, on its first line, and left blank
 * on the lines under it - so two warehouses of one SKU read as one SKU in
 * two places, not as two SKUs. The same goes for an entry's rate and expiry
 * date across that entry's warehouses.
 *
 * It draws whatever the product has. A product with several SKUs and
 * several warehouses fills every column; a simple product has one line, no
 * SKU code, and perhaps a warehouse quantity with no warehouse named - each
 * missing thing is a dash, never an error. A SKU with no allocation at all
 * says so in the Warehouse column.
 *
 * Made of plain boxes laid out as a grid, not a <table>: it sits inside a
 * cell of the product table, whose rules would reach every cell of a table
 * nested in it (see DataTable). It scrolls sideways inside its own box on a
 * narrow screen, so the page never does.
 *
 * Props:
 *   product   one product, as readProducts gives it
 *   onEditSku(variant)   optional - each SKU gets an Edit, on its first
 *             line (a SKU without a `product_id` cannot be saved, so has none)
 */

import { Pencil } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { displayValue } from '../productList'

/** The eight columns, and the least width the grid is drawn at before it scrolls. */
const GRID =
  'grid min-w-[56rem] grid-cols-[minmax(6.5rem,1fr)_minmax(11rem,2.4fr)_4.75rem_6rem_5.5rem_minmax(7.5rem,1.3fr)_5.5rem_6.25rem] gap-x-3'

/** The same, with a ninth, narrow column for each SKU's Edit. */
const GRID_WITH_EDIT =
  'grid min-w-[58rem] grid-cols-[minmax(6.5rem,1fr)_minmax(11rem,2.4fr)_4.75rem_6rem_5.5rem_minmax(7.5rem,1.3fr)_5.5rem_6.25rem_2rem] gap-x-3'

const HEADINGS = ['SKU Code', 'SKU Details', 'SKU Qty', 'SKU Amount', 'Unit Rate', 'Warehouse', 'Wh. Qty', 'Expiry Date']

/**
 * A SKU as the lines it takes: one per warehouse of each of its entries. An
 * entry with no warehouse still gets a line (its rate and expiry are worth
 * seeing), and so does a SKU with no entries at all.
 */
const linesOf = (variant) => {
  const lines = variant.details.flatMap((detail) =>
    (detail.warehouses.length > 0 ? detail.warehouses : [null]).map((warehouse, index) => ({
      detail,
      warehouse,
      firstOfDetail: index === 0,
    })),
  )

  return (lines.length > 0 ? lines : [{ detail: null, warehouse: null, firstOfDetail: true }]).map((line, index) => ({
    ...line,
    firstOfVariant: index === 0,
  }))
}

export default function ProductVariantRows({ product, onEditSku }) {
  const grid = onEditSku ? GRID_WITH_EDIT : GRID

  if (product.variants.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">No SKU or warehouse details for this product.</p>
  }

  return (
    <div className="overflow-x-auto px-3 py-2">
      <div className={cn(grid, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
        {HEADINGS.map((heading) => (
          <span key={heading}>{heading}</span>
        ))}
        {onEditSku ? <span className="sr-only">Edit</span> : null}
      </div>

      {product.variants.map((variant, variantIndex) =>
        linesOf(variant).map(({ detail, warehouse, firstOfVariant, firstOfDetail }, lineIndex) => (
          <div
            key={`${variantIndex}-${lineIndex}`}
            className={cn(
              grid,
              'items-start py-1.5 text-xs text-foreground',
              // A rule between two SKUs; the lines of one SKU sit together.
              firstOfVariant && variantIndex > 0 && 'border-t border-border/60',
            )}
          >
            {firstOfVariant ? (
              <>
                <span className="font-medium break-words">{orDash(variant.skuCode)}</span>
                <span className="break-words text-muted-foreground">
                  {variant.skuDetails.length > 0
                    ? variant.skuDetails.map(([name, value]) => `${name}: ${displayValue(value)}`).join('  ·  ')
                    : '--'}
                </span>
                <span>{orDash(variant.totalQty)}</span>
                <span>{orDash(variant.totalAmount)}</span>
              </>
            ) : (
              // The SKU's four columns, left blank under its first line.
              <span className="col-span-4" />
            )}

            <span>{firstOfDetail ? orDash(detail?.unitRate) : ''}</span>

            {warehouse ? (
              <>
                <span className="break-words">{orDash(warehouse.label)}</span>
                <span>{orDash(warehouse.quantity)}</span>
              </>
            ) : (
              <span className="col-span-2 text-muted-foreground">No warehouse allocation</span>
            )}

            <span>{firstOfDetail ? formatDate(detail?.expiryDate) : ''}</span>

            {onEditSku ? (
              firstOfVariant && variant.productId !== null ? (
                <Button
                  type="button"
                  variant="iconEdit"
                  size="icon-sm"
                  icon={Pencil}
                  tooltip="Edit this SKU"
                  aria-label={`Edit SKU ${variant.skuCode || variantIndex + 1}`}
                  onClick={() => onEditSku(variant)}
                />
              ) : (
                <span />
              )
            ) : null}
          </div>
        )),
      )}
    </div>
  )
}

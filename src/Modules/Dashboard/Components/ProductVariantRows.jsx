/**
 * What a product's row opens out into: its SKUs, and where each one's stock
 * is - one line per warehouse allocation.
 *
 *   SKU Code   SKU Qty   SKU Amount   Unit Rate   Warehouse   Wh. Qty   Expiry       Actions
 *   PRI-001    300       36000        120         Main        200       --           (eye) (pencil)
 *                                                 Godown 2    100
 *   PRI-002    100       13500        135         Main        100       31-12-2026   (eye) (pencil)
 *
 * WHAT A SKU IS MADE OF is on its code: hovering it (or tabbing to it) shows
 * its `sku_details` in the shared SKU tooltip (SkuDetailsTooltip) - only
 * those, or "No SKU details available". There is no column for them.
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
 *   onViewSku(variant)   optional - each SKU gets a View, on its first line
 *   onEditSku(variant)   optional - each SKU gets an Edit, on its first line
 *             (a SKU without a `product_id` cannot be saved, so has none)
 *   editDisabled   optional - the Edits are there but cannot be pressed
 */

import { Eye, Pencil } from 'lucide-react'

import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { skuDetailPairs } from '../productList'

/** The seven columns, and the least width the grid is drawn at before it scrolls. */
const GRID =
  'grid min-w-[44rem] grid-cols-[minmax(7rem,1.3fr)_4.75rem_6rem_5.5rem_minmax(8rem,1.6fr)_5.5rem_6.25rem] gap-x-3'

/** The same, with an eighth column for each SKU's View and Edit. */
const GRID_WITH_ACTIONS =
  'grid min-w-[48rem] grid-cols-[minmax(7rem,1.3fr)_4.75rem_6rem_5.5rem_minmax(8rem,1.6fr)_5.5rem_6.25rem_4.25rem] gap-x-3'

const HEADINGS = ['SKU Code', 'SKU Qty', 'SKU Amount', 'Unit Rate', 'Warehouse', 'Wh. Qty', 'Expiry Date']

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

export default function ProductVariantRows({ product, onViewSku, onEditSku, editDisabled = false }) {
  const withActions = Boolean(onViewSku || onEditSku)
  const grid = withActions ? GRID_WITH_ACTIONS : GRID

  if (product.variants.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">No SKU or warehouse details for this product.</p>
  }

  return (
    <div className="overflow-x-auto px-3 py-2">
      <div className={cn(grid, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
        {HEADINGS.map((heading) => (
          <span key={heading}>{heading}</span>
        ))}
        {withActions ? <span className="text-right">Actions</span> : null}
      </div>

      {product.variants.map((variant, variantIndex) => {
        const name = variant.skuCode || `${variantIndex + 1}`

        return linesOf(variant).map(({ detail, warehouse, firstOfVariant, firstOfDetail }, lineIndex) => (
          <div
            key={`${variantIndex}-${lineIndex}`}
            className={cn(
              grid,
              'items-center py-1.5 text-xs text-foreground',
              // A rule between two SKUs; the lines of one SKU sit together.
              firstOfVariant && variantIndex > 0 && 'border-t border-border/60',
            )}
          >
            {firstOfVariant ? (
              <>
                {/* Its sku_details on hover or focus - see the note at the top. */}
                <SkuDetailsTooltip details={skuDetailPairs(variant)} side="right" align="start">
                  <span
                    tabIndex={0}
                    className="w-fit max-w-full cursor-help rounded-sm font-medium break-words underline decoration-muted-foreground/50 decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {orDash(variant.skuCode)}
                  </span>
                </SkuDetailsTooltip>
                <span>{orDash(variant.totalQty)}</span>
                <span>{orDash(variant.totalAmount)}</span>
              </>
            ) : (
              // The SKU's three columns, left blank under its first line.
              <span className="col-span-3" />
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

            {withActions ? (
              firstOfVariant ? (
                <div className="flex justify-end gap-1">
                  {onViewSku ? (
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={Eye}
                      tooltip="View SKU details"
                      aria-label={`View details of SKU ${name}`}
                      onClick={() => onViewSku(variant)}
                    />
                  ) : null}
                  {onEditSku && variant.productId !== null ? (
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={Pencil}
                      tooltip="Edit this SKU"
                      aria-label={`Edit SKU ${name}`}
                      disabled={editDisabled}
                      onClick={() => onEditSku(variant)}
                    />
                  ) : null}
                </div>
              ) : (
                <span />
              )
            ) : null}
          </div>
        ))
      })}
    </div>
  )
}

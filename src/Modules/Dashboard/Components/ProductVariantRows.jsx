/**
 * What a product's row opens out into: its SKUs, and where each one's stock
 * is - one line per warehouse allocation.
 *
 *   SKU Code   SKU Qty   SKU Amount   Unit Rate   Warehouse   Wh. Qty   Expiry       Created At              Actions
 *   PRI-001    300       36000        120         Main        200       --           12-Oct-26 12:39:56 PM   (eye) (pencil)
 *                                                 Godown 2    100
 *   PRI-002    100       13500        135         Main        100       31-12-2026   14-Oct-26 09:05:12 AM   (eye) (pencil)
 *
 * WHAT A SKU IS MADE OF is on its code: hovering it (or tabbing to it) shows
 * its `sku_details` in the shared SKU tooltip (SkuDetailsTooltip) - only
 * those, or "No SKU details available". There is no column for them.
 *
 * A SKU's own columns are written once, on its first line, and left blank
 * on the lines under it - so two warehouses of one SKU read as one SKU in
 * two places, not as two SKUs. The same goes for an entry's rate, expiry
 * date and Created At across that entry's warehouses.
 *
 * CREATED AT is each entry's own `product_details[].created_at`, shown as
 * the backend sends it (date and time, e.g. "12-Oct-26 12:39:56 PM") - it
 * is never re-parsed, so it cannot come out as an invalid date. An entry
 * without one shows a dash.
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
 * VIEW AND EDIT ARE AN ENTRY'S. A SKU can hold several `product_details`
 * entries, each its own record by its `sr_no`: each entry has its own View
 * and Edit, side by side in the Actions column of its first line, both
 * handed that SKU and THAT entry (RowActions) - Edit opens the form on that
 * record and saves to it alone, View shows that SKU with that record's
 * stock. A SKU with no entries has one of each, for the SKU (`detail`
 * null). A product with no SKU at all (none sent, or every one deleted) is
 * one line in the same grid, saying so, with its View in the same place -
 * handed no SKU, the dialog shows the product; there is nothing to Edit.
 *
 * Props:
 *   product   one product, as readProducts gives it
 *   onViewSku(variant, detail)   optional - each entry gets a View (both
 *             null for a product with no SKU)
 *   onEditSku(variant, detail)   optional - each entry gets an Edit (a SKU
 *             without a `product_id` cannot be saved, so has none)
 *   editDisabled   optional - the Edits are there but cannot be pressed
 */

import { Eye, Pencil } from 'lucide-react'

import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { skuDetailPairs } from '../productList'

/** The eight columns, and the least width the grid is drawn at before it scrolls. */
const GRID =
  'grid min-w-[54rem] grid-cols-[minmax(7rem,1.3fr)_4.75rem_6rem_5.5rem_minmax(8rem,1.6fr)_5.5rem_6.25rem_9.25rem] gap-x-3'

/** The same, with a ninth column for each SKU's View and Edit. */
const GRID_WITH_ACTIONS =
  'grid min-w-[58rem] grid-cols-[minmax(7rem,1.3fr)_4.75rem_6rem_5.5rem_minmax(8rem,1.6fr)_5.5rem_6.25rem_9.25rem_4.25rem] gap-x-3'

const HEADINGS = ['SKU Code', 'SKU Qty', 'SKU Amount', 'Unit Rate', 'Warehouse', 'Wh. Qty', 'Expiry Date', 'Created At']

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

/**
 * The Actions cell of one line: View and Edit, for the SKU and entry that
 * line is the first of - the same two for both, so they always open the
 * same record. `variant` null is a product with no SKU: a View only.
 */
function RowActions({ product, variant, detail, name, onViewSku, onEditSku, editDisabled }) {
  const record = detail?.srNo !== null && detail?.srNo !== undefined ? ` ${detail.srNo}` : ''

  return (
    <div className="flex justify-end gap-1">
      {onViewSku ? (
        <Button
          type="button"
          variant="iconEdit"
          size="icon-sm"
          icon={Eye}
          tooltip="View SKU details"
          aria-label={
            !variant ? `View details of ${product.name || 'product'}` : detail ? `View record${record} of SKU ${name}` : `View details of SKU ${name}`
          }
          onClick={() => onViewSku(variant, detail)}
        />
      ) : null}
      {onEditSku && variant && variant.productId !== null ? (
        <Button
          type="button"
          variant="iconEdit"
          size="icon-sm"
          icon={Pencil}
          tooltip={detail ? 'Edit this record' : 'Edit this SKU'}
          aria-label={detail ? `Edit record${record} of SKU ${name}` : `Edit SKU ${name}`}
          disabled={editDisabled}
          onClick={() => onEditSku(variant, detail)}
        />
      ) : null}
    </div>
  )
}

export default function ProductVariantRows({ product, onViewSku, onEditSku, editDisabled = false }) {
  const withActions = Boolean(onViewSku || onEditSku)
  const grid = withActions ? GRID_WITH_ACTIONS : GRID
  const actions = { product, onViewSku, onEditSku, editDisabled }

  if (product.variants.length === 0 && !onViewSku) {
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

      {/* No SKU at all: one line across the data columns, its View where every line's is. */}
      {product.variants.length === 0 ? (
        <div className={cn(grid, 'items-center py-1.5 text-xs text-foreground')}>
          <span className="col-span-8 text-muted-foreground">No SKU or warehouse details for this product.</span>
          <RowActions {...actions} variant={null} detail={null} name="" />
        </div>
      ) : null}

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

            {/* As the backend sends it - see the note at the top. */}
            <span className="break-words">{firstOfDetail ? orDash(detail?.createdAt) : ''}</span>

            {withActions ? (
              firstOfDetail ? <RowActions {...actions} variant={variant} detail={detail} name={name} /> : <span />
            ) : null}
          </div>
        ))
      })}
    </div>
  )
}

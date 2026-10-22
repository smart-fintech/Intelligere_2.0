/**
 * THE PRODUCT TABLE - the one both Product pages draw.
 *
 *   [ Search product name ] [ SKU Code v ] [ Warehouse v ] [ More Filters ]  ...actions
 *   Product Name | HSN Code | Group | Unit | Quantity | GST Rate | Rate | Actions
 *   Printed Cotton Fabric | 5208 | Primary | MTR | 400 | 5 | 120 - 135 |  >
 *     ...and under an opened row, its SKUs and where each one's stock is,
 *     each SKU with its own View (eye) and Edit (pencil)
 *
 * ONE ROW PER PRODUCT, however many SKUs it has: the row is the product's
 * own values. The rows are read from the reply in ONE place,
 * Modules/Dashboard/productList, which is also where every filter is
 * worked out - this file only draws.
 *
 * THE ARROW AND THE EYE ARE INVENTORY MANAGEMENT'S. Opening a row onto its
 * SKUs and warehouses (ProductVariantRows) and looking at a SKU in full
 * (ProductDetailsModal) are there only for a user who has Inventory
 * Management - useInventoryAccess, the app's one answer to that: an MSME
 * whose company's `premium_modules` lists it. For an MSME without it, and
 * for an Accounting Professional always, neither button is drawn at all -
 * no gap, no disabled stand-in - and a row's only action is the page's own
 * Edit. With no action to offer, the Actions column is not drawn either.
 *
 * VIEW AND EDIT ARE A SKU'S. With the arrow, a product row holds only the
 * arrow; View and Edit are on each SKU's line of the opened row, each
 * handed THAT SKU - View opens the dialog with the product narrowed to it,
 * Edit is onEditSku(product, variant). The row opens and closes smoothly
 * (RowDetails), the arrow turning with it. A SKU's code there shows its
 * sku_details on hover, as the SKU Code filter's options do - the one
 * SkuDetailsTooltip.
 *
 * Everything else is the same for every user: the reply has the same
 * shape, a simple product just has less in it. What a page adds is passed
 * in - what sits at the end of the filter row, and whether a row can be
 * edited.
 *
 * ------------------------------------------------------------------
 * FILTERS
 * ------------------------------------------------------------------
 *   the search box        the product's name
 *   SKU Code              a SKU's code; hovering a choice shows that SKU's
 *                         sku_details (SkuDetailsTooltip)
 *   Warehouse             a warehouse some SKU has stock in
 *   Expiry                a date range on the SKUs' own expiry dates
 *                         (product_details[].expiry_date) - when any has one
 *   More Filters          one filter per SKU attribute the company's
 *                         products actually have - in a "SKU Details"
 *                         section that opens under the row, its filters
 *                         in a grid that wraps (TableFilters' 'panel')
 *
 * A company whose plan allows one warehouse ("Single Warehouse" in its
 * `features`) has no Warehouse filter: there is nothing to choose between.
 *
 * Each exists only when the products have something to offer for it, and
 * offers only values that are really there. They work together, and Clear
 * resets them and the search at once. Everything is done on the rows
 * already loaded - no request - and the reply itself is never changed. A
 * change of filter goes back to the first page.
 *
 * A LONG PAGE IS WINDOWED. Up to WINDOWED_FROM rows a page is drawn whole,
 * as ever; a longer one ("All" rows of a big list) draws only the rows in
 * sight and a margin around them, with empty rows of the right height
 * above and below (useWindowedRows) - so scrolling, filtering and opening
 * a row cost the same with 25,000 products as with 25. An opened row's
 * details are measured as they open and close, so the rows under them
 * stay where they are drawn.
 *
 * Props:
 *   rows             the products as the backend sent them (useProducts)
 *   warehouseNames   optional { "<warehouse id>": "name" }, to put a name
 *                    to a warehouse the reply only gives the id of
 *   actions          optional - what sits at the right of the filter row
 *   onEdit(product)  optional. With it every row has an Edit button, and is
 *                    handed the product as productList read it
 *   onEditSku(product, variant)   optional - Edit one SKU (the Inventory
 *                    Management page: each SKU is its own record), from
 *                    that SKU's line in the opened row. For a user
 *                    without the arrow the row keeps an Edit: it opens
 *                    its only SKU straight away
 *   editDisabled     optional - Edit is there but cannot be pressed (the
 *                    page is busy with something an edit would cut across)
 *   selectedKey      optional - the `key` of the row to tint (the one open
 *                    in a form)
 *   withCategoryAndAmount   optional - Category and Total Amount columns as
 *                    well (the Expired Products view)
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Package, Pencil } from 'lucide-react'

import { StateMessage } from '@/Components/Common/DataList'
import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import {
  DataTable,
  DateRangeFilter,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useInventoryAccess from '@/Hooks/useInventoryAccess'
import { useListView } from '@/Hooks/useListView'
import { useWindowedRows } from '@/Hooks/useWindowedRows'
import { cn } from '@/Library/utils'
import { hasSingleWarehouseLimit } from '@/Services/inventoryService'
import { orDash } from '@/Utils/display'
import { filterProducts, PRODUCT_FILTER, productFilterOptions, readProducts } from '../productList'
import ProductDetailsModal from './ProductDetailsModal'
import ProductVariantRows from './ProductVariantRows'

const SEARCH_FIELDS = ['name']

/** The seven columns of data, and the Actions column: the cells an opened row spans. */
const COLUMN_COUNT = 8

/** No expiry range set. */
const NO_RANGE = { from: '', to: '' }

/** The Actions column: room for its heading, then for each button it holds. */
const ACTIONS_WIDTH = { base: 36, expand: 30, edit: 36 }

/** How long an opened row takes to open or close - the `duration-200` below. */
const OPEN_MS = 200

/** A page longer than this is windowed - see the note at the top. */
const WINDOWED_FROM = 100

/**
 * What an opened row holds, opening and closing smoothly: its height runs
 * from nothing to all of it (a grid row going from 0fr to 1fr, so nothing
 * has to be measured) as it fades in, and back. It is drawn closed, then
 * opened a frame later, so opening animates too; once a close has run its
 * course `onClosed(rowKey)` lets the table take the row away. With reduced
 * motion it simply appears and goes.
 *
 * `settled`: it has been drawn open before - a windowed row scrolled back
 * into sight - so it is drawn open straight away, not opened again.
 */
function RowDetails({ rowKey, open, settled = false, onClosed, children }) {
  const [entered, setEntered] = useState(settled)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (open) return undefined
    const timer = setTimeout(() => onClosed(rowKey), OPEN_MS)
    return () => clearTimeout(timer)
  }, [open, onClosed, rowKey])

  const shown = open && entered

  return (
    <div
      aria-hidden={!open || undefined}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
        shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** The rows a windowed page leaves out, as one empty row of their height (see useWindowedRows). */
function Spacer({ rowRef, height, columns }) {
  return (
    <TableRow ref={rowRef} aria-hidden className="hover:bg-transparent">
      {/* `p-0!` and `border-0!`: the table pads and rules every cell. */}
      <TableCell colSpan={columns} className="border-0! p-0!" style={{ height }} />
    </TableRow>
  )
}

/** The SKUs of a product Edit can open - those with a `product_id` to save under. */
const editableSkus = (product) => product.variants.filter((variant) => variant.productId !== null)

/**
 * The table's rows: every product of the page - or, on a page longer than
 * WINDOWED_FROM, the ones in sight, between two spacers (useWindowedRows).
 * Its own component, so scrolling a windowed page draws the rows again and
 * not the filters above them; and each row a ProductRow, drawn again only
 * when something of its own has changed.
 *
 * It keeps the height of each opened row's details, as drawn: what a
 * windowed page puts under that row, and - being there at all - that the
 * row has been drawn open before (RowDetails' `settled`). Forgotten once
 * the row has closed.
 */
function ProductRows({ products, expanded, closing, selectedKey, onClosed, detailed, columnCount, ...rowProps }) {
  const [detailHeights, setDetailHeights] = useState(() => new Map())

  const detailsResized = useCallback(
    (key, height) => setDetailHeights((previous) => (previous.get(key) === height ? previous : new Map(previous).set(key, height))),
    [],
  )

  const closed = useCallback(
    (key) => {
      onClosed(key)
      setDetailHeights((previous) => {
        if (!previous.has(key)) return previous
        const next = new Map(previous)
        next.delete(key)
        return next
      })
    },
    [onClosed],
  )

  const windowed = products.length > WINDOWED_FROM
  // Under which rows (by their place on the page) opened details sit, and how tall.
  const extra = useMemo(() => {
    if (!windowed || detailHeights.size === 0) return null

    const heights = new Map()
    products.forEach((product, index) => {
      if (detailHeights.has(product.key)) heights.set(index, detailHeights.get(product.key))
    })
    return heights
  }, [windowed, products, detailHeights])
  const drawn = useWindowedRows({ count: products.length, enabled: windowed, extra })

  return (
    <>
      {windowed ? <Spacer rowRef={drawn.topRef} height={drawn.padTop} columns={columnCount} /> : null}

      {products.slice(drawn.start, drawn.end).map((product, place) => {
        const open = detailed && expanded.includes(product.key)

        return (
          <ProductRow
            key={product.key}
            {...rowProps}
            product={product}
            open={open}
            withDetails={open || (detailed && closing.includes(product.key))}
            selected={product.key === selectedKey}
            settled={detailHeights.has(product.key)}
            detailed={detailed}
            columnCount={columnCount}
            rowRef={place === 0 ? drawn.measureRow : undefined}
            onDetailsResized={detailsResized}
            onClosed={closed}
          />
        )
      })}

      {windowed ? <Spacer height={drawn.padBottom} columns={columnCount} /> : null}
    </>
  )
}

/**
 * One product's row, and what it opens out into. Memoised: the handlers it
 * is given are made once, so it is drawn again only when its product, or
 * whether it is open, selected or being measured, has changed - not on
 * every keystroke, scroll or opened row elsewhere in the table.
 */
const ProductRow = memo(function ProductRow({
  product,
  open,
  withDetails,
  selected,
  settled,
  detailed,
  rowEdit,
  pageEdit,
  editDisabled,
  hasActions,
  withCategoryAndAmount,
  columnCount,
  rowRef,
  onToggle,
  onEditRow,
  onViewSku,
  onEditSku,
  onDetailsResized,
  onClosed,
}) {
  const label = product.name || 'product'
  const skuCount = rowEdit && !pageEdit ? editableSkus(product).length : 0

  /** On the opened details: their height, kept up to date as they open and close. */
  const measureDetails = useCallback(
    (node) => {
      if (!node) return undefined
      const observer = new ResizeObserver(() => onDetailsResized(product.key, node.getBoundingClientRect().height))
      observer.observe(node)
      return () => observer.disconnect()
    },
    [product.key, onDetailsResized],
  )

  return (
    <>
      <TableRow
        ref={rowRef}
        className="text-brand"
        data-state={selected ? 'selected' : undefined}
      >
        <TableCell className="font-medium" title={product.name || undefined}>
          {orDash(product.name)}
        </TableCell>
        <TableCell>{orDash(product.hsn)}</TableCell>
        <TableCell title={product.group || undefined}>{orDash(product.group)}</TableCell>
        <TableCell>{orDash(product.unit)}</TableCell>
        {withCategoryAndAmount ? <TableCell>{orDash(product.category)}</TableCell> : null}
        <TableCell>{orDash(product.quantity)}</TableCell>
        {withCategoryAndAmount ? <TableCell>{orDash(product.totalAmount)}</TableCell> : null}
        <TableCell>{orDash(product.gstRate)}</TableCell>
        <TableCell>{orDash(product.rate)}</TableCell>
        {hasActions ? (
          <TableCell className="text-right">
            <div className="flex justify-end gap-1.5">
              {detailed ? (
                // One arrow, turning as the row opens and closes.
                <Button
                  type="button"
                  variant="iconEdit"
                  size="icon-sm"
                  icon={ChevronRight}
                  className={cn('[&_svg]:transition-transform [&_svg]:duration-200', open && '[&_svg]:rotate-90')}
                  tooltip={open ? 'Hide SKU and warehouse details' : 'Show SKU and warehouse details'}
                  aria-label={`${open ? 'Hide' : 'Show'} SKU and warehouse details of ${label}`}
                  aria-expanded={open}
                  onClick={() => onToggle(product.key, open)}
                />
              ) : null}
              {rowEdit ? (
                <Button
                  type="button"
                  variant="iconEdit"
                  size="icon-sm"
                  icon={Pencil}
                  tooltip={skuCount > 1 ? 'Edit - choose a SKU below' : 'Edit'}
                  aria-label={`Edit ${label}`}
                  disabled={editDisabled || (!pageEdit && skuCount === 0)}
                  onClick={() => onEditRow(product)}
                />
              ) : null}
            </div>
          </TableCell>
        ) : null}
      </TableRow>

      {/* What the row opens out into: one cell across every
          column (see "A ROW THAT OPENS" in DataTable). */}
      {withDetails ? (
        <TableRow ref={measureDetails} className="hover:bg-transparent">
          {/* `py-0!`: the table pads every cell; this one's padding
              is inside what opens, so closed it is no height at all. */}
          <TableCell colSpan={columnCount} wrap className="bg-muted/40 p-0 py-0!">
            <RowDetails
              rowKey={product.key}
              open={open}
              settled={settled}
              onClosed={onClosed}
            >
              <ProductVariantRows
                product={product}
                onViewSku={(variant) => onViewSku(product, variant)}
                onEditSku={onEditSku ? (variant) => onEditSku(product, variant) : undefined}
                editDisabled={editDisabled}
              />
            </RowDetails>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
})

export default function ProductTable({
  rows,
  warehouseNames,
  actions,
  onEdit,
  onEditSku,
  editDisabled = false,
  selectedKey,
  withCategoryAndAmount = false,
}) {
  // The arrow and the eye - see the note at the top.
  const { full: detailed } = useInventoryAccess()

  // A SKU's View and Edit sit on its own line in the opened row, so the
  // product row keeps an Edit only where there is no such line to put it
  // on: the page's own Edit (a simple product), or a user without the arrow.
  const rowEdit = Boolean(onEdit || (onEditSku && !detailed))
  const hasActions = detailed || rowEdit
  const actionsWidth = ACTIONS_WIDTH.base + (detailed ? ACTIONS_WIDTH.expand : 0) + (rowEdit ? ACTIONS_WIDTH.edit : 0)

  // One warehouse: no Warehouse filter - see the note at the top.
  const { activeCompany } = useActiveCompany()
  const singleWarehouse = hasSingleWarehouseLimit(activeCompany)

  const columnCount = COLUMN_COUNT + (withCategoryAndAmount ? 2 : 0)

  const products = useMemo(() => readProducts(rows, warehouseNames), [rows, warehouseNames])
  const offered = useMemo(() => {
    const all = productFilterOptions(products)
    if (!singleWarehouse) return all

    const fields = Object.fromEntries(Object.entries(all.fields).filter(([field]) => field !== PRODUCT_FILTER.WAREHOUSE))
    return { ...all, fields }
  }, [products, singleWarehouse])

  /* ---------------- Filters ----------------
     Kept as { field: value }. A value the products no longer offer - the
     list was read again and that SKU is gone - is not applied, so a stale
     choice can never hide every row with nothing on screen to explain it. */
  const [chosen, setChosen] = useState({})
  // The expiry range, kept apart: it is typed, not chosen from a list.
  const [expiry, setExpiry] = useState(NO_RANGE)
  const expirySet = Boolean(offered.hasExpiry && (expiry.from || expiry.to))

  const filters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(chosen).filter(
          ([field, value]) => value && field in offered.fields && offered.options[field]?.includes(value),
        ),
      ),
    [chosen, offered],
  )

  const filtered = useMemo(
    () =>
      filterProducts(
        products,
        expirySet ? { ...filters, [PRODUCT_FILTER.EXPIRY_FROM]: expiry.from, [PRODUCT_FILTER.EXPIRY_TO]: expiry.to } : filters,
      ),
    [products, filters, expiry, expirySet],
  )

  // Searching, sorting and paging - on the products the filters left.
  const view = useListView(filtered, { searchFields: SEARCH_FIELDS })

  /* What the filter row is handed: the list view's own search, sort and
     paging, with these filters in place of its plain per-column ones (which
     cannot ask "does any SKU of this product match"). */
  const filterView = {
    ...view,
    filterFields: offered.fields,
    filterOptions: offered.options,
    // A SKU code's options show that SKU's sku_details on hover - the same
    // tooltip as everywhere else a SKU code is shown.
    renderFilterOption: (field, option, item) =>
      field === PRODUCT_FILTER.SKU_CODE ? (
        <SkuDetailsTooltip details={offered.hints[field]?.[option]}>{item}</SkuDetailsTooltip>
      ) : (
        item
      ),
    filters,
    setFilter: (field, value) => {
      setChosen((previous) => ({ ...previous, [field]: value }))
      view.setPage(1)
    },
    isFiltered: view.isFiltered || Object.keys(filters).length > 0 || expirySet,
    clear: () => {
      setChosen({})
      setExpiry(NO_RANGE)
      view.clear()
    },
  }

  // The SKU attributes go behind "More Filters": a company with seven SKU
  // fields would otherwise have a filter row three lines deep.
  const moreFilters = offered.attributeFields

  const expiryFilter = offered.hasExpiry ? (
    <DateRangeFilter
      label="Expiry"
      from={expiry.from}
      to={expiry.to}
      onChange={(range) => {
        setExpiry(range)
        view.setPage(1)
      }}
    />
  ) : null

  /* ---------------- Opened rows, and the details dialog ----------------
     The handlers a row is given are made once (useCallback), so a row
     whose product and state are unchanged is not drawn again - see
     ProductRow. */
  const [expanded, setExpanded] = useState([])
  // Rows closing: still drawn until their close has run (RowDetails).
  const [closing, setClosing] = useState([])
  // The product and the SKU (its place among the product's SKUs) in the
  // dialog. Looked up again on every draw, so the dialog shows them as they
  // are after a reload, not as they were.
  const [viewing, setViewing] = useState({ open: false, key: null, sku: null })

  /** The arrow: `open` is whether the row is open now. */
  const toggle = useCallback((key, open) => {
    if (open) {
      setExpanded((previous) => previous.filter((entry) => entry !== key))
      setClosing((previous) => (previous.includes(key) ? previous : [...previous, key]))
    } else {
      setExpanded((previous) => (previous.includes(key) ? previous : [...previous, key]))
    }
  }, [])

  const closed = useCallback((key) => setClosing((previous) => previous.filter((entry) => entry !== key)), [])

  /** The row's Edit: the page's own, or its one SKU, or its row opened onto its SKUs' own Edits. */
  const editRow = useCallback(
    (product) => {
      if (onEdit) return onEdit(product)

      const skus = editableSkus(product)
      if (skus.length === 1) return onEditSku(product, skus[0])
      setExpanded((previous) => (previous.includes(product.key) ? previous : [...previous, product.key]))
    },
    [onEdit, onEditSku],
  )

  const viewSku = useCallback(
    (product, variant) => setViewing({ open: true, key: product.key, sku: product.variants.indexOf(variant) }),
    [],
  )

  // The product with ONLY the SKU whose View was pressed - so the dialog
  // shows that SKU's details, never another SKU's of the same product.
  const viewedProduct = detailed ? (products.find((product) => product.key === viewing.key) ?? null) : null
  const viewedSku = viewedProduct?.variants[viewing.sku] ?? null
  const viewed = viewedSku ? { ...viewedProduct, variants: [viewedSku] } : null

  return (
    <>
      <TableFilters
        view={filterView}
        searchPlaceholder="Search product name"
        moreFilters={moreFilters}
        moreLayout="panel"
        moreTitle="SKU Details"
        extra={expiryFilter}
        actions={actions}
      />

      {view.total === 0 ? (
        <StateMessage icon={Package} title="No matching products">
          Nothing matches the current filters.
        </StateMessage>
      ) : (
        // Wide: it scrolls sideways inside its own box, never the page, and
        // the Actions column stays pinned on the right while it does.
        <DataTable
          defaultColumnWidth={110}
          head={
            <>
              <SortableHead view={view} field="name" width={220}>
                Product Name
              </SortableHead>
              <SortableHead view={view} field="hsn" width={120}>
                HSN Code
              </SortableHead>
              <SortableHead view={view} field="group" width={140}>
                Group
              </SortableHead>
              <SortableHead view={view} field="unit" width={90}>
                Unit
              </SortableHead>
              {withCategoryAndAmount ? (
                <SortableHead view={view} field="category" width={130}>
                  Category
                </SortableHead>
              ) : null}
              <SortableHead view={view} field="quantity">
                Quantity
              </SortableHead>
              {withCategoryAndAmount ? (
                <SortableHead view={view} field="totalAmount" width={120}>
                  Total Amount
                </SortableHead>
              ) : null}
              <SortableHead view={view} field="gstRate" width={100}>
                GST Rate
              </SortableHead>
              <SortableHead view={view} field="rateSort" width={130}>
                Rate
              </SortableHead>
              {hasActions ? (
                <PlainHead width={actionsWidth} className="text-right">
                  Actions
                </PlainHead>
              ) : null}
            </>
          }
        >
          <ProductRows
            products={view.rows}
            expanded={expanded}
            closing={closing}
            selectedKey={selectedKey}
            onClosed={closed}
            detailed={detailed}
            rowEdit={rowEdit}
            pageEdit={Boolean(onEdit)}
            editDisabled={editDisabled}
            hasActions={hasActions}
            withCategoryAndAmount={withCategoryAndAmount}
            columnCount={columnCount}
            onToggle={toggle}
            onEditRow={editRow}
            onViewSku={viewSku}
            onEditSku={onEditSku}
          />
        </DataTable>
      )}

      <TablePager view={view} />

      {detailed ? (
        <ProductDetailsModal
          open={viewing.open}
          onOpenChange={(next) => setViewing((previous) => ({ ...previous, open: next }))}
          product={viewed}
          description={viewedSku ? `SKU: ${viewedSku.skuCode || `${viewing.sku + 1} (no code)`}` : undefined}
        />
      ) : null}
    </>
  )
}

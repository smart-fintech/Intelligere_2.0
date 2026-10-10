/**
 * THE PRODUCT TABLE - the one both Product pages draw.
 *
 *   [ Search product name ] [ SKU Code v ] [ Warehouse v ] [ More Filters ]  ...actions
 *   Product Name | HSN Code | Group | Unit | Quantity | GST Rate | Rate | Actions
 *   Printed Cotton Fabric | 5208 | Primary | MTR | 400 | 5 | 120 - 135 |  v  (eye)  (pencil)
 *     ...and under an opened row, its SKUs and where each one's stock is
 *
 * ONE ROW PER PRODUCT, however many SKUs it has: the row is the product's
 * own values. The rows are read from the reply in ONE place,
 * Modules/Dashboard/productList, which is also where every filter is
 * worked out - this file only draws.
 *
 * THE ARROW AND THE EYE ARE INVENTORY MANAGEMENT'S. Opening a row onto its
 * SKUs and warehouses (ProductVariantRows) and looking at a product in
 * full (ProductDetailsModal) are there only for a user who has Inventory
 * Management - useInventoryAccess, the app's one answer to that: an MSME
 * whose company's `premium_modules` lists it. For an MSME without it, and
 * for an Accounting Professional always, neither button is drawn at all -
 * no gap, no disabled stand-in - and a row's only action is the page's own
 * Edit. With no action to offer, the Actions column is not drawn either.
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
 *   SKU Code              a SKU's code; hovering a choice shows what that
 *                         SKU is made of
 *   Warehouse             a warehouse some SKU has stock in
 *   More Filters          Expiry Date, and one filter per SKU attribute the
 *                         company's products actually have
 *
 * Each exists only when the products have something to offer for it, and
 * offers only values that are really there. They work together, and Clear
 * resets them and the search at once. Everything is done on the rows
 * already loaded - no request - and the reply itself is never changed. A
 * change of filter goes back to the first page.
 *
 * Props:
 *   rows             the products as the backend sent them (useProducts)
 *   warehouseNames   optional { "<warehouse id>": "name" }, to put a name
 *                    to a warehouse the reply only gives the id of
 *   actions          optional - what sits at the right of the filter row
 *   onEdit(product)  optional. With it every row has an Edit button, and is
 *                    handed the product as productList read it
 *   editDisabled     optional - Edit is there but cannot be pressed (the
 *                    page is busy with something an edit would cut across)
 *   selectedKey      optional - the `key` of the row to tint (the one open
 *                    in a form)
 */

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, Package, Pencil } from 'lucide-react'

import { StateMessage } from '@/Components/Common/DataList'
import {
  DataTable,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import useInventoryAccess from '@/Hooks/useInventoryAccess'
import { useListView } from '@/Hooks/useListView'
import { orDash } from '@/Utils/display'
import { filterProducts, PRODUCT_FILTER, productFilterOptions, readProducts } from '../productList'
import ProductDetailsModal from './ProductDetailsModal'
import ProductVariantRows from './ProductVariantRows'

const SEARCH_FIELDS = ['name']

/** The seven columns of data, and the Actions column: the cells an opened row spans. */
const COLUMN_COUNT = 8

/** The Actions column: room for its heading, then for each button it holds. */
const ACTIONS_WIDTH = { base: 36, details: 60, edit: 36 }

export default function ProductTable({ rows, warehouseNames, actions, onEdit, editDisabled = false, selectedKey }) {
  // The arrow and the eye - see the note at the top.
  const { full: detailed } = useInventoryAccess()

  const hasActions = detailed || Boolean(onEdit)
  const actionsWidth = ACTIONS_WIDTH.base + (detailed ? ACTIONS_WIDTH.details : 0) + (onEdit ? ACTIONS_WIDTH.edit : 0)

  const products = useMemo(() => readProducts(rows, warehouseNames), [rows, warehouseNames])
  const offered = useMemo(() => productFilterOptions(products), [products])

  /* ---------------- Filters ----------------
     Kept as { field: value }. A value the products no longer offer - the
     list was read again and that SKU is gone - is not applied, so a stale
     choice can never hide every row with nothing on screen to explain it. */
  const [chosen, setChosen] = useState({})

  const filters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(chosen).filter(([field, value]) => value && offered.options[field]?.includes(value)),
      ),
    [chosen, offered],
  )

  const filtered = useMemo(() => filterProducts(products, filters), [products, filters])

  // Searching, sorting and paging - on the products the filters left.
  const view = useListView(filtered, { searchFields: SEARCH_FIELDS })

  /* What the filter row is handed: the list view's own search, sort and
     paging, with these filters in place of its plain per-column ones (which
     cannot ask "does any SKU of this product match"). */
  const filterView = {
    ...view,
    filterFields: offered.fields,
    filterOptions: offered.options,
    filterHints: offered.hints,
    filters,
    setFilter: (field, value) => {
      setChosen((previous) => ({ ...previous, [field]: value }))
      view.setPage(1)
    },
    isFiltered: view.isFiltered || Object.keys(filters).length > 0,
    clear: () => {
      setChosen({})
      view.clear()
    },
  }

  // Expiry Date and the SKU attributes go behind "More Filters": a company
  // with seven SKU fields would otherwise have a filter row three lines deep.
  const moreFilters = [PRODUCT_FILTER.EXPIRY, ...offered.attributeFields]

  /* ---------------- Opened rows, and the details dialog ---------------- */
  const [expanded, setExpanded] = useState([])
  // The key of the product in the dialog. Looked up again on every draw, so
  // the dialog shows the product as it is after a reload, not as it was.
  const [viewing, setViewing] = useState({ open: false, key: null })

  const toggle = (key) =>
    setExpanded((previous) => (previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key]))

  const viewed = detailed ? (products.find((product) => product.key === viewing.key) ?? null) : null

  return (
    <>
      <TableFilters view={filterView} searchPlaceholder="Search product name" moreFilters={moreFilters} actions={actions} />

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
              <SortableHead view={view} field="quantity">
                Quantity
              </SortableHead>
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
          {view.rows.map((product) => {
            const open = detailed && expanded.includes(product.key)
            const label = product.name || 'product'

            return (
              <Fragment key={product.key}>
                <TableRow className="text-brand" data-state={product.key === selectedKey ? 'selected' : undefined}>
                  <TableCell className="font-medium" title={product.name || undefined}>
                    {orDash(product.name)}
                  </TableCell>
                  <TableCell>{orDash(product.hsn)}</TableCell>
                  <TableCell title={product.group || undefined}>{orDash(product.group)}</TableCell>
                  <TableCell>{orDash(product.unit)}</TableCell>
                  <TableCell>{orDash(product.quantity)}</TableCell>
                  <TableCell>{orDash(product.gstRate)}</TableCell>
                  <TableCell>{orDash(product.rate)}</TableCell>
                  {hasActions ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {detailed ? (
                          <>
                            <Button
                              type="button"
                              variant="iconEdit"
                              size="icon-sm"
                              icon={open ? ChevronDown : ChevronRight}
                              tooltip={open ? 'Hide SKU and warehouse details' : 'Show SKU and warehouse details'}
                              aria-label={`${open ? 'Hide' : 'Show'} SKU and warehouse details of ${label}`}
                              aria-expanded={open}
                              onClick={() => toggle(product.key)}
                            />
                            <Button
                              type="button"
                              variant="iconEdit"
                              size="icon-sm"
                              icon={Eye}
                              tooltip="View details"
                              aria-label={`View details of ${label}`}
                              onClick={() => setViewing({ open: true, key: product.key })}
                            />
                          </>
                        ) : null}
                        {onEdit ? (
                          <Button
                            type="button"
                            variant="iconEdit"
                            size="icon-sm"
                            icon={Pencil}
                            tooltip="Edit"
                            aria-label={`Edit ${label}`}
                            disabled={editDisabled}
                            onClick={() => onEdit(product)}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>

                {/* What the row opens out into: one cell across every
                    column (see "A ROW THAT OPENS" in DataTable). */}
                {open ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMN_COUNT} wrap className="bg-muted/40 p-0">
                      <ProductVariantRows product={product} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )
          })}
        </DataTable>
      )}

      <TablePager view={view} />

      {detailed ? (
        <ProductDetailsModal
          open={viewing.open}
          onOpenChange={(next) => setViewing((previous) => ({ ...previous, open: next }))}
          product={viewed}
        />
      ) : null}
    </>
  )
}

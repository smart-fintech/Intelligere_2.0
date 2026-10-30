/**
 * The Inventory Adjustments tab of Product (Inventory Management only): the
 * stock the company has taken out of its warehouses - damaged, rejected,
 * expired, under warranty or otherwise - one adjustment at a time.
 *
 *   the list     Created At, Action, Product, SKU Code, Doc No., Doc Type,
 *                Voucher Type, Reusable, Total Price, Removed Qty - searched,
 *                filtered by Action, Reusable and From / To Date (each with
 *                its x, Clear for all), sorted and paged in the browser (no
 *                request) - and per adjustment its details (the arrow)
 *   details      the adjustment's own details and reason, and each SKU taken
 *                out of each warehouse - with where the backend took it from
 *                (`removed`: sr_no and quantity)
 *
 * WHAT REACHES THE NETWORK
 *   the tab first shown / another company   the history (useInventoryAdjustments)
 *   Refresh / Retry                         the history
 *   Search in the dialog                    POST inventory/inventory_adjustments/
 *   Save in the dialog                      POST inventory/update_inventory/, then the
 *                                           history - once, by the save - and the products
 *
 * A sub user without Create on Product Details is not offered Adjust
 * Inventory (useSectionAccess), and takes stock only out of the warehouses
 * they were given (their company record's warehouse_id).
 */

import { Fragment, useCallback, useMemo, useState } from 'react'
import { AlertCircle, FileText, Plus, RefreshCw, Scale, X } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { ADJUSTMENT_ACTIONS, ADJUSTMENT_DOC_TYPES, ADJUSTMENT_VOUCHER_TYPES, labelOf, toOptions } from '@/Constants/inventory'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useInventoryAdjustments from '@/Hooks/useInventoryAdjustments'
import { useListView } from '@/Hooks/useListView'
import useProducts from '@/Hooks/useProducts'
import useSectionAccess, { useAccessScope } from '@/Hooks/useSectionAccess'
import useWarehouses from '@/Hooks/useWarehouses'
import { cn } from '@/Library/utils'
import { NO_ADJUSTMENT_FILTERS, matchesAdjustmentFilters } from '@/Modules/Dashboard/inventoryAdjustments'
import { readProducts } from '@/Modules/Dashboard/productList'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { ExpandButton, LineGrid } from '@/Modules/SalesInvoice/History/InventorySalesOrderHistory'
import { ACCESS_SECTIONS } from '@/Services/accessService'
import { getWarehouseId } from '@/Services/inventoryService'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import InventoryAdjustmentFormModal from './InventoryAdjustmentFormModal'
import { DateFilter } from './TransferNotes'

const SEARCH_FIELDS = ['action', 'product', 'skuCode', 'docNo', 'reason']

const REUSE_OPTIONS = [
  { value: 'yes', label: 'Reusable: Yes' },
  { value: 'no', label: 'Reusable: No' },
]

/** A sub user's own warehouses - their company record's warehouse_id, as text. */
const assignedWarehouses = (company) => (Array.isArray(company?.warehouse_id) ? company.warehouse_id : company?.warehouse_id ? [company.warehouse_id] : []).map(String)

/* ---------------- What an adjustment opens out into ---------------- */

const HEADING = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const LINE_COLUMNS = [
  { key: 'name', label: 'Product Name', min: 9, fr: 1.5, value: (line) => line.name },
  { key: 'sku', label: 'SKU Code', min: 7, optional: true, value: (line) => line.skuCode },
  { key: 'hsn', label: 'HSN Code', min: 5, optional: true, value: (line) => line.hsn },
  { key: 'unit', label: 'Per Unit', min: 4.5, optional: true, value: (line) => line.unit },
  { key: 'warehouse', label: 'Warehouse', min: 8, value: (line) => line.warehouseName || line.warehouseId },
  { key: 'removeQty', label: 'Remove Qty', min: 5, right: true, value: (line) => line.removeQty },
  { key: 'shelf', label: 'Shelf', min: 4, optional: true, value: (line) => line.shelf },
  { key: 'level', label: 'Level', min: 4, optional: true, value: (line) => line.level },
  { key: 'rack', label: 'Rack No.', min: 4.5, optional: true, value: (line) => line.rackNo },
  { key: 'address', label: 'Warehouse Address', min: 9, fr: 1.5, optional: true, value: (line) => line.address },
  {
    key: 'removed',
    label: 'Taken From (Sr No. - Qty)',
    min: 8,
    optional: true,
    value: (line) => line.removed,
    show: (line) =>
      line.removed.length === 0
        ? '--'
        : line.removed.map((entry, index) => (
            <span key={`${entry.srNo}#${index}`} className="block tabular-nums">
              Sr {orDash(entry.srNo)} - {orDash(entry.quantity)}
            </span>
          )),
  },
]

function AdjustmentDetails({ adjustment }) {
  const master = [
    ['Action', adjustment.action],
    ['Product', adjustment.product],
    ['SKU Code', adjustment.skuCode ? <SkuCode code={adjustment.skuCode} details={adjustment.skuDetails} /> : ''],
    ['Reusable', adjustment.reuseText],
    ['Total Price', adjustment.totalPrice],
    ['Doc No.', adjustment.docNo],
    ['Doc Type', labelOf(ADJUSTMENT_DOC_TYPES, adjustment.docType)],
    ['Voucher Type', labelOf(ADJUSTMENT_VOUCHER_TYPES, adjustment.voucherType)],
  ]
  return (
    <div className="animate-in space-y-3 px-3 py-3 duration-200 fade-in-0 slide-in-from-top-1" data-testid="inventory-adjustment-details">
      <section className="space-y-1.5">
        <p className={HEADING}>Adjustment Details</p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-border bg-card p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {master.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{value || '--'}</dd>
            </div>
          ))}
          <div className="min-w-0 sm:col-span-2 lg:col-span-4">
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="font-medium whitespace-pre-line [overflow-wrap:anywhere]">{orDash(adjustment.reason)}</dd>
          </div>
        </dl>
      </section>
      <section className="space-y-1.5">
        <p className={HEADING}>Removed Stock ({adjustment.lines.length})</p>
        {adjustment.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">No products came with this adjustment.</p>
        ) : (
          <LineGrid columns={LINE_COLUMNS} items={adjustment.lines} label="Stock removed by this adjustment" testId="inventory-adjustment-line" />
        )}
      </section>
    </div>
  )
}

/* ---------------- The dialog, with the product list it needs ---------------- */

/** Mounted only while the dialog is wanted, so the product list is asked for (or reused) only then. */
function AdjustmentDialog(props) {
  const productRows = useProducts()
  const list = useMemo(() => readProducts(productRows.rows), [productRows.rows])
  return <InventoryAdjustmentFormModal {...props} products={{ list, status: productRows.status }} />
}

/* ---------------- The page ---------------- */

export default function InventoryAdjustments() {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const { subUser } = useAccessScope()
  const access = useSectionAccess(ACCESS_SECTIONS.PRODUCT)
  const adjustments = useInventoryAdjustments()
  const loading = adjustments.status === 'loading'

  const assigned = useMemo(() => assignedWarehouses(activeCompany), [activeCompany])
  // A warehouse's own address and email go with each line saved - read from the shared list.
  const { warehouses } = useWarehouses()
  const warehouseDetails = useCallback(
    (id) => {
      const found = warehouses.find((warehouse) => String(getWarehouseId(warehouse)) === String(id))
      return { address: found?.warehouse_address ?? '', email: found?.email ?? '' }
    },
    [warehouses],
  )

  /* ---------------- Search, filters, sort, pages ----------------
     The history endpoint takes nothing to filter by, so these run on the
     records already loaded - no request. All of them together. */
  const [filters, setFilters] = useState(NO_ADJUSTMENT_FILTERS)
  const [dateError, setDateError] = useState('')
  const filtered = useMemo(() => adjustments.rows.filter((adjustment) => matchesAdjustmentFilters(adjustment, filters)), [adjustments.rows, filters])
  const view = useListView(filtered, { searchFields: SEARCH_FIELDS })
  const changeFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }))
    view.setPage(1)
  }
  const changeDate = (field, value) => {
    const next = { ...filters, [field]: value }
    if (next.fromDate && next.toDate && next.toDate < next.fromDate) {
      setDateError('To Date cannot be earlier than From Date.')
      return
    }
    setDateError('')
    changeFilter(field, value)
  }
  const filtersSet = Object.values(filters).some(Boolean)
  const clearFilters = () => {
    setFilters(NO_ADJUSTMENT_FILTERS)
    setDateError('')
    view.clear()
  }
  const filterView = { ...view, isFiltered: view.isFiltered || filtersSet, clear: clearFilters }

  // Each adjustment open or not, by its key - kept across pages.
  const [openRows, setOpenRows] = useState(() => new Set())
  const toggle = (key) =>
    setOpenRows((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // The table's visible width: an opened row's details are kept to it, however far the table is scrolled.
  const [visibleWidth, setVisibleWidth] = useState(null)
  const measureTable = useCallback((box) => {
    if (!box) return undefined
    const observer = new ResizeObserver(([entry]) => setVisibleWidth(Math.floor(entry.contentRect.width)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  /* ---------------- The dialog ----------------
     `session` changes on every opening and is the dialog's key, so each one
     starts from fresh values. */
  const [dialog, setDialog] = useState({ open: false, session: 0 })
  const openDialog = () => setDialog((current) => ({ open: true, session: current.session + 1 }))
  const closeDialog = () => setDialog((current) => ({ ...current, open: false }))

  const createButton = access.create ? (
    <Button type="button" size="sm" icon={Plus} onClick={openDialog} disabled={!companyName || (subUser && assigned.length === 0)}>
      Adjust Inventory
    </Button>
  ) : null

  const renderList = () => {
    if (adjustments.status === 'failed' && adjustments.rows.length === 0) {
      return (
        <StateMessage icon={AlertCircle} tone="error" title="Could not load the inventory adjustments" action={<RetryButton onClick={adjustments.reload} />}>
          {adjustments.error}
        </StateMessage>
      )
    }
    if ((loading || adjustments.status === 'idle') && adjustments.rows.length === 0) return <ListSkeleton rows={5} />
    if (adjustments.rows.length === 0) {
      return (
        <StateMessage icon={Scale} title="No inventory adjustments yet" action={createButton}>
          Stock taken out of a warehouse - damaged, rejected, expired - shows here.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={filterView}
          searchPlaceholder="Search action, product, SKU, doc no. or reason"
          actions={createButton}
          extra={
            <>
              <SelectField
                ariaLabel="Action"
                size="sm"
                className="w-full sm:w-36"
                value={filters.action}
                onValueChange={(value) => changeFilter('action', value)}
                onClear={() => changeFilter('action', '')}
                placeholder="Action"
                options={toOptions(ADJUSTMENT_ACTIONS)}
              />
              <SelectField
                ariaLabel="Reusable"
                size="sm"
                className="w-full sm:w-40"
                value={filters.reuse}
                onValueChange={(value) => changeFilter('reuse', value)}
                onClear={() => changeFilter('reuse', '')}
                placeholder="Reusable"
                options={REUSE_OPTIONS}
              />
              <DateFilter label="From Date" value={filters.fromDate} max={filters.toDate} onChange={(value) => changeDate('fromDate', value)} />
              <DateFilter label="To Date" value={filters.toDate} min={filters.fromDate} onChange={(value) => changeDate('toDate', value)} />
            </>
          }
        />
        {dateError ? (
          <p className="-mt-1.5 mb-2 text-xs text-destructive" role="alert">
            {dateError}
          </p>
        ) : null}

        {view.total === 0 ? (
          <StateMessage
            icon={FileText}
            title="No matching adjustments"
            action={
              <Button type="button" size="sm" variant="outline" icon={X} onClick={clearFilters}>
                Clear Filters
              </Button>
            }
          >
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <div className="text-brand" ref={measureTable}>
            <DataTable
              head={
                <>
                  <SortableHead view={view} field="createdAt" width={120}>
                    Created At
                  </SortableHead>
                  <SortableHead view={view} field="action" width={110}>
                    Action
                  </SortableHead>
                  <SortableHead view={view} field="product" width={180}>
                    Product
                  </SortableHead>
                  <SortableHead view={view} field="skuCode" width={150}>
                    SKU Code
                  </SortableHead>
                  <SortableHead view={view} field="docNo" width={130}>
                    Doc No.
                  </SortableHead>
                  <SortableHead view={view} field="docType" width={120}>
                    Doc Type
                  </SortableHead>
                  <SortableHead view={view} field="voucherType" width={120}>
                    Voucher Type
                  </SortableHead>
                  <SortableHead view={view} field="reuseText" width={100}>
                    Reusable
                  </SortableHead>
                  <SortableHead view={view} field="totalPrice" width={110}>
                    Total Price
                  </SortableHead>
                  <SortableHead view={view} field="removedQty" width={120}>
                    Removed Qty
                  </SortableHead>
                  <PlainHead width={80} className="text-right">
                    Details
                  </PlainHead>
                </>
              }
            >
              {view.rows.map((adjustment) => {
                const open = openRows.has(adjustment.key)
                return (
                  <Fragment key={adjustment.key}>
                    <TableRow className={cn('transition-opacity', loading && 'opacity-60')} data-testid="inventory-adjustment-row">
                      <TableCell className="whitespace-nowrap">{formatDate(adjustment.createdAt)}</TableCell>
                      <TableCell className="font-medium">{orDash(adjustment.action)}</TableCell>
                      <TableCell title={adjustment.product}>{orDash(adjustment.product)}</TableCell>
                      <TableCell>{adjustment.skuCode ? <SkuCode code={adjustment.skuCode} details={adjustment.skuDetails} /> : '--'}</TableCell>
                      <TableCell>{orDash(adjustment.docNo)}</TableCell>
                      <TableCell>{orDash(labelOf(ADJUSTMENT_DOC_TYPES, adjustment.docType))}</TableCell>
                      <TableCell>{orDash(labelOf(ADJUSTMENT_VOUCHER_TYPES, adjustment.voucherType))}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-medium',
                            adjustment.reuse ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {adjustment.reuseText}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{adjustment.totalPrice ? Number(adjustment.totalPrice).toFixed(2) : '--'}</TableCell>
                      <TableCell className="tabular-nums">{adjustment.removedQty}</TableCell>
                      <TableCell className="text-right">
                        <ExpandButton open={open} label={`the details of this ${adjustment.action ? `${adjustment.action} ` : ''}adjustment`} onClick={() => toggle(adjustment.key)} />
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={11} wrap className="overflow-visible! bg-muted/40 p-0 py-0!">
                          <div className="sticky left-0" style={visibleWidth ? { width: visibleWidth - 2 } : undefined}>
                            <AdjustmentDetails adjustment={adjustment} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </DataTable>
          </div>
        )}

        <TablePager view={view} />
      </>
    )
  }

  if (!companyName) {
    return (
      <Panel title="Inventory Adjustments">
        <StateMessage icon={Scale} title="No company selected">
          Choose a company in the header to see its inventory adjustments.
        </StateMessage>
      </Panel>
    )
  }

  return (
    <>
      <Panel
        title="Inventory Adjustments"
        meta={adjustments.rows.length > 0 ? `(Total Count: ${adjustments.rows.length})` : undefined}
        actions={
          <Button type="button" size="sm" onClick={adjustments.reload} disabled={loading} aria-label="Refresh inventory adjustments">
            <RefreshCw className={cn(loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      >
        {/* A failed refresh with records still on screen: they stay, and this says why they have not changed. */}
        {adjustments.status === 'failed' && adjustments.rows.length > 0 ? <InlineAlert action={<RetryButton onClick={adjustments.reload} />}>{adjustments.error}</InlineAlert> : null}
        {renderList()}
      </Panel>

      {dialog.session > 0 ? (
        <AdjustmentDialog
          key={dialog.session}
          open={dialog.open}
          onOpenChange={(next) => {
            if (!next) closeDialog()
          }}
          companyName={companyName}
          allowedWarehouses={subUser ? assigned : null}
          warehouseDetails={warehouseDetails}
          onSaved={closeDialog}
        />
      ) : null}
    </>
  )
}

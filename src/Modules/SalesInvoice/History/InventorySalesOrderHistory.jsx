import { Fragment, useCallback, useMemo, useState } from 'react'
import { AlertCircle, ChevronRight, Eye, FileText } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { DataTable, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useListView } from '@/Hooks/useListView'
import useWarehouses from '@/Hooks/useWarehouses'
import { cn } from '@/Library/utils'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import HistoryPdfModal from '@/Modules/SalesInvoice/History/HistoryPdfModal'
import SalesOrderProcessModal from '@/Modules/SalesInvoice/History/SalesOrderProcessModal'
import { statusText } from '@/Modules/SalesInvoice/History/inventorySalesOrders'
import useInventorySalesOrders from '@/Modules/SalesInvoice/History/useInventorySalesOrders'
import { getWarehouseId } from '@/Services/inventoryService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * INVENTORY SALES ORDER - the History's second view of Sales Orders (the
 * radio beside Document Type, for a company with Inventory Management):
 * inventory/sales_order_history/, asked once this view is chosen.
 *
 *   table     S.No., Buyer Name, SO Number, SO Date, Booking Status, Process
 *             (a booked order: Book Process - none yet - or Show Process, with
 *             its share done; it opens SalesOrderProcessModal), PDF (the
 *             order's so_pdf, as sent, in the History's PDF modal), Details
 *             (the arrow)
 *   details   what a row opens out into, three sections:
 *               Booked Product Details    booked_inventory - Product, SKU Code
 *                                         (its SKU Details on hover), Category,
 *                                         the quantities and the warehouses
 *                                         booked from
 *               Outbound Purchase Orders  OPO - each one's master_details (No.,
 *               Inbound Challans          IC    Date, Buyer, PDF) with its own
 *                                               arrow to its product_details
 *             A section with nothing says so; a column no line has a value for
 *             is left out.
 *
 * Plain boxes in grids, not <table>s, inside the opened row - the history
 * table's rules reach every cell beneath it (see DataTable).
 *
 *   company   the active company's record - its comp_name is what is asked
 *             for, its company_id names the warehouses booked from (asked
 *             only once an opened order needs their names)
 */

const HEADING = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const CELL = 'min-w-0 [overflow-wrap:anywhere]'

const quantity = (value) => (value === null ? '--' : String(Number(value.toFixed(3))))
const money = (value) => (value === null ? '--' : formatIndianCurrency(value))
const filled = (value) => value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)

/** One arrow, turning as what it opens opens and closes. */
function ExpandButton({ open, label, onClick }) {
  return (
    <Button
      type="button"
      variant="iconEdit"
      size="icon-sm"
      icon={ChevronRight}
      className={cn('[&_svg]:transition-transform [&_svg]:duration-200', open && '[&_svg]:rotate-90')}
      tooltip={open ? 'Hide details' : 'Show details'}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      aria-expanded={open}
      onClick={onClick}
    />
  )
}

function PdfButton({ label, onClick }) {
  return <Button type="button" variant="iconEdit" size="icon-sm" icon={Eye} tooltip="View PDF" aria-label={`View PDF of ${label}`} onClick={onClick} />
}

/**
 * Lines in a grid with their headings - one template for both, so they line
 * up. `columns`: [{ key, label, min (rem), fr, right, value(item), show(item)?,
 * optional }]; an optional column is shown only when a line has a value for it.
 */
function LineGrid({ columns, items, label, testId }) {
  const shown = columns.filter((column) => !column.optional || items.some((item) => filled(column.value(item))))
  const gridTemplateColumns = shown.map((column) => `minmax(${column.min}rem,${column.fr ?? 1}fr)`).join(' ')
  const minWidth = `${shown.reduce((total, column) => total + column.min, 0) + (shown.length - 1) * 0.75 + 1.5}rem`
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card" role="region" aria-label={label}>
      <div className="px-3" style={{ minWidth }}>
        <div className={cn('grid gap-x-3 border-b border-border py-1.5', HEADING)} style={{ gridTemplateColumns }}>
          {shown.map((column) => (
            <span key={column.key} className={cn(CELL, column.right && 'text-right')}>
              {column.label}
            </span>
          ))}
        </div>
        {items.map((item, index) => (
          <div key={item.key} className={cn('grid items-start gap-x-3 py-1.5 text-xs', index > 0 && 'border-t border-border/60')} style={{ gridTemplateColumns }} data-testid={testId}>
            {shown.map((column) => {
              const value = column.value(item)
              return (
                <span key={column.key} className={cn(CELL, column.right && 'text-right tabular-nums')}>
                  {column.show ? column.show(item) : filled(value) ? value : '--'}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** A section of the opened row - its heading, then its lines or that there are none. */
function Section({ title, count, empty, children }) {
  return (
    <section className="space-y-1.5" aria-label={title}>
      <p className={HEADING}>
        {title} ({count})
      </p>
      {count === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : children}
    </section>
  )
}

const bookedColumns = (warehouseName) => [
  { key: 'name', label: 'Product Name', min: 10, fr: 2, value: (item) => item.name },
  // Its sku_details on hover (the shared SKU tooltip) - each line its own.
  { key: 'sku', label: 'SKU Code', min: 7, value: (item) => item.skuCode, optional: true, show: (item) => <SkuCode code={item.skuCode} details={Object.fromEntries(item.skuDetails)} /> },
  { key: 'category', label: 'Category', min: 6, value: (item) => item.category, optional: true },
  { key: 'order', label: 'Order Qty', min: 5, right: true, optional: true, value: (item) => item.orderQty, show: (item) => quantity(item.orderQty) },
  { key: 'booked', label: 'Booked Qty', min: 5, right: true, optional: true, value: (item) => item.bookedQty, show: (item) => quantity(item.bookedQty) },
  { key: 'required', label: 'Required Qty', min: 5.5, right: true, optional: true, value: (item) => item.requiredQty, show: (item) => quantity(item.requiredQty) },
  { key: 'min', label: 'Min Qty', min: 4.5, right: true, optional: true, value: (item) => item.minQty, show: (item) => quantity(item.minQty) },
  {
    key: 'warehouses',
    label: 'Warehouse - Booked',
    min: 10,
    fr: 1.5,
    optional: true,
    value: (item) => item.warehouses,
    show: (item) =>
      item.warehouses.length === 0
        ? '--'
        : item.warehouses.map((warehouse, index) => (
            <span key={`${warehouse.id}#${index}`} className="block">
              {warehouse.name || warehouseName(warehouse.id)}: <span className="tabular-nums">{quantity(warehouse.qty)}</span>
            </span>
          )),
  },
]

const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Product Name', min: 10, fr: 2, value: (product) => product.name },
  { key: 'quantity', label: 'Quantity', min: 5, right: true, optional: true, value: (product) => product.quantity, show: (product) => quantity(product.quantity) },
  { key: 'rate', label: 'Rate', min: 6, right: true, optional: true, value: (product) => product.rate, show: (product) => money(product.rate) },
  { key: 'hsn', label: 'HSN', min: 5, optional: true, value: (product) => product.hsn },
  { key: 'remain', label: 'Remaining Qty', min: 6, right: true, optional: true, value: (product) => product.remainQty, show: (product) => quantity(product.remainQty) },
  { key: 'amount', label: 'Amount', min: 7, right: true, optional: true, value: (product) => product.amount, show: (product) => money(product.amount) },
]

const DOCUMENT_GRID = { gridTemplateColumns: 'minmax(8rem,1.2fr) minmax(6.5rem,0.8fr) minmax(10rem,2fr) 3rem 5.5rem' }

/** The OPOs (or ICs) of one order - each with its PDF and an arrow to its products. */
function LinkedDocuments({ documents, kind, onViewPdf }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (key) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card" role="region" aria-label={kind}>
      <div className="min-w-[36rem] px-3">
        <div className={cn('grid gap-x-3 border-b border-border py-1.5', HEADING)} style={DOCUMENT_GRID}>
          <span className={CELL}>Document No.</span>
          <span className={CELL}>Date</span>
          <span className={CELL}>Buyer Name</span>
          <span className="text-center">PDF</span>
          <span className="text-center">Products</span>
        </div>
        {documents.map((document, index) => {
          const isOpen = open.has(document.key)
          const name = document.docNo || kind
          return (
            <div key={document.key} className={cn(index > 0 && 'border-t border-border/60')} data-testid="inventory-so-linked">
              <div className="grid items-center gap-x-3 py-1 text-xs" style={DOCUMENT_GRID}>
                <span className={cn(CELL, 'font-medium')}>{document.docNo || '--'}</span>
                <span className={CELL}>{document.docDate ? formatDate(document.docDate) : '--'}</span>
                <span className={CELL}>{document.buyerName || '--'}</span>
                <span className="text-center">
                  <PdfButton label={name} onClick={() => onViewPdf({ documentNo: name, pdfUrl: document.pdfUrl, buyerName: document.buyerName, documentDate: document.docDate })} />
                </span>
                <span className="text-center">
                  <ExpandButton open={isOpen} label={`the products of ${name}`} onClick={() => toggle(document.key)} />
                </span>
              </div>
              {isOpen ? (
                <div className="pb-2">
                  {document.products.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No product details came with {name}.</p>
                  ) : (
                    <LineGrid columns={PRODUCT_COLUMNS} items={document.products} label={`Products of ${name}`} testId="inventory-so-linked-product" />
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** What an order's row opens out into. */
function OrderDetails({ order, warehouseName, onViewPdf }) {
  return (
    <div className="space-y-3 px-3 py-3" data-testid="inventory-so-details">
      <Section title="Booked Product Details" count={order.booked.length} empty="No products are booked for this order.">
        <LineGrid columns={bookedColumns(warehouseName)} items={order.booked} label={`Booked products of ${order.soNo || 'the order'}`} testId="inventory-so-booked" />
      </Section>
      <Section title="Outbound Purchase Orders (OPO)" count={order.opo.length} empty="No outbound purchase orders yet.">
        <LinkedDocuments documents={order.opo} kind="Outbound Purchase Order" onViewPdf={onViewPdf} />
      </Section>
      <Section title="Inbound Challans (IC)" count={order.ic.length} empty="No inbound challans yet.">
        <LinkedDocuments documents={order.ic} kind="Inbound Challan" onViewPdf={onViewPdf} />
      </Section>
    </div>
  )
}

const COLUMNS = [
  { key: 'serial', width: 70, head: 'S.No.', cell: (order, ctx) => ctx.serial, cellClass: 'tabular-nums text-brand-muted' },
  { key: 'buyer', width: 220, head: 'Buyer Name', cell: (order) => order.buyerName || '--', cellClass: 'truncate font-medium' },
  { key: 'soNo', width: 170, head: 'SO Number', cell: (order) => order.soNo || '--', cellClass: 'truncate' },
  { key: 'soDate', width: 120, head: 'SO Date', cell: (order) => (order.soDate ? formatDate(order.soDate) : '--'), cellClass: 'whitespace-nowrap' },
  {
    key: 'status',
    width: 150,
    head: 'Booking Status',
    cell: (order) =>
      order.bookedStatus ? (
        <span className={cn('rounded-full px-2 py-0.5 text-xs', order.bookedStatus.toLowerCase() === 'booked' ? 'bg-brand-soft text-brand' : 'bg-muted text-foreground')}>
          {statusText(order.bookedStatus)}
        </span>
      ) : (
        '--'
      ),
  },
  {
    key: 'process',
    width: 160,
    head: 'Process',
    // A booked order: Book Process (none yet) or Show Process - with its share done once it has one.
    cell: (order, ctx) =>
      order.bookedStatus.toLowerCase() === 'booked' ? (
        <span className="inline-flex flex-col items-start gap-0.5">
          <Button type="button" size="xs" onClick={() => ctx.openProcess(order)} aria-label={`${order.hasProcess ? 'Show' : 'Book'} process of ${order.soNo || 'this Sales Order'}`}>
            {order.hasProcess ? 'Show Process' : 'Book Process'}
          </Button>
          {order.hasProcess && order.processDone !== null ? <span className="text-[11px] text-muted-foreground tabular-nums">{quantity(order.processDone)}% done</span> : null}
        </span>
      ) : order.process ? (
        `${statusText(order.process)}${order.processDone !== null ? ` (${quantity(order.processDone)}%)` : ''}`
      ) : (
        '--'
      ),
  },
  { key: 'pdf', width: 70, head: 'PDF', align: 'center', cell: (order, ctx) => <PdfButton label={order.soNo || 'the Sales Order'} onClick={() => ctx.viewPdf(order)} /> },
  {
    key: 'details',
    width: 90,
    head: 'Details',
    align: 'center',
    cell: (order, ctx) => <ExpandButton open={ctx.open} label={`the details of ${order.soNo || 'this Sales Order'}`} onClick={() => ctx.toggle(order.key)} />,
  },
]

export default function InventorySalesOrderHistory({ company }) {
  const orders = useInventorySalesOrders(company.comp_name)
  const view = useListView(orders.rows)

  // { documentNo, pdfUrl, buyerName, documentDate } - the PDF shown, an order's or an OPO / IC's.
  const [pdf, setPdf] = useState(null)

  // Each order open or not, by its key - kept across pages.
  const [openRows, setOpenRows] = useState(() => new Set())
  const toggle = (key) =>
    setOpenRows((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /*
   * The warehouses' names. A booking names its warehouses by id only
   * (booked_inventory's warehouse: [{ warehouse_id, book_qty }]), so their
   * names come from the company's warehouse list (inventory/warehouse_create/
   * with { company_id } - the list, nothing is created). The shared list
   * (useWarehouses): asked only when an opened order books from a warehouse
   * the history does not name, and not at all when another screen has it;
   * without it (or refused), the ids show.
   */
  const needsNames = orders.rows.some((order) => openRows.has(order.key) && order.booked.some((item) => item.warehouses.some((warehouse) => warehouse.id && !warehouse.name)))
  // Only this company's list (useWarehouses keeps each company's apart); refused, only the names are missing.
  const { warehouses } = useWarehouses(needsNames, company.company_id)
  const namesById = useMemo(() => new Map(warehouses.map((record) => [String(getWarehouseId(record) ?? record.id ?? ''), String(record.name ?? record.warehouse_name ?? '').trim()])), [warehouses])
  const warehouseName = (id) => namesById.get(String(id)) || (id ? `Warehouse ${id}` : 'Warehouse')

  // The table's visible width: an opened row's details are kept to it, however far the table is scrolled.
  const [visibleWidth, setVisibleWidth] = useState(null)
  const measureTable = useCallback((box) => {
    if (!box) return undefined
    const observer = new ResizeObserver(([entry]) => setVisibleWidth(Math.floor(entry.contentRect.width)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The order whose process is open (SalesOrderProcessModal) - one at a time.
  const [processOrder, setProcessOrder] = useState(null)

  const context = {
    toggle,
    openProcess: setProcessOrder,
    viewPdf: (order) => setPdf({ documentNo: order.soNo || 'Sales Order', pdfUrl: order.pdfUrl, buyerName: order.buyerName, documentDate: order.soDate }),
  }

  return (
    <Card className="border-border/70 py-3 shadow-sm" data-testid="inventory-sales-orders">
      <CardContent className="px-3">
        {orders.status === 'failed' && orders.rows.length === 0 ? (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the Sales Orders" action={<RetryButton onClick={orders.reload} />}>
            {orders.error}
          </StateMessage>
        ) : (orders.status === 'loading' || orders.status === 'idle') && orders.rows.length === 0 ? (
          <ListSkeleton rows={5} />
        ) : orders.rows.length === 0 ? (
          <StateMessage icon={FileText} title="No inventory Sales Orders yet">
            Sales Orders whose inventory is managed show here once they are saved.
          </StateMessage>
        ) : (
          <div className="space-y-3">
            {orders.status === 'failed' ? <InlineAlert action={<RetryButton onClick={orders.reload} />}>{orders.error}</InlineAlert> : null}
            <div className="text-brand" ref={measureTable}>
              <DataTable
                head={COLUMNS.map((column) => (
                  <PlainHead key={column.key} width={column.width} className={cn('text-brand', column.align === 'center' && 'text-center')}>
                    {column.head}
                  </PlainHead>
                ))}
              >
                {view.rows.map((order, index) => {
                  const open = openRows.has(order.key)
                  const pageSize = Number(view.pageSize) || view.rows.length
                  const cellContext = { ...context, open, serial: (view.page - 1) * pageSize + index + 1 }
                  return (
                    <Fragment key={order.key}>
                      <TableRow className={cn(orders.status === 'loading' && 'opacity-60')} data-testid="inventory-so-row">
                        {COLUMNS.map((column) => (
                          <TableCell key={column.key} className={cn(column.align === 'center' && 'text-center', column.cellClass)}>
                            {column.cell(order, cellContext)}
                          </TableCell>
                        ))}
                      </TableRow>
                      {open ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={COLUMNS.length} wrap className="overflow-visible! bg-muted/40 p-0 py-0!">
                            <div className="sticky left-0" style={visibleWidth ? { width: visibleWidth - 2 } : undefined}>
                              <OrderDetails order={order} warehouseName={warehouseName} onViewPdf={setPdf} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </DataTable>
            </div>
            <TablePager view={view} />
          </div>
        )}
      </CardContent>
      <HistoryPdfModal row={pdf} onClose={() => setPdf(null)} />
      {processOrder ? (
        <SalesOrderProcessModal
          key={processOrder.key}
          companyName={company.comp_name}
          order={processOrder}
          onClose={() => setProcessOrder(null)}
          // Its process status and share done change - the list is read again.
          onSaved={orders.reload}
        />
      ) : null}
    </Card>
  )
}

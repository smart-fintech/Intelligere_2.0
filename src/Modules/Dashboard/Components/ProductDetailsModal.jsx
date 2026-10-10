/**
 * The Product Details dialog - everything the backend holds about one
 * product, opened from the eye on its row. Read-only.
 *
 * Five tabs, so nothing is one long page:
 *
 *   General                  the product itself
 *   SKU Variants             each SKU: its code, what it is made of, its
 *                            rate, quantity, dates and any other field it
 *                            carries
 *   Warehouse                where each SKU's stock is kept
 *   Vendor                   who it is bought from
 *   Materials & References   what it is made from, in two sections:
 *                              Raw References            (raw_reference)
 *                              Semi-Finished References  (semi_finished_reference)
 *
 * A tab says how many things it holds, so an empty one is known to be empty
 * before it is opened - and says so plainly when it is.
 *
 * MATERIALS & REFERENCES GOES BY THE PRODUCT'S CATEGORY. Only a Finished
 * product is made from other goods, so only a Finished product has the two
 * sections - each one drawn even when it is empty, saying so. For a
 * Semi-Finished or Raw Material product (or any other category) neither
 * section is drawn; the tab says why instead. The rule itself is
 * hasMaterialReferences, in productList.
 *
 * IT NAMES NO FIELD OF THE COMPANY'S. A SKU's attributes, a product's extra
 * fields and the columns of a reference are whatever the reply carries:
 * each part shows the properties it knows, then every other one it was sent
 * (`others`, see productList) - so a field added to the reply appears here
 * by itself. Deleted entries were already left out when the list was read.
 *
 * Opened only by a user with Inventory Management - the eye that opens it
 * is not drawn for anyone else (see ProductTable).
 *
 * Props:
 *   open, onOpenChange   controlled by the product table, the same as Modal
 *   product              the product, as readProducts gives it - or null
 */

import { useState } from 'react'

import { DetailItem, DetailList } from '@/Components/Common/DetailList'
import { Modal } from '@/Components/Common/Modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'
import { displayValue, fieldLabel, hasMaterialReferences, variantWarehouses } from '../productList'

/* ------------------------------------------------------------------ */
/* Small pieces                                                       */
/* ------------------------------------------------------------------ */

/** A tab with nothing in it. */
function Empty({ children }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** What a SKU is called in a heading: its code, or its place when it has none. */
const variantTitle = (variant, index, count) =>
  variant.skuCode || (count > 1 ? `SKU ${index + 1}` : 'Product')

/** A heading over one SKU's part of a tab - only worth drawing when there are several. */
function VariantHeading({ variant, index, count }) {
  if (count <= 1 && !variant.skuCode) return null

  return <h4 className="text-xs font-semibold text-brand">{variantTitle(variant, index, count)}</h4>
}

/** `others` as detail rows - the fields nobody listed, shown all the same. */
const otherItems = (others) =>
  others.map(({ key, label, value }) => (
    <DetailItem key={key} label={label}>
      {displayValue(value)}
    </DetailItem>
  ))

/**
 * A plain table for a tab: `columns` is [{ key, label }], `rows` a list of
 * objects read by those keys. Cells wrap, so a long value is read in full.
 */
function SimpleTable({ columns, rows }) {
  return (
    <Table containerClassName="rounded-md border border-border">
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">
          {columns.map(({ key, label }) => (
            <TableHead key={key} className="h-8 text-xs font-semibold tracking-wide uppercase">
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index} className="hover:bg-transparent">
            {columns.map(({ key }) => (
              <TableCell key={key} wrap className="py-2 text-sm">
                {displayValue(row[key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * The columns of some objects nobody has described: every property any of
 * them has, the ones in `first` leading in that order.
 */
const columnsOf = (entries, first = []) => {
  const keys = [...new Set(entries.flatMap((entry) => Object.keys(entry)))]
  const ordered = [...first.filter((key) => keys.includes(key)), ...keys.filter((key) => !first.includes(key))]

  return ordered.map((key) => ({ key, label: fieldLabel(key) }))
}

/** Only the objects of a list - a reference written as a bare value becomes { value }. */
const asObjects = (entries) =>
  entries.map((entry) => (entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry : { value: entry }))

/* ------------------------------------------------------------------ */
/* The tabs                                                           */
/* ------------------------------------------------------------------ */

function GeneralTab({ product }) {
  return (
    <DetailList>
      <DetailItem label="Product Name">{product.name}</DetailItem>
      <DetailItem label="Group">{product.group}</DetailItem>
      <DetailItem label="HSN Code">{product.hsn}</DetailItem>
      <DetailItem label="Category">{product.category}</DetailItem>
      <DetailItem label="Per Unit">{product.unit}</DetailItem>
      <DetailItem label="GST Rate">{product.gstRate}</DetailItem>
      <DetailItem label="Total Quantity">{displayValue(product.quantity)}</DetailItem>
      <DetailItem label="Total Amount">{displayValue(product.totalAmount)}</DetailItem>
      <DetailItem label="Selling Price">{product.sellingPrice}</DetailItem>
      {otherItems(product.others)}
    </DetailList>
  )
}

function VariantsTab({ product }) {
  if (product.variants.length === 0) return <Empty>This product has no SKU variants.</Empty>

  return (
    <div className="space-y-4">
      {product.variants.map((variant, index) => (
        <section key={index} className="space-y-2">
          <VariantHeading variant={variant} index={index} count={product.variants.length} />

          <DetailList>
            <DetailItem label="SKU Code">{variant.skuCode}</DetailItem>
            {/* What this SKU is made of - the company's own SKU fields. */}
            {variant.skuDetails.map(([name, value]) => (
              <DetailItem key={name} label={name}>
                {displayValue(value)}
              </DetailItem>
            ))}
            <DetailItem label="SKU Quantity">{displayValue(variant.totalQty)}</DetailItem>
            <DetailItem label="SKU Amount">{displayValue(variant.totalAmount)}</DetailItem>
            <DetailItem label="Selling Price">{displayValue(variant.sellingPrice)}</DetailItem>
            {otherItems(variant.others)}
          </DetailList>

          {/* Its entries: a rate, a quantity, its dates - and whatever
              other fields the entry was saved with. */}
          {variant.details.map((detail, detailIndex) => (
            <DetailList key={detailIndex}>
              <DetailItem label="Unit Rate">{displayValue(detail.unitRate)}</DetailItem>
              <DetailItem label="Product Quantity">{displayValue(detail.quantity)}</DetailItem>
              <DetailItem label="Expiry Date">{formatDate(detail.expiryDate)}</DetailItem>
              {otherItems(detail.others)}
            </DetailList>
          ))}
        </section>
      ))}
    </div>
  )
}

const WAREHOUSE_COLUMNS = [
  { key: 'name', label: 'Warehouse Name' },
  { key: 'id', label: 'Warehouse ID' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'level', label: 'Level' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'rackNo', label: 'Rack No.' },
]

function WarehouseTab({ product }) {
  const stocked = product.variants.filter((variant) => variantWarehouses(variant).length > 0)
  if (stocked.length === 0) return <Empty>No warehouse allocation for this product.</Empty>

  return (
    <div className="space-y-4">
      {product.variants.map((variant, index) => {
        const warehouses = variantWarehouses(variant)
        if (warehouses.length === 0) return null

        return (
          <section key={index} className="space-y-2">
            <VariantHeading variant={variant} index={index} count={product.variants.length} />
            <SimpleTable columns={WAREHOUSE_COLUMNS} rows={warehouses} />
          </section>
        )
      })}
    </div>
  )
}

/**
 * A list each SKU carries - vendors, raw materials, semi-finished goods -
 * as one table per SKU that has any. The columns are the entries' own
 * properties; `first` only says which ones lead.
 */
function ReferenceTab({ product, read, first, empty }) {
  const count = product.variants.reduce((total, variant) => total + read(variant).length, 0)
  if (count === 0) return <Empty>{empty}</Empty>

  return (
    <div className="space-y-4">
      {product.variants.map((variant, index) => {
        const entries = asObjects(read(variant))
        if (entries.length === 0) return null

        return (
          <section key={index} className="space-y-2">
            <VariantHeading variant={variant} index={index} count={product.variants.length} />
            <SimpleTable columns={columnsOf(entries, first)} rows={entries} />
          </section>
        )
      })}
    </div>
  )
}

/** The properties that lead a reference's columns, when it has them. */
const REFERENCE_FIRST = ['product_name', 'id', 'product_id', 'sku_code', 'quantity', 'wastage', 'sku_details']

const countOf = (product, read) => product.variants.reduce((total, variant) => total + read(variant).length, 0)

/** The two kinds of reference a Finished product has - one section of the tab each. */
const REFERENCE_SECTIONS = [
  {
    key: 'raw',
    title: 'Raw References',
    read: (variant) => variant.rawReferences,
    empty: 'No raw references for this product.',
  },
  {
    key: 'semi',
    title: 'Semi-Finished References',
    read: (variant) => variant.semiFinishedReferences,
    empty: 'No semi-finished references for this product.',
  },
]

/**
 * Materials & References: the raw and the semi-finished references, one
 * section under the other - for a Finished product only (see the note at
 * the top). Each section is the same per-SKU table the Vendor tab draws.
 */
function MaterialsTab({ product }) {
  if (!hasMaterialReferences(product)) {
    return (
      <Empty>
        {product.category
          ? `Raw and semi-finished references apply to Finished products only. This product is ${product.category}.`
          : 'Raw and semi-finished references apply to Finished products only.'}
      </Empty>
    )
  }

  return (
    <div className="space-y-5">
      {REFERENCE_SECTIONS.map(({ key, title, read, empty }) => (
        <section key={key} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {title} <span className="font-normal text-muted-foreground">({countOf(product, read)})</span>
          </h3>
          <ReferenceTab product={product} read={read} first={REFERENCE_FIRST} empty={empty} />
        </section>
      ))}
    </div>
  )
}

const TABS = [
  { key: 'general', label: 'General', render: (product) => <GeneralTab product={product} /> },
  {
    key: 'variants',
    label: 'SKU Variants',
    count: (product) => product.variants.length,
    render: (product) => <VariantsTab product={product} />,
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    count: (product) => countOf(product, variantWarehouses),
    render: (product) => <WarehouseTab product={product} />,
  },
  {
    key: 'vendor',
    label: 'Vendor',
    count: (product) => countOf(product, (variant) => variant.vendors),
    render: (product) => (
      <ReferenceTab
        product={product}
        read={(variant) => variant.vendors}
        first={['id', 'name']}
        empty="No vendor for this product."
      />
    ),
  },
  {
    key: 'materials',
    label: 'Materials & References',
    // Counted only where the sections are shown - a product of another
    // category has nothing here to count.
    count: (product) =>
      hasMaterialReferences(product)
        ? REFERENCE_SECTIONS.reduce((total, { read }) => total + countOf(product, read), 0)
        : undefined,
    render: (product) => <MaterialsTab product={product} />,
  },
]

/* ------------------------------------------------------------------ */
/* The dialog                                                         */
/* ------------------------------------------------------------------ */

export default function ProductDetailsModal({ open, onOpenChange, product }) {
  const [tabKey, setTabKey] = useState(TABS[0].key)

  // Kept mounted through the closing animation, with nothing to draw.
  if (!product) return null

  const tab = TABS.find((entry) => entry.key === tabKey) ?? TABS[0]

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={product.name || 'Product Details'}
      size="xl"
      // Nothing to type in; focus the box itself rather than a tab.
      autoFocus={false}
    >
      <div className="space-y-3 p-1">
        {/* The same pill tabs as Inventory Master. They wrap onto a second
            line on a narrow screen - nothing here can push the dialog sideways. */}
        <div role="tablist" aria-label="Product details" className="flex flex-wrap gap-1 border-b border-border pb-2">
          {TABS.map(({ key, label, count }) => {
            const selected = key === tab.key
            const total = count?.(product)

            return (
              <button
                key={key}
                id={`product-details-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTabKey(key)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  selected
                    ? 'bg-brand-soft text-brand dark:bg-brand/15'
                    : 'text-muted-foreground hover:bg-brand-soft hover:text-brand dark:hover:bg-brand/15',
                )}
              >
                {label}
                {total !== undefined ? <span className="font-normal opacity-70">({total})</span> : null}
              </button>
            )
          })}
        </div>

        <div role="tabpanel" aria-labelledby={`product-details-tab-${tab.key}`}>
          {tab.render(product)}
        </div>
      </div>
    </Modal>
  )
}

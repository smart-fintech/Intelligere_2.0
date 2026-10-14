/**
 * The Product Details dialog - everything the backend holds about one
 * product, opened from the eye on one of its SKUs (in its opened row) and
 * handed the product with that SKU alone, so every tab is that SKU's.
 * Read-only.
 *
 * Five tabs, so nothing is one long page:
 *
 *   General                  the product itself
 *   SKU Variants             each SKU: its code, stock, selling rate, its
 *                            sku_details and its own fields (Width,
 *                            Manufacturing Date ...)
 *   Warehouse                each SKU's product_details entries - quantity,
 *                            rate, expiry, when added - and where the stock
 *                            of each is kept
 *   Vendor                   who it is bought from
 *   Materials & References   what it is made from, and its past versions:
 *                              Raw References            (raw_reference)
 *                              Semi-Finished References  (semi_finished_reference)
 *                              Version History           (past_version)
 *
 * A tab says how many things it holds, so an empty one is known to be empty
 * before it is opened - and says so plainly when it is.
 *
 * MATERIALS & REFERENCES GOES BY THE PRODUCT'S CATEGORY, by the same rule
 * as the Product form (referencesOfCategory, in productList): a Finished
 * product has both sections, a Semi-Finished one Raw References only, a Raw
 * Material (or any other category) neither - the tab says why instead.
 *
 * IT NAMES NO FIELD OF THE COMPANY'S. The reply is read in ONE place,
 * productList: each part here shows the properties it knows, then the
 * company's own fields (`others`) - so a field added tomorrow appears here
 * by itself. Ids, GUIDs and flags are kept off screen there too. A company
 * field with no value is left out; a known field with none is "--". A
 * YYYY-MM-DD date reads the project's way (DD-MM-YYYY).
 *
 * Opened only by a user with Inventory Management - the eye that opens it
 * is not drawn for anyone else (see ProductTable).
 *
 * Props:
 *   open, onOpenChange   controlled by the product table, the same as Modal
 *   product              the product, as readProducts gives it - or null
 *   description          optional - a line under the title (which SKU)
 */

import { useState } from 'react'

import { DetailItem, DetailList } from '@/Components/Common/DetailList'
import { Modal } from '@/Components/Common/Modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'
import { displayValue, fieldLabel, referencesOfCategory, variantWarehouses } from '../productList'

/* ------------------------------------------------------------------ */
/* Small pieces                                                       */
/* ------------------------------------------------------------------ */

/** A value as shown: a YYYY-MM-DD date the project's way, anything else as displayValue reads it. */
const readable = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? formatDate(value.trim()) : displayValue(value)

/** Whether a value has anything to show - 0 and No do; '', null, [] and {} do not. */
const isFilled = (value) => displayValue(value) !== '--'

/** A tab with nothing in it. */
function Empty({ children }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** A heading over one SKU's part of a tab - only worth drawing when there are several, or it has a code. */
function VariantHeading({ variant, index, count }) {
  if (count <= 1 && !variant.skuCode) return null

  return <h4 className="text-xs font-semibold text-brand">{variant.skuCode || `SKU ${index + 1}`}</h4>
}

/** The company's own fields as detail rows - those with a value, less any in `skip`. */
const otherItems = (others, skip = []) =>
  others
    .filter(({ key, value }) => isFilled(value) && !skip.includes(key))
    .map(({ key, label, value }) => (
      <DetailItem key={key} label={label}>
        {readable(value)}
      </DetailItem>
    ))

/**
 * A plain table for a tab: `columns` is [{ key, label }], `rows` a list of
 * objects read by those keys. A key a row does not have is a blank cell (a
 * line under another that already said it); one it has with no value, "--".
 * Cells wrap, so a long value is read in full.
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
                {key in row ? readable(row[key]) : ''}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Ids are the backend's, not the user's - never a column. */
const HIDDEN_COLUMNS = ['id', 'product_id']

/**
 * The columns of some objects nobody has described: every property any of
 * them has but an id, the ones in `first` leading in that order.
 */
const columnsOf = (entries, first = []) => {
  const keys = [...new Set(entries.flatMap((entry) => Object.keys(entry)))].filter((key) => !HIDDEN_COLUMNS.includes(key))
  const ordered = [...first.filter((key) => keys.includes(key)), ...keys.filter((key) => !first.includes(key))]

  return ordered.map((key) => ({ key, label: fieldLabel(key) }))
}

/** Only the objects of a list - an entry written as a bare value becomes { value }. */
const asObjects = (entries) =>
  entries.map((entry) => (entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry : { value: entry }))

const countOf = (product, read) => product.variants.reduce((total, variant) => total + read(variant).length, 0)

/* ------------------------------------------------------------------ */
/* The tabs                                                           */
/* ------------------------------------------------------------------ */

function GeneralTab({ product }) {
  return (
    <DetailList>
      <DetailItem label="Product Name">{product.name}</DetailItem>
      <DetailItem label="Group">{product.group}</DetailItem>
      <DetailItem label="Category">{product.category}</DetailItem>
      <DetailItem label="HSN Code">{product.hsn}</DetailItem>
      <DetailItem label="Per Unit">{product.unit}</DetailItem>
      <DetailItem label="GST Rate">{product.gstRate}</DetailItem>
      <DetailItem label="Total Quantity">{displayValue(product.quantity)}</DetailItem>
      <DetailItem label="Total Amount">{displayValue(product.totalAmount)}</DetailItem>
      {otherItems(product.others)}
    </DetailList>
  )
}

function VariantsTab({ product }) {
  if (product.variants.length === 0) return <Empty>This product has no SKU variants.</Empty>

  return (
    <div className="space-y-4">
      {product.variants.map((variant, index) => {
        // Its sku_details first; a field of the same name on the SKU is not repeated.
        const detailNames = variant.skuDetails.map(([name]) => name)

        return (
          <section key={index} className="space-y-2">
            <VariantHeading variant={variant} index={index} count={product.variants.length} />

            <DetailList>
              <DetailItem label="SKU Code">{variant.skuCode}</DetailItem>
              <DetailItem label="SKU Quantity">{displayValue(variant.totalQty)}</DetailItem>
              <DetailItem label="SKU Amount">{displayValue(variant.totalAmount)}</DetailItem>
              <DetailItem label="Selling Rate">{displayValue(variant.sellingPrice)}</DetailItem>
              {variant.skuDetails
                .filter(([, value]) => isFilled(value))
                .map(([name, value]) => (
                  <DetailItem key={`sku-${name}`} label={name}>
                    {readable(value)}
                  </DetailItem>
                ))}
              {otherItems(variant.others, detailNames)}
            </DetailList>
          </section>
        )
      })}
    </div>
  )
}

const STOCK_COLUMNS = [
  { key: 'srNo', label: 'Sr No.' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'warehouseQty', label: 'Wh. Qty' },
  { key: 'unitRate', label: 'Unit Rate' },
  { key: 'level', label: 'Level' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'rackNo', label: 'Rack No.' },
  { key: 'expiryDate', label: 'Expiry Date' },
  { key: 'createdAt', label: 'Created At' },
]

/** The company's own fields with a value, as cells keyed by their label. */
const otherCells = (others) =>
  Object.fromEntries(others.filter(({ value }) => isFilled(value)).map(({ label, value }) => [label, value]))

/**
 * A SKU's stock as table rows: one per warehouse of each entry (an entry
 * with none still gets one). The entry's own cells are on its first line
 * only, so two warehouses of one entry read as one entry in two places.
 */
const stockRows = (variant) =>
  variant.details.flatMap((detail) => {
    const entry = {
      srNo: detail.srNo,
      // quantity: detail.quantity,
      unitRate: detail.unitRate,
      expiryDate: detail.expiryDate,
      createdAt: detail.createdAt,
      ...otherCells(detail.others),
    }

    return (detail.warehouses.length > 0 ? detail.warehouses : [null]).map((warehouse, index) => ({
      ...(index === 0 ? entry : {}),
      ...(warehouse
        ? {
            warehouse: warehouse.label,
            warehouseQty: warehouse.quantity,
            level: warehouse.level,
            shelf: warehouse.shelf,
            rackNo: warehouse.rackNo,
            ...otherCells(warehouse.others),
          }
        : { warehouse: 'No warehouse allocation' }),
    }))
  })

function WarehouseTab({ product }) {
  if (countOf(product, (variant) => variant.details) === 0) return <Empty>No stock entries for this product.</Empty>

  return (
    <div className="space-y-4">
      {product.variants.map((variant, index) => {
        const rows = stockRows(variant)
        if (rows.length === 0) return null

        // The fixed columns, then any field of the company's own a row has.
        const known = STOCK_COLUMNS.map(({ key }) => key)
        const extra = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !known.includes(key))

        return (
          <section key={index} className="space-y-2">
            <VariantHeading variant={variant} index={index} count={product.variants.length} />
            <SimpleTable columns={[...STOCK_COLUMNS, ...extra.map((key) => ({ key, label: key }))]} rows={rows} />
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
function ListTab({ product, read, first, empty }) {
  if (countOf(product, read) === 0) return <Empty>{empty}</Empty>

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
const REFERENCE_FIRST = ['Product Name', 'product_name', 'sku_code', 'sku_details', 'qty', 'quantity', 'wastage']

/** The two kinds of reference - one section of the tab each, when the category has it. */
const REFERENCE_SECTIONS = [
  {
    key: 'raw',
    title: 'Raw References',
    read: (variant) => variant.rawReferences,
    empty: 'No raw references for this product.',
  },
  {
    key: 'semiFinished',
    title: 'Semi-Finished References',
    read: (variant) => variant.semiFinishedReferences,
    empty: 'No semi-finished references for this product.',
  },
]

/** The sections a product's category has (see the note at the top). */
const sectionsOf = (product) => {
  const allowed = referencesOfCategory(product.category)
  return REFERENCE_SECTIONS.filter(({ key }) => allowed[key])
}

function SectionTitle({ children, count }) {
  return (
    <h3 className="text-sm font-semibold text-foreground">
      {children} <span className="font-normal text-muted-foreground">({count})</span>
    </h3>
  )
}

/** Each SKU's past versions: the references as they were, one table per kind the category has. */
function VersionHistory({ product, sections }) {
  if (countOf(product, (variant) => variant.pastVersions) === 0) return <Empty>No past versions for this product.</Empty>

  return (
    <div className="space-y-4">
      {product.variants.map((variant, index) =>
        variant.pastVersions.map((version) => (
          <section key={`${index}-${version.key}`} className="space-y-2 rounded-md border border-border p-3">
            <h4 className="text-xs font-semibold text-brand">
              {product.variants.length > 1 ? `${variant.skuCode || `SKU ${index + 1}`} - ` : ''}
              {version.label}
            </h4>
            {sections.map(({ key, title }) => {
              const entries = asObjects(version[key])

              return (
                <div key={key} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{title}</p>
                  {entries.length > 0 ? (
                    <SimpleTable columns={columnsOf(entries, REFERENCE_FIRST)} rows={entries} />
                  ) : (
                    <p className="text-xs text-muted-foreground">None</p>
                  )}
                </div>
              )
            })}
          </section>
        )),
      )}
    </div>
  )
}

/** Materials & References: the sections the category has, then the version history. */
function MaterialsTab({ product }) {
  const sections = sectionsOf(product)

  if (sections.length === 0) {
    return (
      <Empty>
        {product.category
          ? `Raw and semi-finished references apply to Finished and Semi-Finished products only. This product is ${product.category}.`
          : 'Raw and semi-finished references apply to Finished and Semi-Finished products only.'}
      </Empty>
    )
  }

  return (
    <div className="space-y-5">
      {sections.map(({ key, title, read, empty }) => (
        <section key={key} className="space-y-2">
          <SectionTitle count={countOf(product, read)}>{title}</SectionTitle>
          <ListTab product={product} read={read} first={REFERENCE_FIRST} empty={empty} />
        </section>
      ))}

      <section className="space-y-2">
        <SectionTitle count={countOf(product, (variant) => variant.pastVersions)}>Version History</SectionTitle>
        <VersionHistory product={product} sections={sections} />
      </section>
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
      <ListTab product={product} read={(variant) => variant.vendors} first={['name']} empty="No vendor for this product." />
    ),
  },
  {
    key: 'materials',
    label: 'Materials & References',
    // Counted only where the sections are shown - a product of another
    // category has nothing here to count.
    count: (product) => {
      const sections = sectionsOf(product)
      return sections.length > 0 ? sections.reduce((total, { read }) => total + countOf(product, read), 0) : undefined
    },
    render: (product) => <MaterialsTab product={product} />,
  },
]

/* ------------------------------------------------------------------ */
/* The dialog                                                         */
/* ------------------------------------------------------------------ */

export default function ProductDetailsModal({ open, onOpenChange, product, description }) {
  const [tabKey, setTabKey] = useState(TABS[0].key)

  // Kept mounted through the closing animation, with nothing to draw.
  if (!product) return null

  const tab = TABS.find((entry) => entry.key === tabKey) ?? TABS[0]

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={product.name || 'Product Details'}
      description={description}
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

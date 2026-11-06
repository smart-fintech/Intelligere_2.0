import { useMemo } from 'react'
import { AlertCircle, Lock, Trash2 } from 'lucide-react'

import { Field } from '@/Components/Common/FormFields'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import {
  PRODUCTS_ERROR,
  rowErrorKey,
  skuDetailList,
  toEventVendor,
  vendorChoicesFor,
  vendorKey,
  vendorLabel,
} from '@/Modules/Procurement/procurement'

/**
 * The products of the event being created or edited, one card each.
 *
 * A row the event already had (`locked`, on an edit) keeps its details and the
 * vendors already invited to it; more vendors can be added. A row added in this
 * form can be changed in full, or taken out again.
 *
 * A row's vendors to choose from are vendorChoicesFor its product and SKU
 * (the product found in `productOptions` by name) - only the vendors linked to
 * it. The vendors a row already has are always listed with them.
 *
 * `errors` is the form's flat error map; each row reads its own (rowErrorKey).
 */

const NO_VENDORS = []

function ProductRow({ row, pool, errors, disabled, onField, onVendors, onRemove }) {
  const { product, locked } = row
  const id = `procurement-${row.key}`
  const errorOf = (field) => errors[rowErrorKey(row.key, field)]
  const productError = errorOf('product')
  const vendors = Array.isArray(product.vendor) ? product.vendor : NO_VENDORS

  const choices = useMemo(() => {
    const known = new Set(pool.map(vendorKey))
    return [...pool, ...vendors.filter((vendor) => !known.has(vendorKey(vendor)))].map((vendor) => ({
      value: vendorKey(vendor),
      label: vendorLabel(vendor),
    }))
  }, [pool, vendors])

  const handleVendors = (keys) => {
    // Vendors already invited stay on a saved row, whatever was unticked.
    const chosen = [...new Set([...row.lockedVendorKeys, ...keys])]
    onVendors(
      chosen
        .map((key) => {
          const kept = vendors.find((vendor) => vendorKey(vendor) === key)
          if (kept) return kept
          const option = pool.find((vendor) => vendorKey(vendor) === key)
          return option ? toEventVendor(option) : null
        })
        .filter(Boolean),
    )
  }

  return (
    <li className={cn('rounded-md border bg-card p-2.5', productError ? 'border-destructive' : 'border-border')}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
          {product.sr_no}
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-foreground" title={product.product_name}>
          {product.product_name}
        </span>
        {product.sku_code ? (
          <SkuDetailsTooltip details={skuDetailList(product.sku_details)}>
            <span tabIndex={0} className="cursor-help rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">
              {product.sku_code}
            </span>
          </SkuDetailsTooltip>
        ) : null}
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">HSN {product.hsn || '--'}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Unit {product.Per || '--'}</span>
        {productError ? (
          <span role="alert" className="inline-flex items-center gap-1 text-[11px] text-destructive">
            <AlertCircle className="size-3.5" /> {productError}
          </span>
        ) : null}

        <div className="ml-auto">
          {locked ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Saved - only vendors can be added">
              <Lock className="size-3.5" /> Saved
            </span>
          ) : (
            <Button
              type="button"
              variant="iconDelete"
              size="icon-xs"
              icon={Trash2}
              tooltip="Remove product"
              aria-label={`Remove ${product.product_name}`}
              disabled={disabled}
              onClick={onRemove}
            />
          )}
        </div>
      </div>

      {/* One row of short fields, the vendors under them across the card. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_7rem]">
        <Field
          id={`${id}-description`}
          label="Description"
          value={product.Description ?? ''}
          disabled={disabled || locked}
          onChange={(event) => onField({ Description: event.target.value })}
          className="col-span-2 sm:col-span-1"
          inputClassName="h-8"
        />
        <Field
          id={`${id}-specification`}
          label="Specification"
          value={product.Specification ?? ''}
          disabled={disabled || locked}
          onChange={(event) => onField({ Specification: event.target.value })}
          className="col-span-2 sm:col-span-1"
          inputClassName="h-8"
        />
        <Field
          id={`${id}-qty`}
          label={product.Per ? `Qty (${product.Per})` : 'Quantity'}
          required
          type="number"
          min="0"
          step="any"
          value={product.qty ?? ''}
          error={errorOf('qty')}
          disabled={disabled || locked}
          onChange={(event) => onField({ qty: event.target.value })}
          inputClassName="h-8"
        />
        <Field
          id={`${id}-delivery`}
          label="Delivery Days"
          type="number"
          min="1"
          step="1"
          value={product.delivery_days ?? ''}
          error={errorOf('delivery_days')}
          disabled={disabled || locked}
          onChange={(event) => onField({ delivery_days: event.target.value })}
          inputClassName="h-8"
        />
        <MultiSelectField
          id={`${id}-vendors`}
          label={`Vendors (${vendors.length})`}
          required
          options={choices}
          value={vendors.map(vendorKey)}
          onChange={handleVendors}
          error={errorOf('vendor')}
          disabled={disabled}
          placeholder="Select vendors"
          searchPlaceholder="Search vendors"
          className="col-span-2 sm:col-span-4"
        />
      </div>
    </li>
  )
}

export default function ProductRows({ rows, productOptions, companyVendors, errors, disabled, onChange }) {
  // One pool per row - its product's (or SKU's) linked vendors, worked out again only when the lists change.
  const pools = useMemo(() => {
    const byName = new Map(productOptions.map((option) => [option.name.toLowerCase(), option]))
    return new Map(
      rows.map(({ key, product }) => [
        key,
        vendorChoicesFor(byName.get(String(product.product_name ?? '').toLowerCase()), companyVendors, product.sku_code),
      ]),
    )
  }, [rows, productOptions, companyVendors])

  const update = (key, change) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, product: { ...row.product, ...change } } : row)))

  if (rows.length === 0) {
    const missing = errors[PRODUCTS_ERROR]
    return (
      <p
        role={missing ? 'alert' : undefined}
        className={cn(
          'rounded-md border border-dashed px-3 py-6 text-center text-sm',
          missing ? 'border-destructive bg-destructive/5 text-destructive' : 'border-input text-muted-foreground',
        )}
      >
        {missing || 'No product added yet.'}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <ProductRow
          key={row.key}
          row={row}
          pool={pools.get(row.key) ?? NO_VENDORS}
          errors={errors}
          disabled={disabled}
          onField={(change) => update(row.key, change)}
          onVendors={(vendor) => update(row.key, { vendor })}
          onRemove={() => onChange(rows.filter((other) => other.key !== row.key))}
        />
      ))}
    </ul>
  )
}

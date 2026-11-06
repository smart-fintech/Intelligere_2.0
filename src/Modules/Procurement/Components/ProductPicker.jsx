import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { hasProduct, vendorChoicesFor, vendorLabel } from '@/Modules/Procurement/procurement'
import { skuAttributes } from '@/Utils/skuAttributes'

/**
 * The row that adds one product to the event, in order: the product (the
 * Product API's, readProductOptions), then its SKU when it has SKUs with a
 * code, then the vendors to invite for it.
 *
 * A product is kept by SKU when some live SKU row of it has a code - the
 * backend gives every product of a company with SKU (Master Details) one, and
 * none to a company without SKU or to a Tally item - whether or not the
 * company has Inventory Management. Such a product cannot be added, or its
 * vendors chosen, before its SKU is; one without SKUs goes straight to its
 * vendors.
 *
 * The vendors offered are only those linked to the product, or to the chosen
 * SKU (vendorChoicesFor). Changing the SKU unticks the vendors the new one is
 * not linked to.
 */

const NONE = []

/** A SKU's value in the SkuSelector - its product_id, or its place - the one rule for the box and for finding it again. */
const skuValueOf = (variant, index) => String(variant?.product_id ?? index)

export default function ProductPicker({ products, companyVendors, rows, nextSrNo, onAdd, disabled }) {
  const [productId, setProductId] = useState('')
  const [skuValue, setSkuValue] = useState('')
  const [vendorIds, setVendorIds] = useState([])

  const options = products.data ?? NONE
  const product = options.find((option) => option.id === productId) ?? null
  const variants = product?.variants ?? NONE
  const variant = variants.find((item, index) => skuValueOf(item, index) === skuValue) ?? null
  const skuCode = variant ? String(variant.sku_code).trim() : ''

  const needsSku = variants.length > 0
  // The vendors wait for the SKU of a product kept by SKU.
  const skuPending = needsSku && !variant

  const productChoices = useMemo(() => options.map((option) => ({ value: option.id, label: option.name })), [options])
  const pool = useMemo(() => vendorChoicesFor(product, companyVendors, skuCode), [product, companyVendors, skuCode])
  const vendorChoices = useMemo(
    () => (skuPending ? NONE : pool.map((vendor) => ({ value: String(vendor.id), label: vendorLabel(vendor) }))),
    [pool, skuPending],
  )

  const reset = () => {
    setProductId('')
    setSkuValue('')
    setVendorIds([])
  }

  const handleSku = (value) => {
    setSkuValue(value)
    // Only the vendors the new SKU is linked to stay ticked.
    const picked = variants.find((item, index) => skuValueOf(item, index) === value)
    const allowed = new Set(vendorChoicesFor(product, companyVendors, picked?.sku_code).map((vendor) => String(vendor.id)))
    setVendorIds((previous) => previous.filter((id) => allowed.has(id)))
  }

  const ready = Boolean(product) && !skuPending && vendorIds.length > 0

  const handleAdd = () => {
    if (!ready) return
    if (hasProduct(rows, product.name, skuCode)) {
      toast.error(`${product.name}${skuCode ? ` (${skuCode})` : ''} is already added.`)
      return
    }
    onAdd({
      product,
      sku: variant
        ? { code: skuCode, details: Object.fromEntries(skuAttributes(variant).map(({ name, value }) => [name, value])) }
        : null,
      vendors: pool.filter((vendor) => vendorIds.includes(String(vendor.id))),
      srNo: nextSrNo,
    })
    reset()
  }

  const productPlaceholder =
    products.status === 'loading' && !products.data ? 'Loading products...' : options.length === 0 ? 'No products' : 'Select product'

  const vendorPlaceholder = !product
    ? 'Select a product first'
    : skuPending
      ? 'Select a SKU first'
      : vendorChoices.length > 0
        ? 'Select vendors'
        : needsSku
          ? 'No vendors linked to this SKU'
          : 'No vendors linked to this product'

  return (
    <div className="space-y-2">
      {products.status === 'failed' ? (
        <InlineAlert action={<RetryButton onClick={products.reload} />}>{products.error}</InlineAlert>
      ) : null}

      {/* The SKU column is only there when the product has SKUs - never an empty gap. */}
      <div
        className={cn(
          'grid grid-cols-1 items-end gap-3 rounded-md bg-muted/40 p-3',
          needsSku
            ? 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto]'
            : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]',
        )}
      >
        <SelectField
          id="procurement-product"
          label="Product"
          options={productChoices}
          value={productId}
          onValueChange={(value) => {
            setProductId(value)
            setSkuValue('')
            setVendorIds([])
          }}
          placeholder={productPlaceholder}
          disabled={disabled || options.length === 0}
          searchable
          searchPlaceholder="Search products"
        />

        {needsSku ? (
          <SkuSelector
            id="procurement-sku"
            label="SKU Code"
            required
            skuVariants={variants}
            valueOf={skuValueOf}
            value={skuValue}
            onChange={handleSku}
            disabled={disabled}
          />
        ) : null}

        <MultiSelectField
          id="procurement-vendors"
          label={vendorIds.length > 0 ? `Vendors (${vendorIds.length})` : 'Vendors'}
          options={vendorChoices}
          value={vendorIds}
          onChange={setVendorIds}
          disabled={disabled || vendorChoices.length === 0}
          placeholder={vendorPlaceholder}
          searchPlaceholder="Search vendors"
        />

        <Button type="button" icon={Plus} disabled={disabled || !ready} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  )
}

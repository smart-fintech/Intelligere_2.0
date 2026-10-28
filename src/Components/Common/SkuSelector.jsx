import { useMemo, useState } from 'react'

import { FieldError, FieldLabel } from '@/Components/Common/FormFields'
import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select'
import { skuAttributes, skuCodeLabel } from '@/Utils/skuAttributes'

/** A long list gets a search box; a short one does not need it. */
const SEARCHABLE_FROM = 8

/**
 * Choosing ONE SKU of a product - the same control wherever Inventory
 * Management needs it.
 *
 *   <SkuSelector
 *     id="existing-sku"
 *     label="Select SKU Code"
 *     skuVariants={product.sku_variants}
 *     value={selected}
 *     onChange={(value, variant) => ...}
 *   />
 *
 * The options are the SKU codes and nothing else, so the list stays easy to
 * read. Its `sku_details` - and nothing else of the SKU or its product - are
 * in a tooltip beside its option, on hover and on keyboard focus (the arrow
 * keys), read by skuAttributes (Utils/skuAttributes) with no field named
 * here, or "No SKU details available". The tooltip is the shared
 * SkuDetailsTooltip (the app's own Tooltip, drawn on <body>), so neither
 * the open list nor a dialog can clip it.
 *
 * It fetches nothing: the SKUs are handed in, from whatever the screen has
 * already read.
 *
 * Props:
 *   skuVariants   the product's `sku_variants`, as the API sends them
 *   value         the chosen SKU's value ('' for none)
 *   onChange(value, variant)
 *   valueOf(variant, index)   what an option's value is - its `product_id`
 *                 as text by default (its place, for one without)
 *   id, label, required, error, placeholder, disabled, className
 *   loading       the SKUs are still on their way: "Loading..." and off
 *   emptyText     what the box says when there are no SKUs ("No SKUs")
 *   size          the box's size - 'sm' in a table row ('default' otherwise)
 *   ariaLabel     its name when it has no `label` (a table cell)
 *   showChosenDetails   the chosen SKU's `sku_details` in the same tooltip
 *                 when its code in the box is hovered (off by default)
 */
const defaultValueOf = (variant, index) => String(variant?.product_id ?? index)

export function SkuSelector({
  skuVariants = [],
  value = '',
  onChange,
  valueOf = defaultValueOf,
  id,
  label,
  required = false,
  error,
  placeholder = 'Select SKU',
  disabled = false,
  loading = false,
  emptyText = 'No SKUs',
  size,
  ariaLabel,
  showChosenDetails = false,
  className,
}) {
  const options = useMemo(
    () =>
      (Array.isArray(skuVariants) ? skuVariants : []).map((variant, index) => ({
        value: valueOf(variant, index),
        label: skuCodeLabel(variant, index),
        attributes: skuAttributes(variant),
        variant,
      })),
    [skuVariants, valueOf],
  )

  // The search box filters on the codes, as typed; emptied as the list closes.
  const [search, setSearch] = useState('')
  const searchable = options.length >= SEARCHABLE_FROM
  const term = searchable ? search.trim().toLowerCase() : ''
  const visible = term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options
  const empty = !loading && options.length === 0
  const chosen = showChosenDetails && value ? options.find((option) => option.value === value) : null

  const trigger = (
    <SelectTrigger
      id={id}
      size={size}
      aria-label={label ? undefined : ariaLabel}
      className="w-full"
      aria-invalid={Boolean(error) || undefined}
      aria-required={required || undefined}
      aria-describedby={error && id ? `${id}-error` : undefined}
    >
      <SelectValue placeholder={loading ? 'Loading...' : empty ? emptyText : placeholder} />
    </SelectTrigger>
  )

  return (
    <div className={className}>
      <div className="space-y-1.5">
        {label ? (
          <FieldLabel htmlFor={id} required={required}>
            {label}
          </FieldLabel>
        ) : null}

        <Select
          value={value}
          onValueChange={(next) => onChange?.(next, options.find((option) => option.value === next)?.variant ?? null)}
          disabled={disabled || loading || empty}
          onOpenChange={(open) => {
            if (!open) setSearch('')
          }}
        >
          {/* Above the box, so it never covers the fields beside it. */}
          {chosen ? (
            <SkuDetailsTooltip details={chosen.attributes} side="top">
              {trigger}
            </SkuDetailsTooltip>
          ) : (
            trigger
          )}

          <SelectContent
            searchable={searchable}
            searchPlaceholder="Search SKU code..."
            searchValue={search}
            onSearchChange={setSearch}
          >
            {visible.map((option) => (
              <SkuDetailsTooltip key={option.value} details={option.attributes}>
                <SelectItem value={option.value}>{option.label}</SelectItem>
              </SkuDetailsTooltip>
            ))}

            {searchable && visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No matches for &ldquo;{search.trim()}&rdquo;
              </p>
            ) : null}
          </SelectContent>
        </Select>

        <FieldError id={id ? `${id}-error` : undefined}>{error}</FieldError>
      </div>
    </div>
  )
}

export default SkuSelector

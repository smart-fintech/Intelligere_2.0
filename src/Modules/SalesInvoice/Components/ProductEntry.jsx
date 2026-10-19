import { Field, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { GST_RATES } from '@/Constants/gst'
import { DESCRIPTION_MAX_LENGTH } from '@/Constants/salesInvoice'
import {
  isSkuManaged,
  lineFromProduct,
  lineFromSku,
  rateText,
  skuOptionValue,
  toDecimalInput,
  withCurrentOption,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

/** Paise as a plain "1234.50" - for a read-only amount box, where ₹ and commas would only crowd it. */
const plainAmount = (paise) => (Math.round(paise || 0) / 100).toFixed(2)

/**
 * How much of the row each field takes - `flex: grow shrink basis`. The row
 * wraps, so on a wide form the fields sit on one line and on a narrow one only
 * what does not fit moves down. Product Name and SKU Code get twice the room
 * of a number box; Description of Goods comes last and takes what is left.
 */
const WIDE = { flex: '2 1 11rem' }
const NARROW = { flex: '1 1 5.5rem' }
const DESCRIPTION = { flex: '3 1 11rem' }

/** The GST slabs - the project's one list (Constants/gst), as the ledger form offers them. */
const GST_SLAB_OPTIONS = GST_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))

/**
 * THE ONE PRODUCT ENTRY FORM. A product is typed (or picked from the buyer's
 * earlier products) here, and Add Product makes it a line of the invoice; the
 * form then empties for the next one. Edit loads an added line back into it.
 *
 * It asks only for the line itself - product, SKU, HSN/SAC, quantity, rate,
 * unit, discount, GST slab, description. The slab (filled from the product,
 * changeable here) is the line's `gstRate`, which the invoice taxes it at:
 * CGST + SGST or IGST is worked out for the whole invoice (invoiceFigures,
 * by the seller and buyer states) and shown in the preview - never here.
 *
 *   entry           the entry form's values
 *   product         its chosen product (readProducts), or null
 *   productOptions, productsByKey, productsLoading
 *   figures         lineFigures(entry) - for the Amount box
 *   withDiscount    the Disc. % box is shown
 *   errors          the form's errors (this form's are 'entry.<field>')
 *   onUpdate(change, fields)   change(entry) -> the new entry
 */
export default function ProductEntry({
  entry,
  product,
  productOptions,
  productsByKey,
  productsLoading,
  figures,
  withDiscount,
  errors,
  disabled,
  onUpdate,
}) {
  const id = (field) => `entry-${field}`
  const errorOf = (field) => errors[`entry.${field}`]
  const set = (field, transform = (value) => value) => (event) =>
    onUpdate((current) => ({ ...current, [field]: transform(event.target.value) }), [field])

  const skuManaged = isSkuManaged(product)

  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-2 [&>*]:min-w-0">
      <SelectField
        id={id('product')}
        label="Product Name"
        required
        searchable
        searchPlaceholder="Search product"
        className="[flex:2_1_11rem]"
        placeholder={productsLoading ? 'Loading...' : productOptions.length === 0 ? 'No products' : 'Select Product'}
        options={productOptions}
        value={entry.productKey}
        error={errorOf('productKey')}
        disabled={disabled || productOptions.length === 0}
        onValueChange={(key) => {
          // Radix can report '' on its own (see CodeSelector); re-choosing the
          // same product must not clear its SKU either.
          if (!key || key === entry.productKey) return
          onUpdate((current) => lineFromProduct(current, productsByKey.get(key)), ['productKey', 'skuValue', 'hsn', 'rate', 'gstRate'])
        }}
      />

      {/* Only a product kept by SKU has a SKU to choose - and only its own. */}
      {skuManaged ? (
        <div style={WIDE}>
          <SkuSelector
            id={id('sku')}
            label="SKU Code"
            required
            skuVariants={product.variants.map((variant) => variant.source)}
            // Always passed: SkuSelector's own default for `valueOf` never
            // applies, as every props object already has Object.prototype.valueOf.
            valueOf={skuOptionValue}
            value={entry.skuValue}
            error={errorOf('skuValue')}
            disabled={disabled}
            onChange={(value) => {
              if (!value || value === entry.skuValue) return
              onUpdate((current) => lineFromSku(current, product, value), ['skuValue', 'hsn', 'rate', 'gstRate'])
            }}
          />
        </div>
      ) : null}

      <div style={NARROW}>
        <Field
          id={id('hsn')}
          label="HSN/SAC"
          required
          inputMode="numeric"
          maxLength={10}
          value={entry.hsn}
          error={errorOf('hsn')}
          disabled={disabled}
          onChange={set('hsn', (value) => value.replace(/[^\dA-Za-z]/g, ''))}
        />
      </div>

      <div style={NARROW}>
        <Field
          id={id('quantity')}
          label="Quantity"
          required
          inputMode="decimal"
          placeholder="0"
          value={entry.quantity}
          error={errorOf('quantity')}
          disabled={disabled}
          onChange={set('quantity', toDecimalInput)}
        />
      </div>

      <div style={NARROW}>
        <Field
          id={id('rate')}
          label="Rate"
          required
          inputMode="decimal"
          placeholder="0.00"
          value={entry.rate}
          error={errorOf('rate')}
          disabled={disabled}
          onChange={set('rate', toDecimalInput)}
        />
      </div>

      <div style={NARROW}>
        <Field id={id('per')} label="Per" readOnly disabled value={entry.per} placeholder="--" />
      </div>

      {withDiscount ? (
        <div style={NARROW}>
          <Field
            id={id('discount')}
            label="Disc. %"
            inputMode="decimal"
            placeholder="0"
            value={entry.discount}
            error={errorOf('discount')}
            disabled={disabled}
            onChange={set('discount', toDecimalInput)}
          />
        </div>
      ) : null}

      <div style={NARROW}>
        <SelectField
          id={id('gst-slab')}
          label="GST Slab"
          required
          placeholder="Select"
          options={withCurrentOption(GST_SLAB_OPTIONS, entry.gstRate).map((option) =>
            option.value === entry.gstRate ? { ...option, label: `${rateText(option.value)}%` } : option,
          )}
          value={entry.gstRate}
          error={errorOf('gstRate')}
          disabled={disabled}
          onValueChange={(value) => value && onUpdate((current) => ({ ...current, gstRate: value }), ['gstRate'])}
        />
      </div>

      <div style={NARROW}>
        <Field id={id('amount')} label="Amount" readOnly disabled value={plainAmount(figures.grossPaise)} />
      </div>

      <div style={DESCRIPTION}>
        <TextareaField
          id={id('description')}
          label="Description of Goods"
          rows={1}
          maxLength={DESCRIPTION_MAX_LENGTH}
          showCount
          value={entry.description}
          error={errorOf('description')}
          disabled={disabled}
          onChange={set('description')}
        />
      </div>
    </div>
  )
}

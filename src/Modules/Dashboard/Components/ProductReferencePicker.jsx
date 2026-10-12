/**
 * A raw-material or semi-finished field of the Product form: the products
 * this one is made from, each one SKU of one of the company's own products,
 * with how much of it goes in and how much is wasted.
 *
 *   Primary Raw Material *
 *   [ Product v ] [ SKU v ] [ Quantity ] [ Wastage ] [ OK ]
 *   Product Name          | SKU Code        | SKU Details        | Qty | Wastage |  (pencil) (bin)
 *   Knitted Cotton Fabric | KNI-...-GRE-010 | Size: M, Color: ... | 1   | 3       |
 *
 * WHERE THE CHOICES COME FROM: the company's product list the page has
 * already read (useProducts - POST inventory/product/), so choosing costs no
 * request. A raw-material field offers the products whose category is Raw
 * Material, a semi-finished field those that are Semi-Finished - compared as
 * isProductCategory compares (capitals and spacing forgiven, the product's
 * own text untouched). A Finished product is never offered.
 *
 * ONE STEP AT A TIME: a product, then one of its SKUs (chosen for the user
 * when it has only one), then Quantity and Wastage, then OK. A SKU is shown
 * by its code and what it is made of; one with no code says so. A product
 * whose list has no SKU with a `product_id` has nothing to point a reference
 * at, so it cannot be added - and no SKU is made up for it. Changing the
 * product clears the SKU and both amounts.
 *
 * OK checks the draft (validateReferenceDraft), turns it into a reference
 * exactly as the request carries it (buildProductReference) and adds it to
 * the list below, then empties the draft for the next one. A SKU is added
 * once: to change it, Edit it in the list - the draft is filled from it
 * (product, SKU, quantity, wastage) and OK puts it back in its place, never
 * as a second entry; Cancel edit leaves it as it was. Editing keeps what
 * the SKU was saved with - its id, code, details and product name - where
 * the product list has nothing better, and a reference whose product is no
 * longer offered keeps its product and SKU outright (only the amounts can
 * change). Remove takes it out.
 *
 * The draft is this field's own, so a raw-material field and a
 * semi-finished field never touch each other's choices. What is ADDED is
 * the field's value in the form, so it survives going to another step and
 * back; a draft not yet added does not.
 *
 * Props:
 *   id, label, required, error, disabled   as for any field (the error is
 *               the field's own - "is required")
 *   category    PRODUCT_CATEGORY.RAW_MATERIAL or .SEMI_FINISHED
 *   value       the references added so far
 *   onChange(references)
 *   products    useProducts() - { status, rows }
 *   className   its place in the grid
 */

import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

import { Field, FieldError, FieldLabel, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'
import { buildProductReference } from '@/Services/inventoryService'
import { validateReferenceDraft } from '../productForm'
import { displayValue, isProductCategory, PRODUCT_CATEGORY, readProducts } from '../productList'

/** A long list gets a search box; a short one does not need it. */
const SEARCHABLE_FROM = 8

/** What an amount box may hold while it is being typed: "", "12.", ".5" - never a minus. */
const AMOUNT_IN_PROGRESS = /^\d*\.?\d*$/

const EMPTY_DRAFT = { product: '', sku: '', qty: '', wastage: '' }

/** What the field calls the products it offers, for its empty dropdown. */
const NOUN = {
  [PRODUCT_CATEGORY.RAW_MATERIAL]: 'raw material',
  [PRODUCT_CATEGORY.SEMI_FINISHED]: 'semi-finished',
}

/** "Size: M, Color: Grey" - what a SKU is made of, on one line. */
const detailsText = (entries) => entries.map(([name, value]) => `${name}: ${displayValue(value)}`).join(', ')

/** A SKU as an option: its code and what it is made of, and the same one a line in the tooltip. */
const skuOption = (variant) => {
  const details = detailsText(variant.skuDetails)
  const code = variant.skuCode || 'No SKU code'

  return {
    value: String(variant.productId),
    label: details ? `${code} - ${details}` : code,
    title: variant.skuDetails.map(([name, value]) => `${name}: ${displayValue(value)}`).join('\n') || undefined,
  }
}

/** The SKUs of a product a reference can point at: those with a `product_id`. */
const referableSkus = (product) => product?.variants.filter((variant) => variant.productId !== null) ?? []

/** The offered product a SKU id belongs to, or null. */
const ownerOf = (candidates, skuId) =>
  candidates.find((entry) => referableSkus(entry).some((sku) => String(sku.productId) === String(skuId))) ?? null

/** What a saved reference says its SKU is made of - its `sku_details`. */
const savedDetail = (reference) => reference?.sku_details ?? {}

export default function ProductReferencePicker({
  id,
  label,
  required,
  error,
  disabled,
  category,
  value,
  onChange,
  products,
  className,
}) {
  const references = Array.isArray(value) ? value : []

  /* ---------------- The choices ---------------- */
  const all = useMemo(() => readProducts(products.rows), [products.rows])
  const candidates = useMemo(() => all.filter((product) => isProductCategory(product, category)), [all, category])

  const productOptions = useMemo(
    () => candidates.map((product) => ({ value: String(product.key), label: product.name || 'Unnamed product' })),
    [candidates],
  )

  /* ---------------- The draft ---------------- */
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [draftErrors, setDraftErrors] = useState({})
  // The place in the list of the reference being edited, or null.
  const [editing, setEditing] = useState(null)

  const product = candidates.find((entry) => String(entry.key) === draft.product) ?? null
  const skus = referableSkus(product)
  const skuOptions = skus.map(skuOption)
  const variant = skus.find((entry) => String(entry.productId) === draft.sku) ?? null

  /* The reference being edited, as it was saved. When its SKU is no longer
     among the products offered (the product's category changed, or it was
     removed) it is KEPT, not dropped: its product and SKU are shown as they
     were saved and cannot be changed, and only the amounts can. */
  const original = editing !== null ? (references[editing] ?? null) : null
  const kept = original !== null && ownerOf(candidates, original.id) === null

  const loading = products.status === 'loading' && products.rows.length === 0
  const failed = products.status === 'failed' && products.rows.length === 0

  /** A box of the draft changed; its error goes as the user starts fixing it. */
  const change = (name, next) => {
    setDraft((previous) => ({ ...previous, [name]: next }))
    setDraftErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  /** A new product: a fresh SKU choice - made for the user when there is one - and fresh amounts. */
  const chooseProduct = (key) => {
    const chosen = candidates.find((entry) => String(entry.key) === key)
    const only = referableSkus(chosen)

    setDraft({ product: key, sku: only.length === 1 ? String(only[0].productId) : '', qty: '', wastage: '' })
    setDraftErrors({})
  }

  const reset = () => {
    setDraft(EMPTY_DRAFT)
    setDraftErrors({})
    setEditing(null)
  }

  /** OK: checked, made into a reference, and added - or put back in its place when editing. */
  const add = () => {
    const taken = references
      .filter((_, index) => index !== editing)
      .map((reference) => String(reference.id))

    // A kept reference is checked against its own SKU, which nobody can change.
    const target = kept ? { product: 'kept', sku: String(original.id) } : {}
    const skuIds = kept ? [String(original.id)] : skus.map((entry) => String(entry.productId))

    const found = validateReferenceDraft({ ...draft, ...target }, { skuIds, taken })
    setDraftErrors(found)
    if (Object.keys(found).length > 0) return

    /* The same SKU as the reference being edited: what the list says of it,
       and what was saved where the list has nothing - so an edit never
       loses a SKU's details, code or name. A different SKU is the list's. */
    const same = original !== null && String(original.id) === (kept ? String(original.id) : draft.sku) ? original : null
    const listed = kept ? null : variant

    const reference = buildProductReference({
      id: listed ? listed.productId : original.id,
      productName: (listed ? product.name : '') || same?.['Product Name'],
      skuCode: (listed ? listed.skuCode : '') || same?.sku_code,
      skuDetails: listed && listed.skuDetails.length > 0 ? Object.fromEntries(listed.skuDetails) : savedDetail(same),
      qty: draft.qty,
      wastage: draft.wastage,
    })

    onChange(
      editing === null
        ? [...references, reference]
        : references.map((entry, index) => (index === editing ? reference : entry)),
    )
    reset()
  }

  /** Edit: the draft is filled from the reference, its product and SKU found again by the SKU's id. */
  const edit = (index) => {
    const reference = references[index]
    const owner = ownerOf(candidates, reference.id)

    setDraft({
      product: owner ? String(owner.key) : '',
      sku: owner ? String(reference.id) : '',
      qty: String(reference.qty ?? ''),
      wastage: String(reference.wastage ?? ''),
    })
    setDraftErrors({})
    setEditing(index)
  }

  const remove = (index) => {
    onChange(references.filter((_, place) => place !== index))
    // The list moved under an edit in progress: start that edit again.
    if (editing !== null) reset()
  }

  const amountChange = (name) => (event) => {
    if (AMOUNT_IN_PROGRESS.test(event.target.value)) change(name, event.target.value)
  }

  const productPlaceholder = loading
    ? 'Loading...'
    : failed
      ? 'Products could not be loaded'
      : productOptions.length === 0
        ? `No ${NOUN[category]} products`
        : 'Select product'

  return (
    <section className={cn('space-y-2', className)}>
      <FieldLabel htmlFor={`${id}-product`} required={required}>
        {label}
      </FieldLabel>

      {/* The draft: product, SKU, then the two amounts and OK once a SKU is chosen. */}
      <div className="grid grid-cols-12 items-start gap-x-3 gap-y-3 rounded-md border border-border bg-muted/30 p-3">
        {kept ? (
          // Kept as saved - see `kept` above. Shown, not chosen.
          <>
            <Field
              id={`${id}-product`}
              label="Product"
              className="col-span-12 sm:col-span-6 lg:col-span-3"
              value={original['Product Name'] ?? ''}
              readOnly
              disabled
            />
            <Field
              id={`${id}-sku`}
              label="SKU"
              className="col-span-12 sm:col-span-6 lg:col-span-4"
              value={[original.sku_code || 'No SKU code', detailsText(Object.entries(savedDetail(original)))]
                .filter(Boolean)
                .join(' - ')}
              readOnly
              disabled
            />
          </>
        ) : (
          <>
            <SelectField
              id={`${id}-product`}
              label="Product"
              className="col-span-12 sm:col-span-6 lg:col-span-3"
              placeholder={productPlaceholder}
              options={productOptions}
              value={draft.product}
              error={draftErrors.product}
              disabled={disabled || productOptions.length === 0}
              searchable={productOptions.length >= SEARCHABLE_FROM}
              searchPlaceholder="Search product..."
              onValueChange={chooseProduct}
            />

            <SelectField
              id={`${id}-sku`}
              label="SKU"
              className="col-span-12 sm:col-span-6 lg:col-span-4"
              placeholder={!product ? 'Select a product first' : skuOptions.length === 0 ? 'No SKU to reference' : 'Select SKU'}
              options={skuOptions}
              value={draft.sku}
              error={draftErrors.sku}
              disabled={disabled || skuOptions.length === 0}
              searchable={skuOptions.length >= SEARCHABLE_FROM}
              searchPlaceholder="Search SKU..."
              onValueChange={(next) => change('sku', next)}
            />
          </>
        )}

        {variant || kept ? (
          <>
            <Field
              id={`${id}-qty`}
              label="Quantity"
              required
              className="col-span-6 sm:col-span-4 lg:col-span-2"
              inputMode="decimal"
              autoComplete="off"
              value={draft.qty}
              error={draftErrors.qty}
              disabled={disabled}
              onChange={amountChange('qty')}
            />
            <Field
              id={`${id}-wastage`}
              label="Wastage"
              required
              className="col-span-6 sm:col-span-4 lg:col-span-2"
              inputMode="decimal"
              autoComplete="off"
              value={draft.wastage}
              error={draftErrors.wastage}
              disabled={disabled}
              onChange={amountChange('wastage')}
            />

            {/* Level with the boxes, not their labels (a label's height and its gap). */}
            <div className="col-span-12 flex gap-1.5 sm:col-span-4 lg:col-span-1 lg:mt-4.5">
              <Button
                type="button"
                icon={editing === null ? Plus : undefined}
                className="h-10 flex-1"
                disabled={disabled || !draft.qty.trim() || !draft.wastage.trim()}
                onClick={add}
              >
                OK
              </Button>
            </div>
          </>
        ) : null}

        {editing !== null ? (
          <p className="col-span-12 flex items-center gap-2 text-xs text-muted-foreground">
            Editing entry {editing + 1}. OK puts it back in its place.
            <Button type="button" variant="ghost" size="sm" icon={X} disabled={disabled} onClick={reset}>
              Cancel edit
            </Button>
          </p>
        ) : null}
      </div>

      {/* What has been added. */}
      {references.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing added yet. Choose a product and SKU, enter the quantity and wastage, then press OK.
        </p>
      ) : (
        <Table containerClassName="rounded-md border border-border">
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {['Product Name', 'SKU Code', 'SKU Details', 'Quantity', 'Wastage'].map((heading) => (
                <TableHead key={heading} className="h-8 text-xs font-semibold tracking-wide uppercase">
                  {heading}
                </TableHead>
              ))}
              <TableHead className="h-8 w-20 text-right text-xs font-semibold tracking-wide uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {references.map((reference, index) => {
              const name = reference['Product Name'] || 'product'

              return (
                <TableRow
                  key={`${reference.id}-${index}`}
                  className="hover:bg-transparent"
                  data-state={index === editing ? 'selected' : undefined}
                >
                  <TableCell wrap className="py-2 text-sm">
                    {displayValue(reference['Product Name'])}
                  </TableCell>
                  <TableCell wrap className="py-2 text-sm">
                    {displayValue(reference.sku_code)}
                  </TableCell>
                  <TableCell wrap className="py-2 text-sm">
                    {displayValue(reference.sku_details)}
                  </TableCell>
                  <TableCell className="py-2 text-sm">{displayValue(reference.qty)}</TableCell>
                  <TableCell className="py-2 text-sm">{displayValue(reference.wastage)}</TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="iconEdit"
                        size="icon-sm"
                        icon={Pencil}
                        tooltip="Edit"
                        aria-label={`Edit ${name}`}
                        disabled={disabled}
                        onClick={() => edit(index)}
                      />
                      <Button
                        type="button"
                        variant="iconDelete"
                        size="icon-sm"
                        icon={Trash2}
                        tooltip="Remove"
                        aria-label={`Remove ${name}`}
                        disabled={disabled}
                        onClick={() => remove(index)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* The field's own error - "is required" - under everything it is about. */}
      <FieldError>{error}</FieldError>
    </section>
  )
}

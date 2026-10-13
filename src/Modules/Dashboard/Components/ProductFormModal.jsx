/**
 * The Add Product dialog: the company's product fields, filled in one step
 * at a time.
 *
 * The steps, and the fields in each, are handed in already worked out (see
 * buildProductSteps in ../productForm) - this component names no field. It
 * holds what the user has entered, moves between the steps, and sends the
 * product at the end. The Products page gives it a new `key` every time the
 * dialog is opened, so each opening starts from an empty form.
 *
 * ------------------------------------------------------------------
 * WHAT IS TYPED IS KEPT IN THREE PLACES
 * ------------------------------------------------------------------
 *   values        what is filled in once for the product, by field name
 *   skuSets       one entry per SKU: its SKU fields, its own quantity,
 *                 expiry date and rate, and its own warehouse lines
 *                 (ProductSkuEntries, in step 1, where the user adds and
 *                 removes them)
 *   allocations   the warehouse lines of a product without SKUs, under
 *                 the main fields of step 1
 *
 * A product with SKUs uses the first two; one without uses the first and
 * the last (its one SKU entry is never shown, and stays empty).
 *
 * ------------------------------------------------------------------
 * A COMPANY WITH ONE WAREHOUSE
 * ------------------------------------------------------------------
 * `singleWarehouse` says the company's plan allows only one. Its stock
 * then has one place to go, so nobody is asked to choose: every warehouse
 * line - the product's, and each SKU entry's - is read as holding the
 * company's one warehouse (lockAllocations), in what is drawn, what is
 * checked and what is sent alike, whatever the line itself holds. While
 * that warehouse is not known (the list is loading, or could not be read)
 * no line can be added, and one that exists fails its check rather than
 * being sent without a warehouse. Quantities, and the checks on them, are
 * untouched.
 *
 * ------------------------------------------------------------------
 * MOVING BETWEEN STEPS
 * ------------------------------------------------------------------
 *   Next     checks the step that is open; only a step with nothing wrong
 *            lets the user on
 *   Back     goes back without checking - leaving a step half done is fine
 *   a step already done, in the stepper   the same as Back, in one click
 *
 * Nothing is lost by going back and forth: a step is only a view of the
 * three places above. Enter in a box does what the button at the bottom
 * right does.
 *
 * ------------------------------------------------------------------
 * LEAVING
 * ------------------------------------------------------------------
 * An empty form closes like any other dialog: the X, Escape, a click
 * outside, or Cancel. Once something has been entered only Cancel closes
 * it, and Cancel asks first - a stray click beside a five-step form should
 * not throw it away.
 *
 * ------------------------------------------------------------------
 * SAVING
 * ------------------------------------------------------------------
 * Only the last step has the save button. It checks EVERY step again - the
 * fields may have been changed on the Customised Fields tab, or a quantity
 * lowered beneath what its warehouses hold, since a step was
 * passed - and opens the first one with something wrong. Otherwise the
 * product is sent once (the button is off while it is on its way). A
 * failure leaves everything as it was typed; a success shows the backend's
 * own message and hands over to `onSaved`, which closes the dialog.
 *
 * ------------------------------------------------------------------
 * EDIT - ONE SKU AT A TIME
 * ------------------------------------------------------------------
 * With `edit` the same dialog edits one saved SKU (each SKU is its own
 * record, named by its `product_id`). It opens filled from what the SKU
 * was saved with (prefillProductForm), the product's name cannot be
 * changed, there is no Add SKU (it is one SKU), and Save sends PUT with
 * that `product_id` (updateProduct) instead of creating a product.
 * Since the form starts full, Cancel always asks before throwing changes
 * away.
 *
 * A Finished or Semi-Finished product can also start a NEW VERSION of its
 * references (the one Add Version button, above the reference fields - one
 * action for both): the raw-material AND semi-finished references the
 * fields hold at that moment are archived together as the next
 * `version<n>` of its `past_version` (an empty list as []), and both
 * fields start empty for the new references. One version per edit: the
 * button is gone once used, so a second click cannot archive twice.
 * Undo version puts both fields back as they were. Nothing is sent until
 * Save - Cancel keeps nothing - and the history it already has is always
 * sent back as it was.
 *
 * ------------------------------------------------------------------
 * ADD EXISTING PRODUCT
 * ------------------------------------------------------------------
 * With `fromExisting` the dialog adds a product the same way - the same
 * POST, the same payload - but starts from one the company already has.
 * Step 1 opens with "Select Existing Product" (every product of the list
 * the page has already read - `products`); choosing one fills the form from
 * it (prefillProductForm, as an edit is filled) and locks its name, which
 * is how the backend finds the product the new stock belongs to.
 *
 *   a product with a SKU choice to make (several SKUs, or one with a code)
 *       "Select SKU Code" appears (the shared SkuSelector: the codes, each
 *       SKU's attributes in a tooltip) - beside Add SKU when the form has SKU
 *       Details, else beside the product. Choosing one fills everything that
 *       is that SKU's: its SKU fields, Quantity, Expiry Date, Unit Rate,
 *       warehouse lines, vendor and references - all of THAT SKU, and a field
 *       it has no value for is emptied rather than left with another's.
 *   a product with one SKU and no code
 *       no SKU choice: that one SKU is the product, filled in at once.
 *
 * A new product chosen starts the form again from it (a SKU chosen before
 * goes with the old product). Add SKU works as ever, from the entry above.
 * The product has to be chosen before step 1 can be left; a SKU need not
 * be.
 *
 * Props:
 *   open, onOpenChange   controlled by the Products page, the same as Modal
 *   steps        from buildProductSteps - never empty. The dialog shows them
 *                through applicableSteps: the reference fields follow the
 *                Category chosen in the form
 *   companyName  the active company's name - sent with the product, never typed
 *   vendors      useVendorOptions(), for a vendor field
 *   warehouses   useWarehouseOptions(), for warehouse stock
 *   products     useProducts() - the page's own product list, which a
 *                raw-material or semi-finished field chooses from
 *   singleWarehouse   the company's plan allows one warehouse - see above
 *   edit         null to add a product, or the SKU to edit:
 *                { productId, saved: productEditSource(...), versioning }
 *                - `versioning` is whether Add Version is offered
 *   fromExisting   Add Existing Product - see above
 *   onSaved(response)   after a successful save
 */

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, History, Undo2 } from 'lucide-react'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { Modal } from '@/Components/Common/Modal'
import { Stepper } from '@/Components/Common/Stepper'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import {
  buildProductPayload,
  buildProductUpdatePayload,
  createProduct,
  nextPastVersionKey,
  pastVersionOf,
  updateProduct,
} from '@/Services/inventoryService'
import {
  allocationTotalError,
  checkProductStep,
  collectProductValues,
  applicableSteps,
  copySkuSet,
  emptyAllocation,
  emptyProductValue,
  emptySkuSet,
  isDetailField,
  isReferenceInput,
  isSkuField,
  lockAllocations,
  prefillProductForm,
  PRODUCT_INPUT,
  PRODUCT_GROUP,
  productFieldName,
  productInputKind,
  productQuantity,
  skuGroupOf,
  skuSetHasData,
} from '../productForm'
import { isProductNameField, productEditSource, readProducts } from '../productList'
import ProductFieldInput from './ProductFieldInput'
import ProductSkuEntries from './ProductSkuEntries'
import ProductWarehouseAllocation from './ProductWarehouseAllocation'

const FORM_ID = 'product-form'

/** A SKU option's value: its place in the product's list. */
const skuByPlace = (_variant, index) => String(index)

/** Nothing wrong anywhere - the shape checkProductStep reports in. */
const NO_ERRORS = { fields: {}, sets: {}, lines: {} }

/** Whether a value is "something entered" - what makes the form worth asking about before it is thrown away. */
const isFilled = (value) => {
  if (typeof value === 'string') return value.trim() !== ''
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

export default function ProductFormModal({
  open,
  onOpenChange,
  steps: formSteps,
  companyName,
  vendors,
  warehouses,
  products,
  singleWarehouse = false,
  edit = null,
  fromExisting = false,
  onSaved,
}) {
  // The numbers the next SKU entry and the next warehouse line get - only
  // ever read in a handler. Entry 1 is the one every form starts with, and
  // one counter numbers every line, so no two lines share a key whichever
  // entry they are in.
  const skuSetCount = useRef(1)
  const lineCount = useRef(0)

  // Edit: the form as the SKU was saved - worked out once, as the dialog
  // opens (it gets a new `key` every time). Saved lines are numbered
  // apart from new ones, so no two share a key.
  const [initial] = useState(() => {
    if (!edit) return null
    const filled = prefillProductForm(formSteps, edit.saved)
    const numbered = (lines, prefix) => lines.map((line, index) => ({ id: `${prefix}-${index}`, ...line }))

    return {
      values: filled.values,
      skuSet: { id: 1, values: filled.skuValues, allocations: numbered(filled.skuLines, 'saved-sku') },
      allocations: numbered(filled.lines, 'saved'),
    }
  })

  // What is filled in once, by field name. A field not touched yet is
  // simply absent, and reads as its type's empty value.
  const [values, setValues] = useState(() => initial?.values ?? {})
  // One entry per SKU - always at least one. See the note at the top.
  const [heldSkuSets, setSkuSets] = useState(() => [initial?.skuSet ?? emptySkuSet(1)])
  // The warehouse lines of a product without SKUs.
  const [heldAllocations, setAllocations] = useState(() => initial?.allocations ?? [0])
  // Add Existing Product: the product and SKU chosen (by their place in
  // the lists below), and the message under the product picker.
  const [existing, setExisting] = useState({ product: '', sku: '', error: undefined })

  // Edit: the new version started with Add Version, or null -
  // { key, archive: { raw, semiFinished }, before: { values, sku } }.
  const [newVersion, setNewVersion] = useState(null)

  // The steps as shown now: the reference fields the Category chosen has
  // no use for are out (applicableSteps) - worked out on every draw, so a
  // change of Category shows or hides them at once. Everything below goes
  // by these.
  const steps = applicableSteps(formSteps, { values, skuSets: heldSkuSets })
  // What the last check found - see checkProductStep.
  const [errors, setErrors] = useState(NO_ERRORS)
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // The fields can change under an open form (a field hidden on the
  // Customised Fields tab can remove a whole step), so the open step is
  // never trusted to still exist.
  const openIndex = Math.min(stepIndex, steps.length - 1)
  const step = steps[openIndex]
  const isLastStep = openIndex === steps.length - 1

  /* One warehouse: every line is read as holding it - see the note at the
     top. '' while it is not known, which no check lets through. Everything
     below - drawing, checking, sending - works from these two, never from
     the lines as they are held. */
  const onlyWarehouse = warehouses.options[0]?.value ?? ''
  const lock = (lines) => (singleWarehouse ? lockAllocations(lines, onlyWarehouse) : lines)

  const allocations = lock(heldAllocations)
  const skuSets = singleWarehouse
    ? heldSkuSets.map((set) => ({ ...set, allocations: lock(set.allocations) }))
    : heldSkuSets

  // An edit starts full, so it always asks before its changes are thrown away.
  const hasEntries =
    Boolean(edit) ||
    Object.values(values).some(isFilled) ||
    skuSets.length > 1 ||
    skuSets.some(skuSetHasData) ||
    allocations.length > 0

  /* The product's warehouse lines against its quantity - a product
     without SKUs. Worked out on every draw rather than on Next, so it is
     right whichever of the two the user has just changed (see
     allocationTotalError). Each SKU entry does the same for its own lines. */
  const quantity = productQuantity(steps, values)
  const totalError = allocationTotalError(allocations, quantity)

  /* ---------------- Add Existing Product ----------------
     See the note at the top. The products are the page's own list, read
     the one way every product screen reads it. */
  const listed = useMemo(() => (fromExisting ? readProducts(products?.rows) : []), [fromExisting, products?.rows])
  const existingProduct = listed.find((product) => String(product.key) === existing.product) ?? null
  const existingSkus = existingProduct?.variants ?? []
  // A choice to make: several SKUs, or one that has a code.
  const offersSku = existingSkus.length > 1 || existingSkus.some((variant) => variant.skuCode)

  /* The fields that belong to ONE SKU wherever the form draws them: its
     SKU fields, its Quantity / Expiry Date / Unit Rate, and the vendor and
     references a SKU carries. Choosing a SKU sets every one of them. */
  const skuDependentFields = formSteps
    .flatMap((entry) => entry.groups.filter((group) => group.key !== PRODUCT_GROUP.SKU).flatMap((group) => group.fields))
    .filter((field) => {
      const kind = productInputKind(field)
      return isDetailField(field) || isSkuField(field) || isReferenceInput(kind) || kind === PRODUCT_INPUT.VENDOR
    })

  /** Saved warehouse lines, each with a key of its own - numbered in a handler only. */
  const numberLines = (lines) =>
    lines.map((line) => {
      lineCount.current += 1
      return { ...line, id: lineCount.current }
    })

  /** A product was chosen: the form starts again from it. */
  const chooseExisting = (key) => {
    const product = listed.find((entry) => String(entry.key) === key)
    if (!product) return

    // One SKU with no code is the product itself - no choice to offer.
    const only = product.variants.length === 1 && !product.variants[0].skuCode ? product.variants[0] : null
    const filled = prefillProductForm(formSteps, productEditSource(product, only))

    skuSetCount.current += 1
    setValues(filled.values)
    setSkuSets([{ id: skuSetCount.current, values: filled.skuValues, allocations: numberLines(filled.skuLines) }])
    setAllocations(numberLines(filled.lines))
    setExisting({ product: key, sku: only ? '0' : '', error: undefined })
    setErrors(NO_ERRORS)
  }

  /** A SKU was chosen: everything that is a SKU's becomes THIS one's. */
  const chooseExistingSku = (index) => {
    const variant = existingSkus[Number(index)]
    if (!existingProduct || !variant) return

    const filled = prefillProductForm(formSteps, productEditSource(existingProduct, variant))

    // With SKU Details: the first entry is this SKU's, whole. Entries added
    // after it are the user's own and stay.
    setSkuSets((previous) =>
      previous.map((set, place) =>
        place === 0 ? { id: set.id, values: filled.skuValues, allocations: numberLines(filled.skuLines) } : set,
      ),
    )
    // Without: the SKU's fields among the product's - this SKU's value, or
    // empty, never another SKU's - and its stock.
    setValues((previous) => ({
      ...previous,
      ...Object.fromEntries(
        skuDependentFields.map((field) => [productFieldName(field), filled.values[productFieldName(field)] ?? emptyProductValue(field)]),
      ),
    }))
    setAllocations(numberLines(filled.lines))
    setExisting((previous) => ({ ...previous, sku: index }))
  }

  /** Step 1 cannot be left without the product it starts from. */
  const existingMissing = () => {
    if (!fromExisting || existing.product) return false
    setExisting((previous) => ({ ...previous, error: 'Select the existing product to add' }))
    return true
  }

  /* ---------------- Fields filled in once ---------------- */

  /** A field changed; its error goes as soon as the user starts fixing it. */
  const setValue = (name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => ({ ...previous, fields: { ...previous.fields, [name]: undefined } }))
  }

  /* ---------------- SKU entries ----------------
     Every change makes a new object for the ONE entry it is about and
     leaves the others exactly as they were, so one SKU's values or stock
     can never end up in another's. */

  const changeSkuSet = (setId, change) =>
    setSkuSets((previous) => previous.map((set) => (set.id === setId ? change(set) : set)))

  /** Forgets one error of one entry - `kind` is 'fields' or 'lines'. */
  const clearSkuError = (setId, kind, update) =>
    setErrors((previous) => {
      const found = previous.sets[setId]
      if (!found) return previous

      return { ...previous, sets: { ...previous.sets, [setId]: { ...found, [kind]: update(found[kind] ?? {}) } } }
    })

  const setSkuValue = (setId, name, value) => {
    changeSkuSet(setId, (set) => ({ ...set, values: { ...set.values, [name]: value } }))
    clearSkuError(setId, 'fields', (fields) => ({ ...fields, [name]: undefined }))
  }

  /** Add SKU: a new entry after the others - a full copy of the last one, as it is now (copySkuSet). */
  const addSkuSet = () => {
    // Numbered, and copied, here - not inside the updater below, which
    // must stay pure. Its warehouse lines get keys of their own.
    skuSetCount.current += 1
    const set = copySkuSet(skuSetCount.current, heldSkuSets[heldSkuSets.length - 1], () => newLine().id)

    setSkuSets((previous) => [...previous, set])
  }

  const removeSkuSet = (setId) => {
    // The last one stays: there is always at least one entry.
    setSkuSets((previous) => (previous.length > 1 ? previous.filter((set) => set.id !== setId) : previous))
    setErrors((previous) => ({ ...previous, sets: { ...previous.sets, [setId]: undefined } }))
  }

  /** A new warehouse line - numbered here, never inside an updater, which must stay pure. */
  const newLine = () => {
    lineCount.current += 1
    return emptyAllocation(lineCount.current)
  }

  /* ---------------- Warehouse lines of one SKU entry ---------------- */
  const addSkuLine = (setId) => {
    const line = newLine()
    changeSkuSet(setId, (set) => ({ ...set, allocations: [...set.allocations, line] }))
  }

  const changeSkuLine = (setId, lineId, property, value) => {
    changeSkuSet(setId, (set) => ({
      ...set,
      allocations: set.allocations.map((line) => (line.id === lineId ? { ...line, [property]: value } : line)),
    }))
    clearSkuError(setId, 'lines', (lines) =>
      lines[lineId] ? { ...lines, [lineId]: { ...lines[lineId], [property]: undefined } } : lines,
    )
  }

  const removeSkuLine = (setId, lineId) => {
    changeSkuSet(setId, (set) => ({ ...set, allocations: set.allocations.filter((line) => line.id !== lineId) }))
    clearSkuError(setId, 'lines', (lines) => ({ ...lines, [lineId]: undefined }))
  }

  /* ---------------- Warehouse lines of a product without SKUs ---------------- */
  const addAllocation = () => {
    const line = newLine()
    setAllocations((previous) => [...previous, line])
  }

  const changeAllocation = (id, property, value) => {
    setAllocations((previous) => previous.map((line) => (line.id === id ? { ...line, [property]: value } : line)))
    setErrors((previous) =>
      previous.lines[id]?.[property]
        ? { ...previous, lines: { ...previous.lines, [id]: { ...previous.lines[id], [property]: undefined } } }
        : previous,
    )
  }

  const removeAllocation = (id) => {
    setAllocations((previous) => previous.filter((line) => line.id !== id))
    setErrors((previous) => ({ ...previous, lines: { ...previous.lines, [id]: undefined } }))
  }

  /* ---------------- Versions (edit) ----------------
     ONE action for both reference fields - see the note at the top. The
     reference fields are the product's own (in `values`) and, when a
     reference field is a SKU field, the SKU entry's - all of them, shown
     or not, so the new version starts with every list empty. */
  const referenceNames = (fields) =>
    fields.filter((field) => isReferenceInput(productInputKind(field))).map(productFieldName)
  const skuReferenceNames = referenceNames(skuGroupOf(formSteps)?.fields ?? [])
  const productReferenceNames = referenceNames(
    formSteps.flatMap((entry) =>
      entry.groups.filter((group) => group.key !== PRODUCT_GROUP.SKU).flatMap((group) => group.fields),
    ),
  )

  /** `names` of an object, each set to what `from` holds for it ([] for nothing). */
  const withReferences = (object, names, from) => ({
    ...object,
    ...Object.fromEntries(names.map((name) => [name, from?.[name] ?? []])),
  })

  const versioning = edit?.versioning
    ? {
        key: newVersion?.key ?? null,
        onStart: () => {
          // Once per edit - a second click must not archive the new lists.
          if (newVersion) return

          // Both lists exactly as they would be sent now - the product's
          // and the SKU entry's together (collectProductValues).
          const collected = collectProductValues(steps, { values, skuSets, allocations })
          const entry = collected.details[0]?.references
          const archive = {
            raw: [...collected.references.raw, ...(entry?.raw ?? [])],
            semiFinished: [...collected.references.semiFinished, ...(entry?.semiFinished ?? [])],
          }

          setNewVersion({
            key: nextPastVersionKey(edit.saved.pastVersion),
            archive,
            // What Undo puts back.
            before: {
              values: withReferences({}, productReferenceNames, values),
              sku: withReferences({}, skuReferenceNames, heldSkuSets[0]?.values),
            },
          })

          // Both fields start empty for the new version.
          setValues((previous) => withReferences(previous, productReferenceNames, {}))
          setSkuSets((previous) =>
            previous.map((set) => ({ ...set, values: withReferences(set.values, skuReferenceNames, {}) })),
          )
        },
        onUndo: () => {
          if (!newVersion) return
          const { before } = newVersion

          setNewVersion(null)
          setValues((previous) => withReferences(previous, productReferenceNames, before.values))
          setSkuSets((previous) =>
            previous.map((set, index) =>
              index === 0 ? { ...set, values: withReferences(set.values, skuReferenceNames, before.sku) } : set,
            ),
          )
        },
      }
    : null

  // The step the one Version button is on: the first that shows a
  // reference field - none while the Category shows neither.
  const versionStep = steps.findIndex((entry) =>
    entry.groups.some((group) => group.fields.some((field) => isReferenceInput(productInputKind(field)))),
  )

  /* ---------------- Moving ---------------- */
  // `final`: the check before saving - see checkProductStep.
  const check = (entry, final = false) => checkProductStep(entry, { steps, values, skuSets, allocations }, { final })

  // No total is kept: each is worked out on every draw, where it is shown.
  const showErrors = (checked) => setErrors({ fields: checked.fields, sets: checked.sets, lines: checked.lines })

  const goBack = () => {
    setErrors(NO_ERRORS)
    setStepIndex(Math.max(0, openIndex - 1))
  }

  /** Next: the open step has to pass before the one after it opens. */
  const goNext = () => {
    if (openIndex === 0 && existingMissing()) return

    const checked = check(step)
    showErrors(checked)
    if (checked.passes) setStepIndex(openIndex + 1)
  }

  const save = async () => {
    if (existingMissing()) {
      setStepIndex(0)
      return
    }

    // Every step, not just this one - see the note at the top.
    const failing = steps.findIndex((entry) => !check(entry, true).passes)

    if (failing !== -1) {
      showErrors(check(steps[failing], true))
      setStepIndex(failing)
      if (failing !== openIndex) toast.error(`Please complete "${steps[failing].title}" first.`)
      return
    }

    setSubmitting(true)

    try {
      const { fields, details, vendors: chosenVendors, files, references } = collectProductValues(
        steps,
        { values, skuSets, allocations },
        { vendorOptions: vendors.options },
      )
      const product = { companyName, fields, details, vendors: chosenVendors, references }

      // Edit: the history as it was, plus - with a new version - the
      // references the SKU was saved with, under the new key.
      const pastVersion = edit
        ? {
            ...edit.saved.pastVersion,
            ...(newVersion ? { [newVersion.key]: pastVersionOf(newVersion.archive) } : {}),
          }
        : null

      const response = edit
        ? await updateProduct(buildProductUpdatePayload({ ...product, productId: edit.productId, pastVersion }), files)
        : await createProduct(buildProductPayload(product), files)

      // The backend's own message, and the SKU code it gave the product
      // when it made one. Nothing else in the reply is this form's to show.
      toast.success(
        response?.msg || (edit ? 'Product updated successfully' : 'Product saved successfully'),
        response?.sku_code ? { description: `SKU Code: ${response.sku_code}` } : undefined,
      )
      onSaved?.(response)
    } catch (failure) {
      // `failure.message` is the backend's own `msg` (see authService).
      // Nothing is cleared: everything typed is still there to send again.
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // Enter in a box arrives here too, even while the button is off.
    if (submitting) return

    if (isLastStep) save()
    else goNext()
  }

  const close = () => onOpenChange(false)

  const cancelButton = (
    <Button type="button" variant="ghost" disabled={submitting} onClick={hasEntries ? undefined : close}>
      Cancel
    </Button>
  )

  /* ---------------- Add Existing Product: its two pickers ---------------- */
  const existingOptions = listed.map((product) => ({
    value: String(product.key),
    label: [product.name || 'Unnamed product', product.group, product.category].filter(Boolean).join(' - '),
  }))

  // The shared SKU picker: codes only, each SKU's attributes in a tooltip.
  // An option's value is the SKU's place in the product's list - the same
  // place chooseExistingSku reads it from.
  const skuPicker = (
    <SkuSelector
      id="existing-sku"
      label="Select SKU Code"
      skuVariants={existingSkus.map((variant) => variant.source)}
      valueOf={skuByPlace}
      value={existing.sku}
      disabled={submitting}
      onChange={chooseExistingSku}
    />
  )

  /* ---------------- Drawing a group ---------------- */
  const renderGroup = (group) => {
    // A product with SKUs: one entry per SKU, with Add SKU.
    if (group.key === PRODUCT_GROUP.SKU) {
      return (
        <ProductSkuEntries
          key={group.key}
          group={group}
          steps={steps}
          sets={skuSets}
          errors={errors.sets}
          vendors={vendors}
          warehouses={warehouses}
          products={products}
          singleWarehouse={singleWarehouse}
          disabled={submitting}
          // An edit is of one SKU - see the note at the top.
          onAdd={edit ? undefined : addSkuSet}
          headerExtra={fromExisting && offersSku ? skuPicker : null}
          onRemove={removeSkuSet}
          onValueChange={setSkuValue}
          onAddLine={addSkuLine}
          onChangeLine={changeSkuLine}
          onRemoveLine={removeSkuLine}
        />
      )
    }

    // A product without SKUs: its stock, under its main fields.
    if (group.key === PRODUCT_GROUP.WAREHOUSE) {
      return (
        <ProductWarehouseAllocation
          key={group.key}
          allocations={allocations}
          errors={errors.lines}
          totalError={totalError}
          quantity={quantity}
          warehouses={warehouses}
          singleWarehouse={singleWarehouse}
          disabled={submitting}
          onAdd={addAllocation}
          onChange={changeAllocation}
          onRemove={removeAllocation}
        />
      )
    }

    return (
      <section key={group.key} className="space-y-2">
        {group.title ? <h3 className="text-xs font-semibold text-brand">{group.title}</h3> : null}

        {/* Twelve columns; each field takes its share (see ProductFieldInput). */}
        <div className="grid grid-cols-12 gap-x-3 gap-y-3">
          {group.fields.map((field) => {
            const name = productFieldName(field)

            return (
              <ProductFieldInput
                key={name}
                field={field}
                value={values[name] ?? emptyProductValue(field)}
                error={errors.fields[name]}
                disabled={submitting}
                // An edit may change everything but the product's name - and
                // an existing product keeps its own (see the note at the top).
                readOnly={(Boolean(edit) || (fromExisting && Boolean(existing.product))) && isProductNameField(name)}
                vendors={vendors}
                products={products}
                onChange={(value) => setValue(name, value)}
              />
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit Product' : fromExisting ? 'Add Existing Product' : 'Add Product'}
      // The fields are sized in twelfths of the row, which wants the width.
      size="xxl"
      // With something entered, or while saving, only Cancel closes it - see
      // "Leaving" at the top.
      closeOnBackdropClick={!hasEntries && !submitting}
      closeOnEsc={!hasEntries && !submitting}
      showCloseButton={!hasEntries && !submitting}
      autoFocus={false}
      footer={
        <>
          {hasEntries ? (
            <ConfirmPopover
              open={confirmingCancel}
              onOpenChange={setConfirmingCancel}
              title="Discard this product?"
              description="Everything entered in this form will be lost."
              confirmLabel="Discard"
              cancelLabel="Keep editing"
              onConfirm={close}
            >
              {cancelButton}
            </ConfirmPopover>
          ) : (
            cancelButton
          )}

          {openIndex > 0 ? (
            <Button type="button" variant="outline" icon={ArrowLeft} disabled={submitting} onClick={goBack}>
              Back
            </Button>
          ) : null}

          {/* `form` ties these to the form above, outside of which the
              dialog draws its footer. */}
          {isLastStep ? (
            <Button type="submit" form={FORM_ID} loading={submitting}>
              {submitting ? 'Saving...' : edit ? 'Update Product' : 'Save Product'}
            </Button>
          ) : (
            <Button type="submit" form={FORM_ID}>
              Next
              <ArrowRight />
            </Button>
          )}
        </>
      }
    >
      {/* `p-1`: room for the focus ring, inside the dialog's scroll box. */}
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4 p-1">
        <Stepper
          steps={steps}
          current={openIndex}
          disabled={submitting}
          onStepClick={(index) => {
            setErrors(NO_ERRORS)
            setStepIndex(index)
          }}
        />

        {/* A vendor field with nothing to choose from: said once, here, with
            the only way to try again. */}
        {vendors.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={vendors.retry} />}>
            Vendors could not be loaded. {vendors.error}
          </InlineAlert>
        ) : null}

        {/* THE ONE VERSION BUTTON - for both reference fields, on the step
            where they start (see "Versions" above). */}
        {versioning && openIndex === versionStep ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {versioning.key
                ? `New version started. The previous raw and semi-finished references will be saved as ${versioning.key}.`
                : 'Raw and semi-finished references. Add Version keeps the current ones as a past version and starts both lists afresh.'}
            </p>
            {versioning.key ? (
              <Button type="button" variant="ghost" size="sm" icon={Undo2} disabled={submitting} onClick={versioning.onUndo}>
                Undo version
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" icon={History} disabled={submitting} onClick={versioning.onStart}>
                Add Version
              </Button>
            )}
          </div>
        ) : null}

        {/* Add Existing Product: what the form starts from - on step 1. */}
        {fromExisting && openIndex === 0 ? (
          <div className="grid grid-cols-12 items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
            <SelectField
              id="existing-product"
              label="Select Existing Product"
              required
              className="col-span-12 sm:col-span-6"
              placeholder={
                products?.status === 'loading' && listed.length === 0
                  ? 'Loading...'
                  : listed.length === 0
                    ? 'No products found'
                    : 'Select product'
              }
              options={existingOptions}
              value={existing.product}
              error={existing.error}
              disabled={submitting || listed.length === 0}
              searchable
              searchPlaceholder="Search product..."
              onValueChange={chooseExisting}
            />
            {/* Without SKU Details there is no Add SKU to sit beside. */}
            {offersSku && !skuGroupOf(steps) ? <div className="col-span-12 sm:col-span-6">{skuPicker}</div> : null}
          </div>
        ) : null}

        {step.groups.map(renderGroup)}
      </form>
    </Modal>
  )
}

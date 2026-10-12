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
 * Props:
 *   open, onOpenChange   controlled by the Products page, the same as Modal
 *   steps        from buildProductSteps - never empty
 *   companyName  the active company's name - sent with the product, never typed
 *   vendors      useVendorOptions(), for a vendor field
 *   warehouses   useWarehouseOptions(), for warehouse stock
 *   singleWarehouse   the company's plan allows one warehouse - see above
 *   onSaved(response)   after a successful save
 */

import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { Stepper } from '@/Components/Common/Stepper'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { buildProductPayload, createProduct } from '@/Services/inventoryService'
import {
  allocationTotalError,
  checkProductStep,
  collectProductValues,
  emptyAllocation,
  emptyProductValue,
  emptySkuSet,
  lockAllocations,
  PRODUCT_GROUP,
  productFieldName,
  productQuantity,
  skuSetHasData,
} from '../productForm'
import ProductFieldInput from './ProductFieldInput'
import ProductSkuEntries from './ProductSkuEntries'
import ProductWarehouseAllocation from './ProductWarehouseAllocation'

const FORM_ID = 'product-form'

/** Nothing wrong anywhere - the shape checkProductStep reports in. */
const NO_ERRORS = { fields: {}, sets: {}, lines: {} }

/** Whether a value is "something entered" - what makes the form worth asking about before it is thrown away. */
const isFilled = (value) => (typeof value === 'string' ? value.trim() !== '' : Boolean(value))

export default function ProductFormModal({
  open,
  onOpenChange,
  steps,
  companyName,
  vendors,
  warehouses,
  singleWarehouse = false,
  onSaved,
}) {
  // The numbers the next SKU entry and the next warehouse line get - only
  // ever read in a handler. Entry 1 is the one every form starts with, and
  // one counter numbers every line, so no two lines share a key whichever
  // entry they are in.
  const skuSetCount = useRef(1)
  const lineCount = useRef(0)

  // What is filled in once, by field name. A field not touched yet is
  // simply absent, and reads as its type's empty value.
  const [values, setValues] = useState({})
  // One entry per SKU - always at least one. See the note at the top.
  const [heldSkuSets, setSkuSets] = useState(() => [emptySkuSet(1)])
  // The warehouse lines of a product without SKUs.
  const [heldAllocations, setAllocations] = useState([])
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

  const hasEntries =
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

  /** Add SKU: a new, empty entry after the others - nothing is copied into it. */
  const addSkuSet = () => {
    // Made here, not inside the updater below, which must stay pure.
    skuSetCount.current += 1
    const set = emptySkuSet(skuSetCount.current)
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
    const checked = check(step)
    showErrors(checked)
    if (checked.passes) setStepIndex(openIndex + 1)
  }

  const save = async () => {
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
      const { fields, details, vendors: chosenVendors, files } = collectProductValues(
        steps,
        { values, skuSets, allocations },
        { vendorOptions: vendors.options },
      )
      const payload = buildProductPayload({ companyName, fields, details, vendors: chosenVendors })
      const response = await createProduct(payload, files)

      // The backend's own message, and the SKU code it gave the product
      // when it made one. Nothing else in the reply is this form's to show.
      toast.success(
        response?.msg || 'Product saved successfully',
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
          singleWarehouse={singleWarehouse}
          disabled={submitting}
          onAdd={addSkuSet}
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
                vendors={vendors}
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
      title="Add Product"
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
              {submitting ? 'Saving...' : 'Save Product'}
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

        {step.groups.map(renderGroup)}
      </form>
    </Modal>
  )
}

/**
 * The Add / Edit Custom Field dialog, on the Customised Fields tab of
 * Inventory Master.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO MODES - AND ONE API CALL FOR BOTH
 * ------------------------------------------------------------------
 *   field = null    ADD    clean values, placed after the last field
 *   field = {...}   EDIT   its values
 *
 * Either way Save is the same POST with the field under `custom_fields`
 * (see saveCustomField). The list gives this component a new `key` every
 * time the dialog is opened, so each opening starts from fresh values.
 *
 * ------------------------------------------------------------------
 * AN EDIT SENDS THE WHOLE FIELD BACK
 * ------------------------------------------------------------------
 * The payload starts as a copy of the field exactly as the backend sent it,
 * and the form's values are written over that. So a property this form has
 * no control for - `sr_no`, or one added to the API later - goes back
 * untouched instead of being dropped. Property names are the backend's own
 * (`customizedReport`, `hide_field`) and are never renamed.
 *
 * ------------------------------------------------------------------
 * THE FORM SHOWS ONLY WHAT THE TYPE NEEDS
 * ------------------------------------------------------------------
 * Options and Option Type appear for a dropdown field and for nothing else;
 * SKU Order appears while SKU Field is on. Changing a dropdown to another
 * type sends it with no options, since they would mean nothing there.
 *
 * Props:
 *   open, onOpenChange   controlled by the list, the same as Modal
 *   field                the field being edited as the backend sent it, or
 *                        null to add one
 *   fields               every field of the company, as the backend sent
 *                        them - for the next order, the next SKU order and
 *                        the "name already used" check
 *   companyName          the active company - never typed
 *   onSaved()            after a successful save; the list closes this and reloads
 */

import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'

import {
  Field,
  FieldError,
  FieldLabel,
  FormGrid,
  SelectField,
  ToggleField,
} from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import {
  CUSTOM_FIELD_OPTION_TYPES,
  CUSTOM_FIELD_SIZES,
  CUSTOM_FIELD_TYPE_DROPDOWN,
  CUSTOM_FIELD_TYPES,
  toOptions,
} from '@/Constants/inventory'
import { toast } from '@/Library/toast'
import { saveCustomField } from '@/Services/inventoryService'

const FORM_ID = 'custom-field-form'

const SIZE_OPTIONS = toOptions(CUSTOM_FIELD_SIZES)

/** A saved value as a form value - null becomes '', numbers become text. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value))

/**
 * A dropdown's options plus the saved value when the list does not have it,
 * so a field saved with a type or size this app does not list still shows
 * what it holds - and is sent back unchanged unless the user picks another.
 */
const withSaved = (options, saved) =>
  !saved || options.some((option) => option.value === saved)
    ? options
    : [...options, { value: saved, label: saved }]

/**
 * Whether two rows are the same field: the very same object, or two copies
 * carrying the same `sr_no` (the list may have been read again since the
 * dialog was opened).
 */
const isSameField = (left, right) =>
  Boolean(left && right) && (left === right || (left.sr_no != null && left.sr_no === right.sr_no))

/** One past the largest value of a numeric property - where a new one goes. */
const nextNumber = (fields, property) =>
  fields.reduce((highest, entry) => {
    const value = Number(entry?.[property])
    return Number.isFinite(value) && value > highest ? value : highest
  }, 0) + 1

/*
 * An option in the form is { id, value }: the id is only React's key, so
 * removing one from the middle of the list never moves what was typed into
 * the boxes after it. Only the values are ever sent. The saved options are
 * numbered from 0 here; the form numbers the ones added after that.
 */
const toOption = (id, value = '') => ({ id: `option-${id}`, value })

const initialForm = (field, fields) => ({
  field_name: textOf(field?.field_name),
  field_type: textOf(field?.field_type),
  field_size: textOf(field?.field_size),
  // A new field goes after the last one; an existing one stays where it is.
  field_order: field ? textOf(field.field_order) : String(nextNumber(fields, 'field_order')),
  is_required: Boolean(field?.is_required),
  hide_field: Boolean(field?.hide_field),
  sku_field: Boolean(field?.sku_field),
  sku_no: textOf(field?.sku_no),
  customizedReport: Boolean(field?.customizedReport),
  invoice_description: Boolean(field?.invoice_description),
  option_type: textOf(field?.option_type),
  options: (Array.isArray(field?.options) ? field.options : []).map((option, index) =>
    toOption(index, textOf(option)),
  ),
})
/** The form as plain text, to tell whether anything was changed. */
const snapshot = (form) => JSON.stringify({ ...form, options: form.options.map((option) => option.value) })

export default function CustomFieldFormModal({ open, onOpenChange, field, fields, companyName, onSaved }) {
  const editing = Boolean(field)

  const [initial] = useState(() => initialForm(field, fields))
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // The number the next added option gets - only ever read in a handler.
  const optionCount = useRef(initial.options.length)

  /** A new, empty option box. */
  const newOption = () => {
    optionCount.current += 1
    return toOption(optionCount.current)
  }

  const isDropdown = form.field_type === CUSTOM_FIELD_TYPE_DROPDOWN

  // One handler for every field; editing a field clears its error.
  const setField = (name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  // Digits only, as typed - an order can never be negative or fractional.
  const setDigits = (name, value) => setField(name, value.replace(/\D/g, ''))

  /** A type was picked. A dropdown needs an option type and somewhere to type an option. */
  const selectType = (value) => {
    // Made here, not inside the updater below, which must stay pure.
    const firstOption = newOption()

    setForm((previous) => ({
      ...previous,
      field_type: value,
      ...(value === CUSTOM_FIELD_TYPE_DROPDOWN
        ? {
            option_type: previous.option_type || CUSTOM_FIELD_OPTION_TYPES[0].value,
            options: previous.options.length > 0 ? previous.options : [firstOption],
          }
        : {}),
    }))
    setErrors((previous) => ({ ...previous, field_type: undefined, options: undefined, option_type: undefined }))
  }

  /** SKU Field switched. Turning it on gives the field the next SKU order. */
  const toggleSku = (on) => {
    setForm((previous) => ({
      ...previous,
      sku_field: on,
      sku_no: on && !previous.sku_no ? String(nextNumber(fields, 'sku_no')) : previous.sku_no,
    }))
    setErrors((previous) => ({ ...previous, sku_no: undefined }))
  }

  /* ---------------- Options ---------------- */
  const setOptions = (change) => {
    setForm((previous) => ({ ...previous, options: change(previous.options) }))
    setErrors((previous) => ({ ...previous, options: undefined }))
  }

  const addOption = () => {
    const option = newOption()
    setOptions((options) => [...options, option])
  }
  const removeOption = (id) => setOptions((options) => options.filter((option) => option.id !== id))
  const changeOption = (id, value) =>
    setOptions((options) => options.map((option) => (option.id === id ? { ...option, value } : option)))

  /** The options as they are sent: trimmed, with the boxes left empty dropped. */
  const cleanOptions = () => form.options.map((option) => option.value.trim()).filter(Boolean)

  const validate = () => {
    const found = {}
    const name = form.field_name.trim()

    if (!name) found.field_name = 'Field name is required'
    else if (
      // Two fields answering to one name cannot be told apart anywhere the
      // fields are used. The field being edited is, of course, allowed its own.
      fields.some(
        (entry) => !isSameField(entry, field) && textOf(entry?.field_name).trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      found.field_name = 'A field with this name already exists'
    }

    if (!form.field_type) found.field_type = 'Please select a field type'
    if (!form.field_size) found.field_size = 'Please select a field size'

    if (!form.field_order) found.field_order = 'Order is required'
    else if (Number(form.field_order) < 1) found.field_order = 'Order starts from 1'

    if (isDropdown) {
      const options = cleanOptions()
      const distinct = new Set(options.map((option) => option.toLowerCase()))

      if (options.length === 0) found.options = 'Add at least one option'
      else if (distinct.size !== options.length) found.options = 'Each option must be different'

      if (!form.option_type) found.option_type = 'Please select an option type'
    }

    if (form.sku_field) {
      if (!form.sku_no) found.sku_no = 'SKU order is required'
      else if (Number(form.sku_no) < 1) found.sku_no = 'SKU order starts from 1'
    }

    return found
  }

  /**
   * The field as the backend takes it.
   *
   * Options belong to a dropdown. A field that is one sends what is in the
   * form; one that has just stopped being one sends none; and any other
   * field sends back exactly what it came with, whatever that was.
   */
  const buildField = () => {
    const typeChanged = !editing || form.field_type !== textOf(field.field_type)
    const keepOptions = !isDropdown && !typeChanged

    const built = {
      // Everything the field came with first - see the note at the top.
      ...(editing ? field : {}),
      field_name: form.field_name.trim(),
      field_size: form.field_size,
      field_type: form.field_type,
      options: isDropdown ? cleanOptions() : keepOptions ? (field.options ?? []) : [],
      hide_field: form.hide_field,
      field_order: Number(form.field_order),
      is_required: form.is_required,
      option_type: isDropdown ? form.option_type : keepOptions ? (field.option_type ?? '') : '',
      sku_field: form.sku_field,
      customizedReport: form.customizedReport,
      invoice_description: form.invoice_description,
    }

    // `sku_no` exists only on a SKU field, as in the backend's own rows.
    if (form.sku_field) built.sku_no = Number(form.sku_no)
    else delete built.sku_no

    return built
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (editing && snapshot(form) === snapshot(initial)) {
      toast.info('Nothing has been changed.')
      return
    }

    // Cannot normally happen - Add is disabled without a company - but a
    // field with no owner is worth refusing out loud.
    if (!companyName) {
      toast.error('Select a company before saving a custom field.')
      return
    }

    setSubmitting(true)

    try {
      const response = await saveCustomField(companyName, buildField())

      // Only the message - whatever else the reply carries is the list's to show.
      toast.success(
        response?.msg || (editing ? 'Custom field updated successfully' : 'Custom field added successfully'),
      )
      onSaved?.()
    } catch (failure) {
      // `failure.message` is the backend's own `msg` (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit Custom Field' : 'Add Custom Field'}
      size="lg"
      // While saving, the dialog stays - closing it would hide whether the
      // save worked.
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* `form` ties this button to the form above it, outside of which
              the dialog draws its footer. */}
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={!companyName}>
            {submitting ? 'Saving...' : editing ? 'Update Field' : 'Save Field'}
          </Button>
        </>
      }
    >
      {/* `p-1`: room for the focus ring, inside the dialog's scroll box. */}
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-3 p-1">
        <FormGrid>
          <Field
            id="field_name"
            label="Field Name"
            required
            className="sm:col-span-2"
            value={form.field_name}
            error={errors.field_name}
            disabled={submitting}
            onChange={(event) => setField('field_name', event.target.value)}
          />
          <SelectField
            id="field_type"
            label="Field Type"
            required
            placeholder="Select Field Type"
            options={withSaved(CUSTOM_FIELD_TYPES, initial.field_type)}
            value={form.field_type}
            error={errors.field_type}
            disabled={submitting}
            onValueChange={selectType}
          />
          <SelectField
            id="field_size"
            label="Field Size"
            required
            placeholder="Select Field Size"
            options={withSaved(SIZE_OPTIONS, initial.field_size)}
            value={form.field_size}
            error={errors.field_size}
            disabled={submitting}
            onValueChange={(value) => setField('field_size', value)}
          />
          <Field
            id="field_order"
            label="Order"
            required
            inputMode="numeric"
            autoComplete="off"
            value={form.field_order}
            error={errors.field_order}
            disabled={submitting}
            onChange={(event) => setDigits('field_order', event.target.value)}
          />
          {/* Only a dropdown has a kind of choice to make. */}
          {isDropdown ? (
            <SelectField
              id="option_type"
              label="Option Type"
              required
              placeholder="Select Option Type"
              options={withSaved(CUSTOM_FIELD_OPTION_TYPES, initial.option_type)}
              value={form.option_type}
              error={errors.option_type}
              disabled={submitting}
              onValueChange={(value) => setField('option_type', value)}
            />
          ) : null}
        </FormGrid>

        {/* ---------------- Options (dropdown only) ---------------- */}
        {isDropdown ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              {/* Heads a list of boxes rather than one control, so no `htmlFor`. */}
              <FieldLabel required>Options</FieldLabel>
              <Button type="button" variant="outline" size="xs" icon={Plus} disabled={submitting} onClick={addOption}>
                Add Option
              </Button>
            </div>

            {/* Two to a row, so seventeen options are nine lines, not seventeen. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {form.options.map((option, index) => (
                <div key={option.id} className="flex items-center gap-1.5">
                  <Input
                    value={option.value}
                    placeholder={`Option ${index + 1}`}
                    aria-label={`Option ${index + 1}`}
                    aria-invalid={Boolean(errors.options) || undefined}
                    disabled={submitting}
                    onChange={(event) => changeOption(option.id, event.target.value)}
                    // Enter here means "next option", not "save the field".
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      if (index === form.options.length - 1 && option.value.trim()) addOption()
                    }}
                    // The box just added is the one to type in.
                    autoFocus={index === form.options.length - 1 && !option.value && index > 0}
                  />
                  <Button
                    type="button"
                    variant="iconDelete"
                    size="icon-sm"
                    icon={X}
                    tooltip="Remove"
                    aria-label={`Remove option ${index + 1}`}
                    disabled={submitting}
                    onClick={() => removeOption(option.id)}
                  />
                </div>
              ))}
            </div>

            <FieldError>{errors.options}</FieldError>
          </div>
        ) : null}

        {/* ---------------- Settings ---------------- */}
        <FormGrid>
          <ToggleField
            id="is_required"
            label="Required"
            checked={form.is_required}
            disabled={submitting}
            onCheckedChange={(on) => setField('is_required', on)}
          />
          <ToggleField
            id="hide_field"
            label="Hide Field"
            checked={form.hide_field}
            disabled={submitting}
            onCheckedChange={(on) => setField('hide_field', on)}
          />
          <ToggleField
            id="customizedReport"
            label="Customized Report"
            checked={form.customizedReport}
            disabled={submitting}
            onCheckedChange={(on) => setField('customizedReport', on)}
          />
          <ToggleField
            id="invoice_description"
            label="Invoice Description"
            checked={form.invoice_description}
            disabled={submitting}
            onCheckedChange={(on) => setField('invoice_description', on)}
          />
          <ToggleField
            id="sku_field"
            label="SKU Field"
            checked={form.sku_field}
            disabled={submitting}
            onCheckedChange={toggleSku}
          />
          {/* Its place in the SKU - only a SKU field has one. */}
          {form.sku_field ? (
            <Field
              id="sku_no"
              aria-label="SKU Order"
              prefix="SKU Order"
              inputClassName="pl-24"
              inputMode="numeric"
              autoComplete="off"
              value={form.sku_no}
              error={errors.sku_no}
              disabled={submitting}
              onChange={(event) => setDigits('sku_no', event.target.value)}
            />
          ) : null}
        </FormGrid>
      </form>
    </Modal>
  )
}

/**
 * The Create / Edit Warehouse dialog, on the Warehouse tab of Inventory
 * Details.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO MODES
 * ------------------------------------------------------------------
 *   warehouse = null    CREATE   clean fields, POST with the company_id
 *   warehouse = {...}   EDIT     its values, PUT with its warehouse_obj_id
 *
 * The fields start from `warehouse` as the component mounts. The list gives
 * this component a new `key` every time the dialog is opened, so each
 * opening starts from fresh values - nothing typed into a dialog that was
 * closed ever comes back.
 *
 * Every field is named as the backend names it, so the payload is the form
 * with nothing renamed. `company_id` is never a field: it is the company the
 * header is working in, handed in by the list.
 *
 * Props:
 *   open, onOpenChange   controlled by the list, the same as Modal
 *   warehouse            the row being edited, or null to create one
 *   companyId            the active company - what a new warehouse is filed under
 *   onSaved()            after a successful save; the list closes this and reloads
 */

import { useState } from 'react'
import { Mail, MapPin, Phone, User, Warehouse } from 'lucide-react'

import {
  Field,
  FormGrid,
  SelectField,
  TextareaField,
  ToggleField,
} from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { findStateByName, INDIAN_STATES } from '@/Constants/indianStates'
import { toast } from '@/Library/toast'
import { createWarehouse, getWarehouseId, updateWarehouse } from '@/Services/inventoryService'

const FORM_ID = 'warehouse-form'

const STATE_OPTIONS = INDIAN_STATES.map((state) => ({ value: state.name, label: state.name }))

// The same rules the Add Company form uses for the same kinds of value.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MOBILE_PATTERN = /^[6-9]\d{9}$/
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/

/** A clean form - what Create always opens with. */
const EMPTY_FORM = {
  name: '',
  warehouse_address: '',
  contact: '',
  email: '',
  pincode: '',
  state_name: '',
  contact_person_name: '',
  is_manufacturing_plant: false,
  // is_active: true,
}

/** A saved value as a form value - null becomes '', numbers become text. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value))

const initialForm = (warehouse) =>
  warehouse
    ? {
        name: textOf(warehouse.name),
        warehouse_address: textOf(warehouse.warehouse_address),
        contact: textOf(warehouse.contact),
        email: textOf(warehouse.email),
        pincode: textOf(warehouse.pincode),
        // Matched to the list's own spelling, so "GUJARAT" still selects
        // Gujarat; a name that is not an Indian state has to be chosen again.
        state_name: findStateByName(warehouse.state_name)?.name ?? '',
        contact_person_name: textOf(warehouse.contact_person_name),
        is_manufacturing_plant: Boolean(warehouse.is_manufacturing_plant),
        // is_active: warehouse.is_active === undefined ? true : Boolean(warehouse.is_active),
      }
    : EMPTY_FORM

export default function WarehouseFormModal({ open, onOpenChange, warehouse, companyId, onSaved }) {
  const editing = Boolean(warehouse)

  const [initial] = useState(() => initialForm(warehouse))
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // One handler for every field; editing a field clears its error.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  // Digits only, as typed - the field can never hold a letter or a space.
  const setDigits = (field, value) => setField(field, value.replace(/\D/g, ''))

  const validate = () => {
    const found = {}

    if (!form.name.trim()) found.name = 'Warehouse name is required'
    if (!form.warehouse_address.trim()) found.warehouse_address = 'Address is required'

    if (!form.contact) found.contact = 'Contact number is required'
    else if (!MOBILE_PATTERN.test(form.contact)) found.contact = 'Enter a valid 10-digit mobile number'

    if (!form.email.trim()) found.email = 'Email is required'
    else if (!EMAIL_PATTERN.test(form.email.trim())) found.email = 'Enter a valid email address'

    if (!form.pincode) found.pincode = 'Pincode is required'
    else if (!PINCODE_PATTERN.test(form.pincode)) found.pincode = 'Enter a valid 6-digit pincode'

    if (!form.state_name) found.state_name = 'Please select a state'
    if (!form.contact_person_name.trim()) found.contact_person_name = 'Contact person is required'

    return found
  }

  /** The warehouse as the backend takes it: text trimmed, numbers kept as text. */
  const buildFields = () => ({
    name: form.name.trim(),
    warehouse_address: form.warehouse_address.trim(),
    contact: form.contact,
    email: form.email.trim(),
    pincode: form.pincode,
    state_name: form.state_name,
    contact_person_name: form.contact_person_name.trim(),
    is_manufacturing_plant: form.is_manufacturing_plant,
    // is_active: form.is_active,
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (editing && Object.keys(initial).every((field) => form[field] === initial[field])) {
      toast.info('Nothing has been changed.')
      return
    }

    // Cannot normally happen - Create is disabled without a company - but a
    // warehouse with no owner is worth refusing out loud.
    if (!editing && !companyId) {
      toast.error('Select a company before creating a warehouse.')
      return
    }

    setSubmitting(true)

    try {
      const response = editing
        ? await updateWarehouse({ warehouse_obj_id: getWarehouseId(warehouse), ...buildFields() })
        : await createWarehouse({ company_id: companyId, ...buildFields() })

      // Only the message - the `data` that comes with it is the list's to show.
      toast.success(
        response?.msg || (editing ? 'Warehouse updated successfully' : 'Warehouse saved successfully'),
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
      title={editing ? 'Edit Warehouse' : 'Create Warehouse'}
      size="lg"
      // While saving, the dialog stays - closing it would hide whether the
      // save worked.
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
      autoFocus={false}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* `form` ties this button to the form above it, outside of which
              the dialog draws its footer. */}
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={!editing && !companyId}>
            {submitting ? 'Saving...' : editing ? 'Update Warehouse' : 'Save Warehouse'}
          </Button>
        </>
      }
    >
      {/* `p-1`: room for the focus ring, inside the dialog's scroll box. */}
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-3 p-1">
        <FormGrid>
          <Field
            id="warehouse_name"
            label="Warehouse Name"
            required
            icon={Warehouse}
            value={form.name}
            error={errors.name}
            disabled={submitting}
            onChange={(event) => setField('name', event.target.value)}
          />
          <Field
            id="contact_person_name"
            label="Contact Person"
            required
            icon={User}
            value={form.contact_person_name}
            error={errors.contact_person_name}
            disabled={submitting}
            onChange={(event) => setField('contact_person_name', event.target.value)}
          />
          <Field
            id="warehouse_contact"
            label="Contact"
            required
            type="tel"
            inputMode="numeric"
            maxLength={10}
            icon={Phone}
            prefix="+91"
            value={form.contact}
            error={errors.contact}
            disabled={submitting}
            onChange={(event) => setDigits('contact', event.target.value)}
          />
          <Field
            id="warehouse_email"
            label="Email"
            required
            type="email"
            icon={Mail}
            value={form.email}
            error={errors.email}
            disabled={submitting}
            onChange={(event) => setField('email', event.target.value)}
          />
          <TextareaField
            id="warehouse_address"
            label="Warehouse Address"
            required
            rows={2}
            className="sm:col-span-2"
            value={form.warehouse_address}
            error={errors.warehouse_address}
            disabled={submitting}
            onChange={(event) => setField('warehouse_address', event.target.value)}
          />
          <SelectField
            id="warehouse_state"
            label="State"
            required
            icon={MapPin}
            placeholder="Select a state"
            searchable
            searchPlaceholder="Search state"
            options={STATE_OPTIONS}
            value={form.state_name}
            error={errors.state_name}
            disabled={submitting}
            onValueChange={(value) => setField('state_name', value)}
          />
          <Field
            id="warehouse_pincode"
            label="Pincode"
            required
            inputMode="numeric"
            maxLength={6}
            value={form.pincode}
            error={errors.pincode}
            disabled={submitting}
            onChange={(event) => setDigits('pincode', event.target.value)}
          />
          <ToggleField
            id="is_manufacturing_plant"
            label="Manufacturing Plant"
            checked={form.is_manufacturing_plant}
            disabled={submitting}
            onCheckedChange={(on) => setField('is_manufacturing_plant', on)}
          />
          {/* <ToggleField
            id="warehouse_is_active"
            label="Active"
            checked={form.is_active}
            disabled={submitting}
            onCheckedChange={(on) => setField('is_active', on)}
          /> */}
        </FormGrid>
      </form>
    </Modal>
  )
}

/**
 * The Master Details form, on the Master Details tab of Inventory Details.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO MODES
 * ------------------------------------------------------------------
 * `record` decides which mode this is, as in BankForm:
 *
 *   record = null    ADD    empty fields, POST a new record
 *   record = {...}   EDIT   fields filled from it, PUT the changes
 *
 * The fields start filled in from `record` as the component mounts; the
 * parent mounts a fresh form every time Edit is clicked, so Cancel needs no
 * "restore" step - the edited copy is simply thrown away.
 *
 * ------------------------------------------------------------------
 * EVERY FIELD IS NAMED AS THE BACKEND NAMES IT
 * ------------------------------------------------------------------
 * `business_type`, `fifo_lifo`, `is_negative`, `dead_stock` - casing and all -
 * so the payload is the form with nothing renamed on the way out. The labels
 * on screen are the only friendly names.
 *
 * The company and the email are never typed: they are the company the
 * header is working in and the signed-in user, shown read-only so the user
 * can see what they are saving against.
 *
 * Props:
 *   record     the saved record, or null to add one
 *   compName   the active company's name     -> `comp_name`
 *   email      the signed-in user's email    -> `email`
 *   samples    useSampleInvoices(), for the Invoice Format field
 *   onSaved(record | null)  after a successful save; the saved record when
 *              the reply carries one, otherwise null (the parent re-reads it)
 *   onCancel() leaves edit mode
 */

import { useState } from 'react'
import { Building2, Mail } from 'lucide-react'

import {
  Field,
  FormActions,
  FormGrid,
  SelectField,
  ToggleField,
} from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import {
  BUSINESS_TYPES,
  INDUSTRY_TYPES,
  INVENTORY_VALUATION_METHODS,
  toOptions,
} from '@/Constants/inventory'
import { toast } from '@/Library/toast'
import {
  createMasterDetails,
  getMasterDetailsId,
  toMasterDetails,
  updateMasterDetails,
} from '@/Services/inventoryService'
import InvoiceFormatPicker from './InvoiceFormatPicker'

const INDUSTRY_OPTIONS = toOptions(INDUSTRY_TYPES)
const BUSINESS_OPTIONS = toOptions(BUSINESS_TYPES)
const VALUATION_OPTIONS = toOptions(INVENTORY_VALUATION_METHODS)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The two counts, which must be whole numbers of zero or more. */
const COUNT_FIELDS = ['dead_stock', 'expiry_alert_days']

/**
 * Fields of the record this form does not edit. They are sent back on an
 * update exactly as they were read, so changing a setting here can never
 * wipe a pattern configured somewhere else.
 */
const PRESERVED_FIELDS = ['sku_pattern', 'description_pattern', 'other_details']

/**
 * A dropdown's options plus the saved value when the list does not have it,
 * so a record saved before a list changed still shows what it holds instead
 * of an empty dropdown.
 */
const withSaved = (options, saved) =>
  !saved || options.some((option) => option.value === saved)
    ? options
    : [...options, { value: saved, label: saved }]

/** A saved value as a form value - null becomes '', everything else a string. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value))

/** The form's starting values: the record's, or blanks for a new one. */
const initialForm = (record) => ({
  industry_type: textOf(record?.industry_type),
  business_type: textOf(record?.business_type),
  fifo_lifo: textOf(record?.fifo_lifo).toUpperCase(),
  pdf_format: textOf(record?.pdf_format),
  is_negative: Boolean(record?.is_negative),
  barcode: Boolean(record?.barcode),
  sku: Boolean(record?.sku),
  dead_stock: textOf(record?.dead_stock),
  expiry_alert_days: textOf(record?.expiry_alert_days),
})

export default function MasterDetailsForm({ record, compName, email, samples, onSaved, onCancel }) {
  const editing = Boolean(record)

  const [initial] = useState(() => initialForm(record))
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // One handler for every field; editing a field clears its error.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  // Digits only: no minus sign, no decimal point, no "e" - so a count can
  // never be typed negative or fractional in the first place.
  const setCount = (field, value) => setField(field, value.replace(/\D/g, ''))

  /**
   * Checks the form and returns an object of error messages; empty means it
   * passed. Only what the backend cannot do without is required.
   */
  const validate = () => {
    const found = {}

    if (!compName) found.comp_name = 'Select a company in the header first'
    if (!email) found.email = 'Email is required'
    else if (!EMAIL_PATTERN.test(email)) found.email = 'Email is not valid'

    if (!form.industry_type) found.industry_type = 'Please select an industry type'
    if (!form.business_type) found.business_type = 'Please select a business type'
    if (!form.fifo_lifo) found.fifo_lifo = 'Please select a valuation method'
    if (!form.pdf_format) found.pdf_format = 'Please choose an invoice format'

    COUNT_FIELDS.forEach((field) => {
      if (form[field] === '') found[field] = 'Enter a number (0 or more)'
      else if (!/^\d+$/.test(form[field])) found[field] = 'Enter a whole number (0 or more)'
    })

    return found
  }

  /** The record as the backend takes it: booleans as booleans, numbers as numbers. */
  const buildPayload = () => ({
    company_name: compName,
    email,
    industry_type: form.industry_type,
    business_type: form.business_type,
    fifo_lifo: form.fifo_lifo,
    pdf_format: Number(form.pdf_format),
    is_negative: form.is_negative,
    barcode: form.barcode,
    sku: form.sku,
    dead_stock: Number(form.dead_stock),
    expiry_alert_days: Number(form.expiry_alert_days),
  })

  const changed = Object.keys(initial).some((field) => form[field] !== initial[field])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    if (editing && !changed) {
      toast.info('Nothing has been changed.')
      return
    }

    setSubmitting(true)

    try {
      let response

      if (editing) {
        const preserved = Object.fromEntries(
          PRESERVED_FIELDS.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]),
        )
        response = await updateMasterDetails({
          company_master_id: getMasterDetailsId(record),
          ...preserved,
          ...buildPayload(),
        })
      } else {
        response = await createMasterDetails(buildPayload())
      }

      toast.success(
        response?.msg ||
        (editing ? 'Master details updated successfully.' : 'Master details saved successfully.'),
      )

      onSaved?.(toMasterDetails(response))
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Panel title={editing ? 'Edit Master Details' : 'Add Master Details'}>
      {!editing ? (
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          Set up your inventory master configuration.
        </p>
      ) : null}

      {/* space-y-3 between the grids matches the gap between rows inside
          them, so the form reads as one evenly spaced set of rows. */}
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* Two to a row from `sm` up, one on a phone (FormGrid): the company,
            then how it is classified. */}
        <FormGrid>
          <Field
            id="comp_name"
            label="Company Name"
            required
            readOnly
            icon={Building2}
            value={compName || 'No company selected'}
            error={errors.comp_name}
          />
          <Field
            id="email"
            label="Email"
            required
            readOnly
            icon={Mail}
            value={email || ''}
            error={errors.email}
          />
          <SelectField
            id="industry_type"
            label="Industry Type"
            required
            placeholder="Select Industry Type"
            options={withSaved(INDUSTRY_OPTIONS, initial.industry_type)}
            value={form.industry_type}
            error={errors.industry_type}
            disabled={submitting || editing}
            searchable
            searchPlaceholder="Search industry..."
            onValueChange={(value) => setField('industry_type', value)}
          />
          <SelectField
            id="business_type"
            label="Business Type"
            required
            placeholder="Select Business Type"
            options={withSaved(BUSINESS_OPTIONS, initial.business_type)}
            value={form.business_type}
            error={errors.business_type}
            disabled={submitting || editing}
            onValueChange={(value) => setField('business_type', value)}
          />
        </FormGrid>

        {/* Three to a row from `sm` up, stacked on a phone. Labels are kept
            short enough to stay on one line in a third of the column, so the
            boxes in a row stay level. */}
        <FormGrid className="sm:grid-cols-3">
          <SelectField
            id="fifo_lifo"
            label="Valuation Method"
            required
            placeholder="Select Method"
            options={withSaved(VALUATION_OPTIONS, initial.fifo_lifo)}
            value={form.fifo_lifo}
            error={errors.fifo_lifo}
            disabled={submitting || editing}
            onValueChange={(value) => setField('fifo_lifo', value)}
          />
          <Field
            id="dead_stock"
            label="Dead Stock"
            required
            inputMode="numeric"
            autoComplete="off"
            value={form.dead_stock}
            error={errors.dead_stock}
            disabled={submitting}
            onChange={(event) => setCount('dead_stock', event.target.value)}
          />
          <Field
            id="expiry_alert_days"
            label="Expiry Alert Days"
            required
            inputMode="numeric"
            autoComplete="off"
            value={form.expiry_alert_days}
            error={errors.expiry_alert_days}
            disabled={submitting}
            onChange={(event) => setCount('expiry_alert_days', event.target.value)}
          />
        </FormGrid>

        {/* The three switches, the same way - label above, as for a field. */}
        <FormGrid className="sm:grid-cols-3">
          <ToggleField
            stacked
            id="is_negative"
            label="Negative Inventory"
            checked={form.is_negative}
            disabled={submitting }
            onCheckedChange={(on) => setField('is_negative', on)}
          />
          <ToggleField
            stacked
            id="barcode"
            label="Enable Barcode"
            checked={form.barcode}
            disabled={submitting}
            onCheckedChange={(on) => setField('barcode', on)}
          />
          <ToggleField
            stacked
            id="sku"
            label="Enable SKU"
            checked={form.sku}
            disabled={submitting || editing}
            onCheckedChange={(on) => setField('sku', on)}
          />
        </FormGrid>

        <InvoiceFormatPicker
          samples={samples}
          value={form.pdf_format}
          error={errors.pdf_format}
          disabled={submitting}
          onChange={(value) => setField('pdf_format', value)}
        />

        {/* ---------------- Actions ----------------
            Cancel only exists while editing - an Add form has nothing to go
            back to. */}
        <FormActions>
          {editing ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          ) : null}

          <Button type="submit" loading={submitting} disabled={!compName}>
            {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Save Master Details'}
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}

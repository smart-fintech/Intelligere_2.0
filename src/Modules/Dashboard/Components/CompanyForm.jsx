/**
 * The Company Form card, on the left of the Company Details page.
 *
 * ------------------------------------------------------------------
 * EDIT ONLY
 * ------------------------------------------------------------------
 * Companies are added from the header (the + beside the company picker), so
 * this form never creates one: it shows one existing company and changes it.
 * Its only action is Update.
 *
 * The company NAME is shown but cannot be changed - it is read-only here and
 * is never part of what is sent.
 *
 * Which company is shown is the page's decision (the one whose Edit was
 * clicked, or else the one the header is working in). The page gives this
 * component a `key` of that company's company_id, so choosing another
 * company remounts it and the fields fill in from the new record - no effect
 * copies the record into state.
 *
 * ------------------------------------------------------------------
 * WHAT IS SENT
 * ------------------------------------------------------------------
 *   PUT tally/user-companies-list/   { company_id, ...only the changed fields }
 *
 * Only what the user actually edited goes up, so a field the list did not
 * return can never be blanked by saving the form.
 *
 * Props:
 *   company    the company record to show, or null
 *   onSaved()  called after a successful update, so the list can refresh
 */

import { useState } from 'react'
import { Building2, Mail, Phone, Globe } from 'lucide-react'

import { StateMessage } from '@/Components/Common/DataList'
import {
  Field,
  FormActions,
  FormGrid,
  SelectField,
  TextareaField,
} from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { INDIAN_STATES } from '@/Constants/indianStates'
import { toast } from '@/Library/toast'
import { updateCompany } from '@/Services/companyService'
import { isValidGstNumber } from '@/Services/gstService'

/*
 * The fields the user may change, named exactly as the company API names
 * them, so the payload is the form with nothing renamed on the way out.
 *
 * `cst_no`, `udyam` and `category` are not in the list reply today. They are
 * shown empty and, like every field here, only sent once the user types into
 * them.
 */
const EDITABLE_FIELDS = [
  'comp_address',
  'comp_email',
  'comp_phone',
  'comp_website',
  'comp_gstin',
  'cst_no',
  'vat_no',
  'pan_no',
  'comp_state',
  'udyam',
  'category',
  'gst_username',
]

// Codes written in capitals whatever case they are typed in.
const UPPERCASE_FIELDS = new Set(['comp_gstin', 'pan_no', 'udyam'])

/** A company record as form values - every field text, null and missing as ''. */
const formFrom = (company) =>
  Object.fromEntries(
    EDITABLE_FIELDS.map((field) => {
      const value = company?.[field]
      return [field, value === null || value === undefined ? '' : String(value)]
    }),
  )

/** A field's value as it would be saved: trimmed, and capitalised where it is a code. */
const cleaned = (field, value) => {
  const text = value.trim()
  return UPPERCASE_FIELDS.has(field) ? text.toUpperCase() : text
}

export default function CompanyForm({ company, onSaved }) {
  // What the company holds, as last loaded or saved - what "changed" is
  // measured against - and what the fields show now.
  const [saved, setSaved] = useState(() => formFrom(company))
  const [form, setForm] = useState(() => formFrom(company))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /**
   * Checks the form and returns an object of error messages.
   *
   * Every field is optional, so each is checked for shape only when it has
   * something in it - an empty field never blocks an update.
   */
  const validate = () => {
    const found = {}

    const email = form.comp_email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      found.comp_email = 'Enter a valid email address'
    }

    const phone = form.comp_phone.trim()
    if (phone && !/^\d{10}$/.test(phone)) found.comp_phone = 'Enter a valid 10-digit mobile number'

    const gstin = form.comp_gstin.trim()
    if (gstin && !isValidGstNumber(gstin)) found.comp_gstin = 'Enter a valid 15-character GST number'

    const pan = form.pan_no.trim().toUpperCase()
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) found.pan_no = 'Enter a valid 10-character PAN'

    return found
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!company) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // Only what differs from the company as it was loaded.
    const changed = EDITABLE_FIELDS.reduce((payload, field) => {
      const value = cleaned(field, form[field])
      if (value !== saved[field]) payload[field] = value
      return payload
    }, {})

    if (Object.keys(changed).length === 0) {
      toast.info('Nothing has been changed.')
      return
    }

    setSubmitting(true)

    try {
      const response = await updateCompany({ company_id: company.company_id, ...changed })
      toast.success(response?.msg || `${company.comp_name} has been updated.`)

      // What was just saved is the new starting point, so saving again
      // without further edits correctly says "nothing has been changed".
      const nowSaved = { ...saved, ...changed }
      setSaved(nowSaved)
      setForm(nowSaved)

      onSaved?.()
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  // No company to show: nothing is selected in the header and no Edit has
  // been clicked yet.
  if (!company) {
    return (
      <Panel title="Company Form">
        <StateMessage icon={Building2} title="No company selected">
          Click Edit on a company in the list to change its details.
        </StateMessage>
      </Panel>
    )
  }

  return (
    <Panel title="Company Form">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* ---------------- Company name ----------------
            Read-only, and never sent: a company keeps its name. */}
        <Field id="comp_name" label="Company Name" readOnly value={company.comp_name ?? ''} />

        <TextareaField
          id="comp_address"
          label="Address"
          rows={3}
          value={form.comp_address}
          disabled={submitting}
          onChange={(e) => setField('comp_address', e.target.value)}
        />

        {/* Two fields to a row from `sm` up; one on a phone. */}
        <FormGrid>
          <Field
            id="comp_email"
            label="Email"
            type="email"
            icon={Mail}
            value={form.comp_email}
            error={errors.comp_email}
            disabled={submitting}
            onChange={(e) => setField('comp_email', e.target.value)}
          />

          <Field
            id="comp_phone"
            label="Mobile"
            icon={Phone}
            inputMode="numeric"
            maxLength={10}
            value={form.comp_phone}
            error={errors.comp_phone}
            disabled={submitting}
            // Anything that is not a digit is dropped as it is typed.
            onChange={(e) => setField('comp_phone', e.target.value.replace(/\D/g, ''))}
          />

          <Field
            id="comp_website"
            label="Website"
            icon={Globe}
            value={form.comp_website}
            disabled={submitting}
            onChange={(e) => setField('comp_website', e.target.value)}
          />

          <Field
            id="comp_gstin"
            label="GST Number"
            maxLength={15}
            value={form.comp_gstin}
            error={errors.comp_gstin}
            disabled={submitting}
            inputClassName="uppercase"
            onChange={(e) => setField('comp_gstin', e.target.value.toUpperCase())}
          />

          <Field
            id="cst_no"
            label="CST Number"
            value={form.cst_no}
            disabled={submitting}
            onChange={(e) => setField('cst_no', e.target.value)}
          />

          <Field
            id="vat_no"
            label="VAT Number"
            value={form.vat_no}
            disabled={submitting}
            onChange={(e) => setField('vat_no', e.target.value)}
          />

          <Field
            id="pan_no"
            label="PAN Number"
            maxLength={10}
            value={form.pan_no}
            error={errors.pan_no}
            disabled={submitting}
            inputClassName="uppercase"
            onChange={(e) => setField('pan_no', e.target.value.toUpperCase())}
          />

          {/* A state saved in some other spelling matches no option; it is
              then shown as the placeholder rather than disappearing. */}
          <SelectField
            id="comp_state"
            label="State"
            // placeholder={form.comp_state || 'Select State'}
            value={form.comp_state}
            disabled={submitting}
            searchable
            searchPlaceholder="Search state..."
            onValueChange={(value) => setField('comp_state', value)}
            options={INDIAN_STATES.map((state) => ({ value: state.name, label: state.name }))}
          />

          <Field
            id="udyam"
            label="Udyam"
            value={form.udyam}
            disabled={submitting}
            inputClassName="uppercase"
            onChange={(e) => setField('udyam', e.target.value.toUpperCase())}
          />

          <Field
            id="category"
            label="Category"
            value={form.category}
            disabled={submitting}
            onChange={(e) => setField('category', e.target.value)}
          />

          <Field
            id="gst_username"
            label="GST Username"
            autoComplete="off"
            value={form.gst_username}
            disabled={submitting}
            onChange={(e) => setField('gst_username', e.target.value)}
          />
        </FormGrid>

        {/* ---------------- Action ----------------
            Update only - there is no Create here. */}
        <FormActions>
          <Button type="submit" loading={submitting}>
            {submitting ? 'Updating...' : 'Update'}
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}

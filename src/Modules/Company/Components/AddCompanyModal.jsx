/**
 * The Add company form, in a modal.
 *
 * Opened by the Add company button in the header (see CompanySwitcher).
 * It POSTs to tally/intelligere-company-create/, and that reply is the new
 * full list of companies - which is handed back through `onCreated` so the
 * picker beside the button updates without a second call.
 *
 * ------------------------------------------------------------------
 * TWO WAYS TO FILL THIS IN
 * ------------------------------------------------------------------
 * The "Fill from GSTIN" switch at the top chooses between them:
 *
 *   OFF (normal)   every field is shown and typed in by hand.
 *
 *   ON  (lookup)   every field is hidden except the GST number. The button
 *                  becomes "Fetch details": it looks the number up through
 *                  Services/gstService, writes the name, address, pincode
 *                  and state into the form, and switches back to the full
 *                  form so the user can add the one thing a GST record does
 *                  not carry - a mobile number - and save.
 *
 * Props:
 *   open        whether the modal is showing
 *   onOpenChange(next)  called when it should open or close
 *   onCreated(companies)  the new list, after a successful save
 *
 * Every rule about what may be saved lives in `validate()` below, next to
 * the fields it is about - nothing is validated in the service layer.
 */

import { useState } from 'react'
import { Search } from 'lucide-react'

import { Field, FormGrid, SelectField, SwitchField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { INDIAN_STATES, findStateByGstNumber } from '@/Constants/indianStates'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { createIntelligereCompany } from '@/Services/companyService'
import { useGstLookup } from '@/Hooks/useGstLookup'
import { isValidGstNumber } from '@/Services/gstService'

/* ------------------------------------------------------------------ */
/* The form                                                           */
/* ------------------------------------------------------------------ */

// The six fields the backend asks for, named exactly as it names them, so
// the payload is the form with nothing renamed on the way out.
const EMPTY_FORM = {
  comp_name: '',
  gst_no: '',
  mobile_no: '',
  comp_address: '',
  pincode: '',
  comp_state: '',
}

export default function AddCompanyModal({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Whether the form is in "look it up" mode rather than "type it in" mode.
  const [lookupMode, setLookupMode] = useState(false)
  // The GST lookup, shared with the Ledger form so both behave the same -
  // see Hooks/useGstLookup. `fetching` is true while it is asking.
  const gst = useGstLookup()
  const fetching = gst.looking

  const busy = submitting || fetching

  // One handler for every field. Editing a field also clears its error, so
  // a message disappears as soon as the user starts fixing it rather than
  // sitting there until the next save.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /**
   * Checks the form and returns an object of error messages.
   * An empty object means everything passed.
   */
  const validate = () => {
    const found = {}

    const name = form.comp_name.trim()
    if (!name) found.comp_name = 'Company name is required'
    else if (name.length < 2) found.comp_name = 'Enter at least 2 characters'

    const gst = form.gst_no.trim().toUpperCase()
    if (!gst) found.gst_no = 'GST number is required'
    else if (!isValidGstNumber(gst))
      found.gst_no = 'Enter a valid 15-character GST number'

    if (!form.mobile_no.trim()) found.mobile_no = 'Mobile number is required'
    else if (!/^[6-9]\d{9}$/.test(form.mobile_no.trim()))
      found.mobile_no = 'Enter a valid 10-digit mobile number'

    if (!form.comp_address.trim()) found.comp_address = 'Address is required'

    if (!form.pincode.trim()) found.pincode = 'Pincode is required'
    else if (!/^[1-9][0-9]{5}$/.test(form.pincode.trim()))
      found.pincode = 'Enter a valid 6-digit pincode'

    if (!form.comp_state) found.comp_state = 'Please select a state'

    // The first two digits of a GST number ARE the state code, so a GST
    // from Gujarat filed under Maharashtra is a typo the user can fix now
    // rather than a rejected company later. Only worth saying when both
    // fields are otherwise valid.
    if (!found.gst_no && !found.comp_state) {
      const gstState = findStateByGstNumber(gst)
      if (gstState && gstState.name !== form.comp_state) {
        found.gst_no = `That GST number belongs to ${gstState.name}`
      }
    }

    return found
  }

  const close = () => {
    // A half-typed form is thrown away on close, so opening the modal again
    // always starts clean - in the normal mode, not whichever one was last
    // used.
    setForm(EMPTY_FORM)
    setErrors({})
    setLookupMode(false)
    onOpenChange(false)
  }

  /* ---------------------------------------------------------------- */
  /* Filling the form from a GST number                               */
  /* ---------------------------------------------------------------- */

  const runLookup = async () => {
    const result = await gst.lookup(form.gst_no, {
      successMessage: 'Details filled in. Add a mobile number to finish.',
    })

    if (result.fieldError) {
      setErrors({ gst_no: result.fieldError })
      return
    }

    // Failed: the message has been shown and the form is left as it was.
    if (!result.details) return

    const details = result.details

    // Only what came back is written; anything the record does not carry
    // keeps whatever was already typed. A GST record has no mobile number at
    // all, which is why the form reopens after this.
    setForm((previous) => ({
      ...previous,
      gst_no: details.gstNumber || previous.gst_no.trim().toUpperCase(),
      comp_name: details.name || previous.comp_name,
      comp_address: details.address || previous.comp_address,
      pincode: details.pincode || previous.pincode,
      comp_state: details.state || previous.comp_state,
    }))
    setErrors({})

    // Back to the full form, so the user can see what arrived, add the
    // mobile number, and save.
    setLookupMode(false)
  }

  /* ---------------------------------------------------------------- */
  /* Saving                                                           */
  /* ---------------------------------------------------------------- */

  const handleSubmit = async (event) => {
    event.preventDefault()

    // In lookup mode the button fetches instead of saving - there is not
    // enough in the form to save yet.
    if (lookupMode) {
      runLookup()
      return
    }

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)

    try {
      // Trimmed here, once, so no stray space is ever saved. GST is sent in
      // upper case because that is the only form the backend recognises.
      const companies = await createIntelligereCompany({
        gst_no: form.gst_no.trim().toUpperCase(),
        mobile_no: form.mobile_no.trim(),
        comp_name: form.comp_name.trim(),
        comp_address: form.comp_address.trim(),
        pincode: form.pincode.trim(),
        comp_state: form.comp_state,
      })

      toast.success(`${form.comp_name.trim()} has been added.`)
      // The reply IS the new list, so the picker is handed it directly.
      onCreated?.(companies)
      close()
    } catch (error) {
      // `error.message` is the text the backend sent, nothing else.
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      // Closing by Escape or by the X goes through the same tidy-up as
      // Cancel, so there is one way out and it always clears the form.
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Add Company"
      size="lg"
      // While a request is in flight the modal cannot be dismissed by
      // accident - it would carry on regardless and the user would never
      // see whether it worked.
      closeOnBackdropClick={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>

          {/* `form="add-company-form"` links this button to the form below,
              which is what makes the Enter key work as well as the click. */}
          <Button
            type="submit"
            form="add-company-form"
            loading={busy}
            icon={lookupMode ? Search : undefined}
          >
            {fetching
              ? 'Fetching...'
              : submitting
                ? 'Adding...'
                : lookupMode
                  ? 'Fetch Details'
                  : 'Add Company'}
          </Button>
        </>
      }
    >
      <form id="add-company-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* ---------------- Fill from GSTIN ---------------- */}
        <SwitchField
          id="fill-from-gstin"
          label="Fill from GSTIN"
          checked={lookupMode}
          disabled={busy}
          onCheckedChange={(next) => {
            setLookupMode(next)
            setErrors({})
          }}
        />

        <FormGrid>
          {/* The GST number is the one field shown in BOTH modes - it is
              what the lookup needs, and what the company is saved with. On
              its own it takes the full width. */}
          {lookupMode ? null : (
            <>
              <Field
                id="comp_name"
                label="Company Name"
                required
                value={form.comp_name}
                error={errors.comp_name}
                onChange={(e) => setField('comp_name', e.target.value)}
              />
            </>
          )}
          <Field
            id="gst_no"
            label="GST Number"
            required
            maxLength={15}
            autoFocus={lookupMode}
            // Typed in lower case, stored in upper - the user does not have
            // to hold shift for fifteen characters.
            value={form.gst_no}
            error={errors.gst_no}
            onChange={(e) => setField('gst_no', e.target.value.toUpperCase())}
            inputClassName="uppercase"
            className={cn(lookupMode && 'sm:col-span-2')}
          />

          {/* ---------------- Everything else ----------------
              Hidden entirely in lookup mode rather than greyed out: in that
              mode they are not waiting for input, they are about to be
              filled in. */}
          {lookupMode ? null : (
            <>
              <Field
                id="mobile_no"
                label="Mobile Number"
                required
                inputMode="numeric"
                maxLength={10}
                // Anything that is not a digit is dropped as it is typed, so
                // the field cannot hold a value validation would reject.
                value={form.mobile_no}
                error={errors.mobile_no}
                onChange={(e) => setField('mobile_no', e.target.value.replace(/\D/g, ''))}
              />

              <Field
                id="pincode"
                label="Pincode"
                required
                inputMode="numeric"
                maxLength={6}
                value={form.pincode}
                error={errors.pincode}
                onChange={(e) => setField('pincode', e.target.value.replace(/\D/g, ''))}
              />

              <SelectField
                id="comp_state"
                label="State"
                required
                placeholder="Select a state"
                className="sm:col-span-2"
                value={form.comp_state}
                error={errors.comp_state}
                onValueChange={(value) => setField('comp_state', value)}
                options={INDIAN_STATES.map((state) => ({ value: state.name, label: state.name }))}
              />

              <Field
                id="comp_address"
                label="Address"
                required
                className="sm:col-span-2"
                value={form.comp_address}
                error={errors.comp_address}
                onChange={(e) => setField('comp_address', e.target.value)}
              />
            </>
          )}
        </FormGrid>
      </form>
    </Modal>
  )
}

/**
 * The Ledger Form card, on the left of the Ledger Details page.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO MODES
 * ------------------------------------------------------------------
 *   ledger = null    ADD    empty fields, POST a new ledger  -> "Create"
 *   ledger = {...}   EDIT   fields filled from that row, PUT -> "Update"
 *
 * The fields are filled in by the initialiser as the component mounts;
 * LedgerDetails gives it a `key` that changes with the row being edited, so
 * React remounts it and no effect is needed to copy the row in.
 *
 * ------------------------------------------------------------------
 * IT FETCHES NOTHING BY ITSELF
 * ------------------------------------------------------------------
 * The Ledger Group and Bank Name dropdowns are read from the store - the
 * groups from ledgerSlice, the banks from bankSlice, which is the SAME data
 * the Bank Details page uses. Neither is fetched here, so opening this form,
 * editing, or typing in it never causes a request.
 *
 * The one request this form can make is the GSTIN lookup, and only when the
 * user asks for it - see runGstLookup below.
 *
 * Props:
 *   ledger      the row being edited, or null to add a new one
 *   companyId   the selected company - what a new ledger is filed under
 *   companyName shown read-only, so the user can see what they are adding to
 *   groups      the ledger groups, from the store
 *   bankNames   the bank list, from the store (shared with Bank Details)
 *   onSaved()   called after a successful save, so the list can refresh
 *   onCancel()  leaves edit mode and goes back to an empty form
 */

import { useState } from 'react'
import { Search } from 'lucide-react'

import {
  Field,
  FormActions,
  FormGrid,
  SelectField,
  SwitchField,
  TextareaField,
} from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { GST_RATES, GST_REGISTRATION_TYPES } from '@/Constants/gst'
import { INDIAN_STATES } from '@/Constants/indianStates'
import { useGstLookup } from '@/Hooks/useGstLookup'
import { toast } from '@/Library/toast'
import { isValidGstNumber } from '@/Services/gstService'
import { createLedger, getLedgerId, updateLedger } from '@/Services/ledgerService'

/**
 * The fields the form owns, named exactly as the backend names them (the
 * misspelling of "ledeger" is the API's, not ours), so the payload is the
 * form with nothing renamed on the way out.
 */
const EMPTY_FORM = {
  ledeger_name: '',
  ledger_gst_reg_type: 'Regular',
  ledeger_group_name: '',
  ledger_sac: '',
  ledeger_address: '',
  ledeger_email: '',
  ledeger_phone: '',
  ledeger_website: '',
  ledeger_gstin: '',
  ledeger_state: '',
  ledger_pincode: '',
  gst_rate: '',
  ledger_bank: '',
  ledger_accno: '',
  ledger_ifsc: '',
  credit_period_days: '',
}

export default function LedgerForm({
  ledger,
  companyId,
  companyName,
  groups,
  bankNames,
  onSaved,
  onCancel,
}) {
  const editing = Boolean(ledger)

  /* On an edit every field starts filled in from the row: the list endpoint
     returns each ledger with all of these columns, under the same names the
     form uses. The PUT below still sends only what actually changed. */
  const [form, setForm] = useState(() => {
    if (!ledger) return EMPTY_FORM

    const filled = Object.keys(EMPTY_FORM).reduce((values, field) => {
      const value = ledger[field]
      // A column the backend has not filled in comes back as null, and null
      // in an <input> makes it uncontrolled - so it becomes ''. Numbers
      // (credit period, GST rate) become text, which is what inputs hold.
      values[field] = value === null || value === undefined ? '' : String(value)
      return values
    }, {})

    // The group dropdown's options are the group list's names, so the row's
    // group is matched by ID to get exactly that spelling; the name the row
    // carries is the fallback.
    const group = groups.find((entry) => entry.id === ledger.ledeger_group)
    filled.ledeger_group_name = group?.user_show_group ?? filled.ledeger_group_name

    return filled
  })

  /* The values the form opened with, kept so an edit can work out what
     actually changed. Set once and never again, which is safe because this
     component is mounted fresh whenever the edited row changes. */
  const [initialForm] = useState(form)

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  /*
   * "Fill from GSTIN" works exactly as it does on the Add company form,
   * because it IS the same code - see Hooks/useGstLookup. While the switch is
   * on, every other field is hidden and only the GST number and a Fetch
   * Details button are shown; a successful fetch fills the form and switches
   * back.
   */
  const [gstMode, setGstMode] = useState(false)
  const gst = useGstLookup()
  const looking = gst.looking

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /* ---------------------------------------------------------------- */
  /* Fill from GSTIN                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Looks the GST number up and writes what comes back into the form.
   *
   * The checks, the request, the messages and the error handling are all the
   * shared hook's - the same ones the Add company form uses. The base64
   * decoding and the nested address are gstService's. The only thing decided
   * HERE is which returned value belongs in which ledger field.
   *
   * Like the Add company form, a value the GST record carries replaces what
   * is in the field, and a value it does not carry leaves the field alone -
   * so a lookup never blanks anything. The user asked to fill from GSTIN, and
   * the fields were hidden while they did, so the record wins where it has
   * something to say.
   *
   * Only fields the ledger actually has are written. The record also holds
   * the constitution, jurisdiction, registration dates and so on; the ledger
   * API has nowhere to store them, so no form field is invented for them.
   */
  const runGstLookup = async () => {
    const result = await gst.lookup(form.ledeger_gstin, {
      successMessage: 'Details filled in from GSTIN.',
    })

    if (result.fieldError) {
      setErrors({ ledeger_gstin: result.fieldError })
      return
    }

    // Failed: the message has been shown and every field is left as it was.
    if (!result.details) return

    const details = result.details

    setForm((previous) => ({
      ...previous,
      // What was searched for, tidied to the canonical form.
      ledeger_gstin: details.gstNumber || previous.ledeger_gstin.trim().toUpperCase(),
      // A ledger names the party as registered, so the legal name leads and
      // the trade name stands in when there is no legal name.
      ledeger_name: details.legalName || details.name || previous.ledeger_name,
      // The ledger has no city field, so the district goes on the end of the
      // address - where it would be written on an envelope anyway.
      ledeger_address:
        [details.address, details.district].filter(Boolean).join(', ') ||
        previous.ledeger_address,
      ledger_pincode: details.pincode || previous.ledger_pincode,
      ledeger_state: details.state || previous.ledeger_state,
      // Only taken when it is one of the values the dropdown offers -
      // otherwise the select would hold something it cannot show.
      ledger_gst_reg_type: GST_REGISTRATION_TYPES.includes(details.registrationType)
        ? details.registrationType
        : previous.ledger_gst_reg_type,
    }))
    setErrors({})

    // Back to the full form, so the user can see what arrived and fill in
    // what a GST record does not carry - the group, email, phone, bank.
    setGstMode(false)
  }

  /** The switch just changes mode; Fetch Details is what starts a lookup. */
  const toggleGstMode = (next) => {
    setGstMode(next)
    setErrors({})
  }

  /* ---------------------------------------------------------------- */
  /* Saving                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Checks the form and returns an object of error messages.
   *
   * Only the name and the group are required - they are what a ledger IS.
   * The rest are checked for shape only when the user has typed something,
   * so an optional field left blank never blocks a save.
   */
  const validate = () => {
    const found = {}

    if (!form.ledeger_name.trim()) found.ledeger_name = 'Ledger name is required'
    if (!form.ledeger_group_name) found.ledeger_group_name = 'Please select a ledger group'

    const email = form.ledeger_email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      found.ledeger_email = 'Enter a valid email address'
    }

    const phone = form.ledeger_phone.trim()
    if (phone && !/^\d{10}$/.test(phone)) {
      found.ledeger_phone = 'Enter a valid 10-digit phone number'
    }

    const pincode = form.ledger_pincode.trim()
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) {
      found.ledger_pincode = 'Enter a valid 6-digit pincode'
    }

    const gstin = form.ledeger_gstin.trim()
    if (gstin && !isValidGstNumber(gstin.toUpperCase())) {
      found.ledeger_gstin = 'Enter a valid 15-character GSTIN'
    }

    return found
  }

  /** Everything the user typed, trimmed, with the number field as a number. */
  const cleanValue = (field) => {
    const value = form[field].trim()
    // The backend stores the credit period as a number, and an empty box
    // means none rather than an empty string.
    if (field === 'credit_period_days') return Number(value) || 0
    return value
  }

  /**
   * What to send when editing: the id, the company, and only the fields the
   * user actually changed - which is what the API's own example does, and
   * what stops the columns the list never returned from being blanked.
   */
  const buildEditPayload = () => {
    const changed = Object.keys(EMPTY_FORM).reduce((payload, field) => {
      if (form[field] !== initialForm[field]) payload[field] = cleanValue(field)
      return payload
    }, {})

    if (Object.keys(changed).length === 0) return null

    // The ledger's id is its `ledger_obj_id` - the rows have no `id` field.
    return { id: getLedgerId(ledger), company_id: companyId, ...changed }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    // In GSTIN mode the button fetches instead of saving - there is nothing
    // on screen to save yet. Enter in the GST box lands here too.
    if (gstMode) {
      runGstLookup()
      return
    }

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!companyId) {
      toast.error('Select a company before saving a ledger.')
      return
    }

    setSubmitting(true)

    try {
      let response

      if (editing) {
        const payload = buildEditPayload()

        if (!payload) {
          toast.info('Nothing has been changed.')
          setSubmitting(false)
          return
        }

        response = await updateLedger(payload)
      } else {
        // Every field goes up on a create, trimmed, plus the company. The
        // session fields are added by ledgerService.
        const payload = Object.keys(EMPTY_FORM).reduce(
          (built, field) => ({ ...built, [field]: cleanValue(field) }),
          { company_id: companyId },
        )

        response = await createLedger(payload)
      }

      toast.success(
        response?.msg ||
          (editing ? 'Ledger updated successfully.' : 'Ledger added successfully.'),
      )

      if (!editing) setForm(EMPTY_FORM)
      // The list is refreshed ONCE by the parent, which also takes the form
      // back out of edit mode.
      onSaved?.()
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || looking

  return (
    <Panel
      title={editing ? 'Edit Ledger' : 'Ledger Form'}
      actions={
        <SwitchField
          id="fill-from-gstin"
          label="Fill from GSTIN"
          checked={gstMode}
          disabled={busy}
          onCheckedChange={toggleGstMode}
        />
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {gstMode ? (
          /* ---------------- GSTIN mode ----------------
             Everything else is hidden, as on the Add company form: the fields
             are about to be filled in, so they are not waiting for input.
             Enter in this box fetches, the same as the button. */
          <Field
            id="ledeger_gstin_lookup"
            label="GSTIN"
            required
            maxLength={15}
            autoFocus
            placeholder="24BAUPS2722Q2ZV"
            value={form.ledeger_gstin}
            error={errors.ledeger_gstin}
            disabled={looking}
            inputClassName="uppercase"
            // Typed in lower case, stored in upper - no holding shift for
            // fifteen characters.
            onChange={(e) => setField('ledeger_gstin', e.target.value.toUpperCase())}
          />
        ) : (
          <>
            {/* ---------------- Selected company ----------------
                Read-only and full width: the company comes from the header's
                picker, and this is here so the user can see what they are
                filing under. */}
            <Field
              id="ledger_company"
              label="Selected Company"
              required
              readOnly
              value={companyName || 'No company selected'}
            />

            {/* Two fields to a row from `sm` up; one on a phone. The whole grid
                is one element, so every row lines up down the card. */}
            <FormGrid>
              {/* ---- Row 1: Name | GST Registration Type ---- */}
              <Field
                id="ledeger_name"
                label="Name"
                required
                value={form.ledeger_name}
                error={errors.ledeger_name}
                disabled={submitting}
                onChange={(e) => setField('ledeger_name', e.target.value)}
              />

              <SelectField
                id="ledger_gst_reg_type"
                label="GST Registration Type"
                placeholder="Select Type"
                value={form.ledger_gst_reg_type}
                disabled={submitting}
                onValueChange={(value) => setField('ledger_gst_reg_type', value)}
                options={GST_REGISTRATION_TYPES.map((type) => ({ value: type, label: type }))}
              />

              {/* ---- Row 2: Ledger Group | SAC Code ----
                  The groups come from tally/intelligere_group_list/, fetched
                  once into the store. `user_show_group` is both what is shown
                  and what is sent - the payload's group field is the name, not
                  the id. */}
              <SelectField
                id="ledeger_group_name"
                label="Select Ledger Group"
                required
                placeholder={groups.length === 0 ? 'Loading...' : 'Select Ledger Group'}
                value={form.ledeger_group_name}
                error={errors.ledeger_group_name}
                disabled={submitting || groups.length === 0}
                onValueChange={(value) => setField('ledeger_group_name', value)}
                options={groups.map((group) => ({
                  value: group.user_show_group,
                  label: group.user_show_group,
                }))}
              />

              <Field
                id="ledger_sac"
                label="SAC Code"
                value={form.ledger_sac}
                disabled={submitting}
                onChange={(e) => setField('ledger_sac', e.target.value)}
              />

              {/* ---- Row 3: Address, full width ---- */}
              <TextareaField
                id="ledeger_address"
                label="Address"
                rows={3}
                className="sm:col-span-2"
                value={form.ledeger_address}
                disabled={submitting}
                onChange={(e) => setField('ledeger_address', e.target.value)}
              />

              {/* ---- Row 4: Email | Phone ---- */}
              <Field
                id="ledeger_email"
                label="Email"
                type="email"
                value={form.ledeger_email}
                error={errors.ledeger_email}
                disabled={submitting}
                onChange={(e) => setField('ledeger_email', e.target.value)}
              />

              <Field
                id="ledeger_phone"
                label="Phone"
                inputMode="numeric"
                maxLength={10}
                value={form.ledeger_phone}
                error={errors.ledeger_phone}
                disabled={submitting}
                // Anything that is not a digit is dropped as it is typed, so the
                // field cannot hold a value validation would reject.
                onChange={(e) => setField('ledeger_phone', e.target.value.replace(/\D/g, ''))}
              />

              {/* ---- Row 5: Website | GSTIN ----
                  A plain field here. Looking a number up is the "Fill from
                  GSTIN" mode above, which has its own box and button. */}
              <Field
                id="ledeger_website"
                label="Website"
                value={form.ledeger_website}
                disabled={submitting}
                onChange={(e) => setField('ledeger_website', e.target.value)}
              />

              <Field
                id="ledeger_gstin"
                label="GSTIN"
                maxLength={15}
                value={form.ledeger_gstin}
                error={errors.ledeger_gstin}
                disabled={submitting}
                inputClassName="uppercase"
                onChange={(e) => setField('ledeger_gstin', e.target.value.toUpperCase())}
              />

              {/* ---- Row 6: State | Pincode ---- */}
              <SelectField
                id="ledeger_state"
                label="State"
                placeholder="Select State"
                value={form.ledeger_state}
                disabled={submitting}
                onValueChange={(value) => setField('ledeger_state', value)}
                options={INDIAN_STATES.map((state) => ({ value: state.name, label: state.name }))}
              />

              <Field
                id="ledger_pincode"
                label="Pincode"
                inputMode="numeric"
                maxLength={6}
                value={form.ledger_pincode}
                error={errors.ledger_pincode}
                disabled={submitting}
                onChange={(e) => setField('ledger_pincode', e.target.value.replace(/\D/g, ''))}
              />

              {/* ---- Row 7: GST Rate | Bank Name ----
                  The banks are the SAME list the Bank Details page uses, read
                  from the store - this form does not fetch them. */}
              <SelectField
                id="gst_rate"
                label="GST Rate"
                placeholder="Select GST Rate"
                value={form.gst_rate}
                disabled={submitting}
                onValueChange={(value) => setField('gst_rate', value)}
                options={GST_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))}
              />

              <SelectField
                id="ledger_bank"
                label="Select Bank Name"
                placeholder={bankNames.length === 0 ? 'Loading...' : 'Select Bank Name'}
                value={form.ledger_bank}
                disabled={submitting || bankNames.length === 0}
                onValueChange={(value) => setField('ledger_bank', value)}
                options={bankNames.map((entry) => ({
                  value: entry.bank_name,
                  label: entry.bank_name,
                }))}
              />

              {/* ---- Row 8: Account Number | IFSC ---- */}
              <Field
                id="ledger_accno"
                label="Bank Account Number"
                value={form.ledger_accno}
                disabled={submitting}
                onChange={(e) => setField('ledger_accno', e.target.value)}
              />

              <Field
                id="ledger_ifsc"
                label="Bank IFSC Code"
                value={form.ledger_ifsc}
                disabled={submitting}
                inputClassName="uppercase"
                onChange={(e) => setField('ledger_ifsc', e.target.value.toUpperCase())}
              />

              {/* ---- Row 9: Credit period ----
                  Not in the layout sketch, but it is a real backend column that
                  the list shows, so removing it would lose a field the user can
                  already set. */}
              <Field
                id="credit_period_days"
                label="Credit Period (days)"
                inputMode="numeric"
                placeholder="0"
                value={form.credit_period_days}
                disabled={submitting}
                onChange={(e) => setField('credit_period_days', e.target.value.replace(/\D/g, ''))}
              />
            </FormGrid>
          </>
        )}

        {/* ---------------- Actions ----------------
            GSTIN mode has one action - Fetch Details. Otherwise Create or
            Update, with Cancel only while editing (there is nothing to go back
            to from an empty form). Both are the form's submit button, so Enter
            works for each. */}
        <FormActions>
          {editing && !gstMode ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}

          {gstMode ? (
            <Button type="submit" icon={Search} loading={looking}>
              {looking ? 'Fetching...' : 'Fetch Details'}
            </Button>
          ) : (
            <Button type="submit" loading={submitting} disabled={!companyId}>
              {submitting ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          )}
        </FormActions>
      </form>
    </Panel>
  )
}

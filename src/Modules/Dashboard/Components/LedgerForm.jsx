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
 * WHAT IT READS, AND THE ONE THING IT ASKS FOR
 * ------------------------------------------------------------------
 * The Ledger Group and Bank Name dropdowns are read from the store - the
 * groups from ledgerSlice, the banks from bankSlice, which is the SAME data
 * the Bank Details page uses. Neither is fetched here, so opening this form,
 * editing, or typing in it never causes a request.
 *
 * The Country / State / City dropdowns are read from the store too
 * (locationSlice), but this form is what asks for that list, once on mount:
 * unlike the groups and the banks it is needed wherever the form is shown,
 * including the header's Add Ledger modal on a page that has no ledger data
 * at all. The thunk's `condition` makes every call after the first a no-op,
 * so it is one request per session however often the form is opened.
 *
 * The other request this form can make is the GSTIN lookup, and only when the
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
 *   isTally     Tally ERP: create / update go over the WebSocket
 *               (tally_ledger_create / tally_ledger_alter) instead of the API
 *   onRefresh() reloads the ledger list - after a Tally save that failed
 *   framed      true (the default) draws the form in its titled card, as the
 *               Ledger page does. false leaves the card off, for a dialog
 *               that already has a heading of its own - see LedgerActions.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
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
import { useGstLookup } from '@/Hooks/useGstLookup'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import { isValidGstNumber } from '@/Services/gstService'
import { DEFAULT_COUNTRY, getCities, getCountries, getStates } from '@/Services/locationService'
import {
  TALLY_LEDGER_ALTER_MODULE,
  TALLY_LEDGER_CREATE_MODULE,
  buildTallyLedgerMessage,
  createLedger,
  getLedgerId,
  updateLedger,
} from '@/Services/ledgerService'
import {
  fetchCountries,
  selectCountryData,
  selectCountryStatus,
} from '@/Store/Slices/locationSlice'

/**
 * Tally save safety net: the longest the button waits for Tally's
 * stop_loader. The reply normally ends the wait long before this.
 */
const TALLY_SAVE_TIMEOUT_MS = 2 * 60 * 1000

/**
 * The fields the form owns, named exactly as the backend names them (the
 * misspelling of "ledeger" is the API's, not ours), so the payload is the
 * form with nothing renamed on the way out.
 */
const EMPTY_FORM = {
  ledeger_guid: '',
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
  // Country and city sit either side of the state, and are saved under the
  // names the backend uses for them.
  ledger_country: DEFAULT_COUNTRY,
  ledger_city: '',
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
  isTally = false,
  onRefresh,
  framed = true,
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

    /* A ledger saved before the form had a country field has a state but no
       country, and a state dropdown with no country would have nothing in it
       - so the state that IS saved would look empty and be lost on the next
       save. Falling back to the default keeps that row's state on screen and
       selectable. A row that does carry a country keeps its own. */
    if (!filled.ledger_country) filled.ledger_country = DEFAULT_COUNTRY

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
  /* Country -> State -> City                                         */
  /* ---------------------------------------------------------------- */

  /**
   * All three dropdowns are one list from tally/country_list/, held in the
   * store and fetched once for the whole session (Store/Slices/locationSlice).
   * The states are the chosen country's, the cities the chosen state's, so
   * nothing about places is written down in this file.
   *
   * This is the one piece of reference data the form asks for itself, because
   * unlike the groups and the banks it is needed wherever the form is shown -
   * beside the list, and in the header's Add Ledger modal on any page. The
   * thunk's `condition` makes every call after the first a no-op, so it costs
   * one request per session however many times the form is opened.
   */
  const dispatch = useDispatch()
  /* The raw list, which is ONE reference that only changes when the data
     does. The three lists below are worked out from it here rather than
     inside useSelector, because each of them builds a new array: a selector
     that returns a new array every time never matches the last one, so the
     component would re-render on every change to any part of the store (the
     hazard written up at the foot of profileSlice). */
  const countryData = useSelector(selectCountryData)
  const countryStatus = useSelector(selectCountryStatus)
  const countriesLoading = countryStatus === 'loading' || countryStatus === 'idle'

  const countries = useMemo(() => getCountries(countryData), [countryData])
  const states = useMemo(
    () => getStates(countryData, form.ledger_country),
    [countryData, form.ledger_country],
  )
  const cities = useMemo(
    () => getCities(countryData, form.ledger_country, form.ledeger_state),
    [countryData, form.ledger_country, form.ledeger_state],
  )

  useEffect(() => {
    dispatch(fetchCountries()).then((result) => {
      // Only a request that really ran can fail; a skipped duplicate is not
      // an error. The form stays usable either way - every other field works
      // without this list.
      if (fetchCountries.rejected.match(result) && !result.meta.condition) {
        toast.error(result.payload || 'The country list could not be loaded.')
      }
    })
  }, [dispatch])

  /**
   * A new country's states are not the old one's, so the state goes - and
   * with it the city, which belonged to that state. Anything else would
   * leave the form claiming Gujarat is in Afghanistan.
   */
  const handleCountryChange = (value) => {
    setForm((previous) => ({
      ...previous,
      ledger_country: value,
      ledeger_state: '',
      ledger_city: '',
    }))
    setErrors((previous) => ({ ...previous, ledeger_state: undefined }))
  }

  /** Same reasoning one level down: a new state, so the city goes. */
  const handleStateChange = (value) => {
    setForm((previous) => ({ ...previous, ledeger_state: value, ledger_city: '' }))
    setErrors((previous) => ({ ...previous, ledeger_state: undefined }))
  }

  /* ---------------------------------------------------------------- */
  /* Tally: saving over the WebSocket                                 */
  /* ---------------------------------------------------------------- */

  // The Tally save in flight - the module its reply comes back under - or
  // null. A ref: the socket callback reads it.
  const tallySaveRef = useRef(null)
  const tallyTimerRef = useRef(null)

  const endTallySave = () => {
    tallySaveRef.current = null
    clearTimeout(tallyTimerRef.current)
    tallyTimerRef.current = null
    setSubmitting(false)
  }

  /**
   * The app's shared WebSocket. Only the reply to this form's own save
   * counts, and only its stop_loader ends it: then the ledger list is
   * reloaded - never before.
   */
  const { send } = useWebSocket({
    onMessage: (data) => {
      const reply = data?.res
      const moduleName = tallySaveRef.current
      if (!reply || !moduleName || reply.return_module_name !== moduleName) return
      if (reply.action_status !== 'stop_loader') return

      endTallySave()

      if (reply.status === 'error') {
        toast.error(reply.msg || 'Tally could not save the ledger.')
        onRefresh?.()
        return
      }

      toast.success(
        reply.msg || (editing ? 'Ledger updated successfully.' : 'Ledger added successfully.'),
      )
      if (!editing) setForm(EMPTY_FORM)
      // Reloads the list and leaves edit mode - as after an API save.
      onSaved?.()
    },
  })

  // Nothing of a Tally save may outlive the form.
  useEffect(
    () => () => {
      tallySaveRef.current = null
      clearTimeout(tallyTimerRef.current)
    },
    [],
  )

  /** Sends the Tally create / alter; the reply finishes it (see onMessage). */
  const saveToTally = async () => {
    const moduleName = editing ? TALLY_LEDGER_ALTER_MODULE : TALLY_LEDGER_CREATE_MODULE

    tallySaveRef.current = moduleName
    setSubmitting(true)

    const delivered = await send(buildTallyLedgerMessage(moduleName, companyName, form))

    // Already answered, or the form has gone away.
    if (tallySaveRef.current !== moduleName) return

    if (!delivered) {
      console.error('[Ledger Tally] WebSocket error:', `${moduleName} could not be sent`)
      endTallySave()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    tallyTimerRef.current = setTimeout(() => {
      if (tallySaveRef.current !== moduleName) return
      endTallySave()
      toast.error('Tally did not finish saving the ledger in time. Please try again.')
    }, TALLY_SAVE_TIMEOUT_MS)
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
      // A GSTIN is an Indian registration, so its state belongs to India -
      // and a city chosen under the previous state does not belong to this
      // one, so it goes. (Nothing is lost: the record carries no city, which
      // is why the district goes on the address line above.)
      ledger_country: DEFAULT_COUNTRY,
      ledger_city: details.state && details.state !== previous.ledeger_state
        ? ''
        : previous.ledger_city,
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
    return { ledger_obj_id: getLedgerId(ledger), company_id: companyId, ...changed }
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

    // Tally ERP: over the WebSocket, never the Intelligere API.
    if (isTally) {
      if (tallySaveRef.current) return
      if (editing && !buildEditPayload()) {
        toast.info('Nothing has been changed.')
        return
      }
      saveToTally()
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

  /* The "Fill from GSTIN" switch, which sits wherever the form's heading is -
     in the card's header strip when the form has one, and above the fields
     when it does not. Written once, used by both. */
  const gstSwitch = (
    <SwitchField
      id="fill-from-gstin"
      label="Fill from GSTIN"
      checked={gstMode}
      disabled={busy}
      onCheckedChange={toggleGstMode}
    />
  )

  const content = (
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
                  The groups come from tally/intelligere_group_list/ (Intelligere)
                  or tally/ledger_groups/ (Tally), fetched once into the store. `user_show_group` is both what is shown
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

              {/* ---- Row 6: Country | State ----
                  Country, State and City are one chain: the states offered
                  are the chosen country's, and the cities the chosen state's.
                  All three come from tally/country_list/ (Store/Slices/
                  locationSlice) - no list of places is written down here. */}
              <SelectField
                id="ledger_country"
                label="Country"
                searchable
                searchPlaceholder="Search country"
                placeholder={countriesLoading ? 'Loading...' : 'Select Country'}
                value={form.ledger_country}
                disabled={submitting || countries.length === 0}
                onValueChange={handleCountryChange}
                options={countries.map((name) => ({ value: name, label: name }))}
              />

              <SelectField
                id="ledeger_state"
                label="State"
                searchable
                searchPlaceholder="Search state"
                placeholder={
                  countriesLoading
                    ? 'Loading...'
                    : !form.ledger_country
                      ? 'Select a country first'
                      : 'Select State'
                }
                value={form.ledeger_state}
                disabled={submitting || states.length === 0}
                onValueChange={handleStateChange}
                options={states.map((name) => ({ value: name, label: name }))}
              />

              {/* ---- Row 7: City | Pincode ----
                  A state with no cities is a real answer from the backend,
                  not a failure - it sends `{ "Geta": [] }` - so the box says
                  so plainly instead of opening on nothing. */}
              <SelectField
                id="ledger_city"
                label="City"
                searchable
                searchPlaceholder="Search city"
                placeholder={
                  !form.ledeger_state
                    ? 'Select a state first'
                    : cities.length === 0
                      ? 'No cities available for this state'
                      : 'Select City'
                }
                value={form.ledger_city}
                disabled={submitting || cities.length === 0}
                onValueChange={(value) => setField('ledger_city', value)}
                options={cities.map((name) => ({ value: name, label: name }))}
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
                inputMode="numeric"
                value={form.ledger_accno}
                disabled={submitting}
                onChange={(e) => setField('ledger_accno', e.target.value.replace(/\D/g, ''))}
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
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
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
  )

  /* Unframed: inside a dialog that has its own heading and its own X, so a
     second titled card around the fields would be a box within a box saying
     the same thing twice. The switch keeps its place at the top right, where
     the card's header strip would have put it. */
  if (!framed) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{gstSwitch}</div>
        {content}
      </div>
    )
  }

  return (
    <Panel title={editing ? 'Edit Ledger' : 'Ledger Form'} actions={gstSwitch}>
      {content}
    </Panel>
  )
}

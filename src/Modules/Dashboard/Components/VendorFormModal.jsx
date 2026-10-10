/**
 * The Add / Edit Vendor dialog, on the Vendor tab of Inventory Master.
 *
 * ------------------------------------------------------------------
 * ONE FORM, THREE WAYS TO SAVE
 * ------------------------------------------------------------------
 *   vendor = null                     ADD    clean fields          POST
 *   vendor = null + an existing one   ADD    filled from a search  PUT with its vendor_id
 *     set on the form
 *   vendor = {...}                    EDIT   its values            PUT with its identifier
 *
 * The fields start from `vendor` as the component mounts. The list gives
 * this component a new `key` every time the dialog is opened, so each
 * opening starts from fresh values - nothing typed, searched for or found
 * in a dialog that was closed ever comes back.
 *
 * The vendor's own fields are named as the backend names them, so that part
 * of the payload is the form with nothing renamed. `company_id` is never a
 * field: it is the company the header is working in, handed in by the list,
 * and the KEY the ledger name and the ratings are filed under on the way out
 * (see "Vendors" in inventoryService).
 *
 * ------------------------------------------------------------------
 * ONE COMPACT FORM
 * ------------------------------------------------------------------
 * No sections and no headings, and built to be in view on a desktop without
 * scrolling. Top to bottom:
 *
 *   Ledger Name
 *   Contact   | WhatsApp | Email
 *   Country   | State    | City
 *   GST No.   | PAN No.  | Find Existing Vendor (its switch)
 *   ...the search row, only while that switch is on
 *   the nine ratings, two to a row
 *   Address - always the LAST field
 *
 * It is the FormGrid every other form uses, three across, with the kit's own
 * compact sizes (see COMPACT below) - 32px boxes and tighter gaps.
 *
 * ------------------------------------------------------------------
 * THESE STATES ARE KEPT APART
 * ------------------------------------------------------------------
 *   form               what the fields show - the vendor being added or edited
 *   findExisting       whether the search row is open            (Add only)
 *   criteria           what is typed in the search row
 *   searchResult       a vendor the search found, shown for review - it has
 *                      touched NOTHING in the form
 *   selectedExisting   the found vendor the user chose to use ("Set on
 *                      Form"); its vendor_id is what turns Save into a PUT
 *
 * A search never saves and never fills the form by itself: the form changes
 * only on Set on Form, and the backend only on Save.
 *
 * ------------------------------------------------------------------
 * PICKING A LEDGER, OR SETTING A FOUND VENDOR, FILLS THE FORM
 * ------------------------------------------------------------------
 * Both copy across only the values the source actually HAS. An empty one
 * leaves the field as it is, so choosing a ledger with no phone number does
 * not wipe the number already typed. Everything stays editable afterwards.
 *
 * ------------------------------------------------------------------
 * THE RATINGS ARE STARS; THE OVERALL RATING IS THEIR AVERAGE
 * ------------------------------------------------------------------
 * Each of the nine ratings is a row of five stars, half stars included, kept
 * as the NUMBER chosen (0.5, 1, 1.5 ... 5) under the backend's own name for
 * it - that number is what is sent, never a star.
 *
 * The Overall Rating is never chosen: it is the average of the nine
 * (overallVendorRating in Constants/inventory), shown read-only beside them,
 * redrawn as each star is clicked, and sent with them as a number. It is
 * always worked out from the nine - on an edit too, so an Overall Rating
 * saved under some older rule is not carried forward: the form shows the
 * average, and Update sends it even when nothing else was changed.
 *
 * Props:
 *   open, onOpenChange   controlled by the list, the same as Modal
 *   vendor               the vendor being edited as the backend sent it, or
 *                        null to add one
 *   companyId            the active company - never typed
 *   ledgers              the company's ledgers, for the Ledger Name dropdown
 *   ledgersStatus        'idle' | 'loading' | 'succeeded' | 'failed'
 *   ledgersError         the message when they could not be loaded
 *   onRetryLedgers()     asks for them again
 *   onSaved()            after a successful save; the list closes this and reloads
 */

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowDownToLine, Building2, Link2, Mail, MessageCircle, Phone, Search, X } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import {
  Field,
  FieldError,
  FormGrid,
  SelectField,
  SwitchField,
  TextareaField,
  fieldLabelClass,
} from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { StarRating } from '@/Components/Common/StarRating'
import { Button } from '@/Components/ui/button'
import {
  VENDOR_OVERALL_RATING,
  VENDOR_RATING_CRITERIA,
  VENDOR_RATING_MAX,
  overallVendorRating,
} from '@/Constants/inventory'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { isValidGstNumber } from '@/Services/gstService'
import {
  createVendor,
  searchVendor,
  updateVendor,
  vendorCompanyDetails,
  vendorIdentifier,
  vendorRating,
} from '@/Services/inventoryService'
import { getLedgerId } from '@/Services/ledgerService'
import { DEFAULT_COUNTRY, getCities, getCountries, getStates } from '@/Services/locationService'
import { fetchCountries, selectCountryData, selectCountryStatus } from '@/Store/Slices/locationSlice'
import { orDash } from '@/Utils/display'

const FORM_ID = 'vendor-form'

/*
 * What keeps this form short: the label sits closer to its box, and the box
 * is the kit's compact 32px one (the height the toolbars above the lists
 * use) rather than the 40px of a roomier form. A Field takes both of these;
 * a SelectField takes the first as `className` and the second as size="sm".
 */
const COMPACT = { className: 'space-y-1', inputClassName: 'h-8' }

// The same rules the Company form uses for the same kinds of value.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
// Ten digits, or up to fourteen with a country code and an optional "+" in
// front - a vendor's number arrives both ways ("8527412587", "+919876543210").
const PHONE_PATTERN = /^\+?\d{10,14}$/

const SEARCH_REQUIRED = 'Please enter GST No., PAN No., or Email.'
const RATING_REQUIRED = 'Please rate every category.'

/** A saved value as a form value - null becomes '', numbers become text. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value))

/** A phone number as typed: digits, and a "+" only in front. */
const cleanPhone = (value) => textOf(value).replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')

const upperCase = (value) => value.toUpperCase()

/** A saved rating as a number of stars - one that is missing, or not a number, is none. */
const starsOf = (value) => {
  const stars = Number(value)
  return Number.isFinite(stars) && stars > 0 ? stars : 0
}

/** How a value copied in from elsewhere is tidied for its field, where it needs to be. */
const TIDY = { contact: cleanPhone, whatsapp: cleanPhone, gst_no: upperCase }

/**
 * Which ledger property fills which vendor field. The ledger's names are the
 * backend's own, misspelling included ("ledeger"). City and country are read
 * under both spellings the ledger endpoints use for them.
 */
const LEDGER_SOURCES = {
  email: ['ledeger_email'],
  contact: ['ledeger_phone'],
  address: ['ledeger_address'],
  state: ['ledeger_state'],
  city: ['ledeger_city', 'ledger_city'],
  country: ['ledeger_country', 'ledger_country'],
  gst_no: ['ledeger_gstin'],
}

/** What a found vendor carries, in the order it is shown - and what Set on Form copies. */
const FOUND_VENDOR_FIELDS = [
  ['address', 'Address'],
  ['country', 'Country'],
  ['state', 'State'],
  ['city', 'City'],
  ['contact', 'Contact'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['gst_no', 'GST No.'],
]

const FOUND_VENDOR_SOURCES = Object.fromEntries(FOUND_VENDOR_FIELDS.map(([field]) => [field, [field]]))

/**
 * The form fields a source can fill: `{ field: value }` for each one the
 * source has something for, and nothing at all for the ones it does not - so
 * spreading the result over the form never empties a field.
 */
const presentValues = (source, sources) =>
  Object.entries(sources).reduce((filled, [field, names]) => {
    const value = names.map((name) => textOf(source?.[name]).trim()).find(Boolean)
    if (value) filled[field] = TIDY[field] ? TIDY[field](value) : value
    return filled
  }, {})

/** A clean form - what Add always opens with. */
const EMPTY_FORM = {
  ledger_name: '',
  contact: '',
  email: '',
  whatsapp: '',
  address: '',
  country: DEFAULT_COUNTRY,
  state: '',
  city: '',
  gst_no: '',
  pan_no: '',
  // The stars chosen for each rating, under the backend's own name for it.
  // 0 is "not rated yet".
  rating: Object.fromEntries(VENDOR_RATING_CRITERIA.map((name) => [name, 0])),
}

const EMPTY_CRITERIA = { gst_no: '', pan_no: '', email: '' }

/**
 * The form a vendor opens with: its own fields, plus the ledger and the
 * ratings filed under the active company.
 */
const initialForm = (vendor, companyId) => {
  if (!vendor) return EMPTY_FORM

  const rating = vendorRating(vendor, companyId)

  return {
    ledger_name: textOf(vendorCompanyDetails(vendor, companyId)?.ledger_name),
    contact: textOf(vendor.contact),
    email: textOf(vendor.email),
    whatsapp: textOf(vendor.whatsapp),
    address: textOf(vendor.address),
    country: textOf(vendor.country),
    state: textOf(vendor.state),
    city: textOf(vendor.city),
    gst_no: textOf(vendor.gst_no),
    pan_no: textOf(vendor.pan_no),
    rating: Object.fromEntries(VENDOR_RATING_CRITERIA.map((name) => [name, starsOf(rating?.[name])])),
  }
}

/* ---------------- Country, State and City as dropdowns ----------------
   The three lists come from the store (see below). A vendor's place may be
   spelled differently from the list ("gujarat"), or not be in it at all - a
   ledger's free-text city, say - and either way it must stay on screen
   rather than look empty and be lost on the next save. */

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The list's own spelling of the value held, so "gujarat" selects Gujarat. */
const listed = (names, held) => names.find((name) => sameName(name, held)) ?? held

/** The names as dropdown options, with the value held added when the list lacks it. */
const placeOptions = (names, held) => {
  const options = names.map((name) => ({ value: name, label: name }))
  return !held || names.some((name) => sameName(name, held)) ? options : [{ value: held, label: held }, ...options]
}

export default function VendorFormModal({
  open,
  onOpenChange,
  vendor,
  companyId,
  ledgers,
  ledgersStatus,
  ledgersError,
  onRetryLedgers,
  onSaved,
}) {
  const editing = Boolean(vendor)
  const dispatch = useDispatch()

  /* ---------------- The vendor form ---------------- */
  const [initial] = useState(() => initialForm(vendor, companyId))
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  /* ---------------- Find Existing Vendor (Add only) ----------------
     See the note at the top for what each of these is, and is not. */
  const [findExisting, setFindExisting] = useState(false)
  const [criteria, setCriteria] = useState(EMPTY_CRITERIA)
  const [criteriaError, setCriteriaError] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState(null)
  const [selectedExisting, setSelectedExisting] = useState(null)

  // One handler for every field; editing a field clears its error.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /** Stars were chosen: the number they stand for (3, 3.5 ...) is the rating. */
  const setRating = (name, rating) => {
    setForm((previous) => ({ ...previous, rating: { ...previous.rating, [name]: rating } }))
  }

  /** Values copied in from a ledger or a found vendor; their fields' errors go with them. */
  const fillForm = (values) => {
    setForm((previous) => ({ ...previous, ...values }))
    setErrors((previous) => ({
      ...previous,
      ...Object.fromEntries(Object.keys(values).map((field) => [field, undefined])),
    }))
  }

  /* ---------------------------------------------------------------- */
  /* Ledger Name                                                      */
  /* ---------------------------------------------------------------- */

  /*
   * The dropdown works in ledger ids (`ledger_obj_id`), but what a vendor
   * stores is the ledger's NAME. The form keeps only the name - the one value
   * that is saved - and the dropdown's value is worked out from it here, so
   * the two can never disagree. (The same arrangement as the Bank Form.)
   *
   * A vendor saved against a ledger that is not in the list any more matches
   * nothing; its name is then shown as the dropdown's placeholder rather
   * than silently disappearing.
   */
  const selectedLedger = ledgers.find((ledger) => ledger.ledeger_name === form.ledger_name)

  // Built once per ledger list, not on every keystroke in the form.
  const ledgerOptions = useMemo(
    () =>
      ledgers.map((ledger) => ({
        value: String(getLedgerId(ledger)),
        label: ledger.ledeger_name,
      })),
    [ledgers],
  )

  /** A ledger was picked: take its name, and whatever contact details it has. */
  const selectLedger = (value) => {
    const ledger = ledgers.find((entry) => String(getLedgerId(entry)) === value)
    if (!ledger) return

    fillForm({ ledger_name: textOf(ledger.ledeger_name), ...presentValues(ledger, LEDGER_SOURCES) })
  }

  const loadingLedgers = ledgersStatus === 'loading' || ledgersStatus === 'idle'
  const ledgerPlaceholder = loadingLedgers
    ? 'Loading...'
    : form.ledger_name || (ledgers.length === 0 ? 'No ledgers found' : 'Select Ledger')

  /* ---------------------------------------------------------------- */
  /* Country -> State -> City                                         */
  /* ---------------------------------------------------------------- */

  /* The same list the Ledger Form's three dropdowns use, held in the store
     and fetched once for the whole session (Store/Slices/locationSlice). It
     is asked for as the dialog opens - not as the Vendor tab does, since
     this component is mounted, closed, from the moment the tab is. */
  const countryData = useSelector(selectCountryData)
  const countryStatus = useSelector(selectCountryStatus)
  const countriesLoading = countryStatus === 'loading' || countryStatus === 'idle'

  useEffect(() => {
    if (!open) return

    dispatch(fetchCountries()).then((result) => {
      // Only a request that really ran can fail; a skipped duplicate is not
      // an error. The form stays usable either way.
      if (fetchCountries.rejected.match(result) && !result.meta.condition) {
        toast.error(result.payload || 'The country list could not be loaded.')
      }
    })
  }, [dispatch, open])

  const countries = useMemo(() => getCountries(countryData), [countryData])
  const states = useMemo(() => getStates(countryData, form.country), [countryData, form.country])
  const cities = useMemo(
    () => getCities(countryData, form.country, form.state),
    [countryData, form.country, form.state],
  )

  const countryOptions = useMemo(() => placeOptions(countries, form.country), [countries, form.country])
  const stateOptions = useMemo(() => placeOptions(states, form.state), [states, form.state])
  const cityOptions = useMemo(() => placeOptions(cities, form.city), [cities, form.city])

  /* The three handlers below ignore an EMPTY value, which is never a choice
     the user made - no option has one. It is Radix speaking: a dropdown inside
     a <form> mirrors its value into a hidden native <select>, and when the
     value and the options that contain it arrive in the same render (a ledger
     fills in State and City together, and the cities depend on the state)
     that <select> has no such option yet, reads back as "", and reports the
     "" as a change. Acting on it would empty the field just filled in. */

  /** A new country's states are not the old one's, so the state goes - and its city with it. */
  const changeCountry = (value) => {
    if (value) fillForm({ country: value, state: '', city: '' })
  }

  /** Same reasoning one level down: a new state, so the city goes. */
  const changeState = (value) => {
    if (value) fillForm({ state: value, city: '' })
  }

  const changeCity = (value) => {
    if (value) setField('city', value)
  }

  /* ---------------------------------------------------------------- */
  /* Find Existing Vendor                                             */
  /* ---------------------------------------------------------------- */

  const toggleFindExisting = (on) => {
    setFindExisting(on)
    // A result is only worth showing beside the search that found it.
    if (!on) {
      setSearchResult(null)
      setCriteriaError('')
    }
  }

  const setCriterion = (field, value) => {
    setCriteria((previous) => ({ ...previous, [field]: value }))
    setCriteriaError('')
  }

  /**
   * Looks the vendor up. Only what was filled in is sent - a field left
   * empty is left out of the payload altogether, not sent as "".
   *
   * Whatever comes back, the form is not touched and nothing is saved.
   */
  const handleSearch = async () => {
    if (searching || submitting) return

    const filled = Object.entries({
      gst_no: criteria.gst_no.trim().toUpperCase(),
      pan_no: criteria.pan_no.trim().toUpperCase(),
      email: criteria.email.trim(),
    }).filter(([, value]) => value)

    if (filled.length === 0) {
      setCriteriaError(SEARCH_REQUIRED)
      return
    }

    setSearching(true)

    try {
      const response = await searchVendor(Object.fromEntries(filled))

      if (response?.status === true) {
        setSearchResult(response.data ?? {})
      } else {
        // Not found: the backend's own words, and nothing else changes. A
        // vendor found by an earlier search is no answer to this one, so it
        // goes - and Set on Form with it.
        setSearchResult(null)
        toast.info(response?.msg || 'Vendor not found')
      }
    } catch (failure) {
      // `failure.message` is the backend's own `msg` (see authService).
      toast.error(failure.message)
    } finally {
      setSearching(false)
    }
  }

  /** Enter in a search box searches - it must not save the vendor form around it. */
  const searchOnEnter = (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleSearch()
  }

  /**
   * Set on Form: the found vendor's details go into the fields, for the user
   * to review and change, and its vendor_id is remembered for Save. The
   * ledger, the PAN and the ratings are not the found vendor's to give, so
   * they stay as they are. Nothing is sent.
   */
  const setFoundOnForm = () => {
    if (!searchResult) return

    fillForm(presentValues(searchResult, FOUND_VENDOR_SOURCES))
    setSelectedExisting(searchResult)
    // The search has done its job; the form is what matters now.
    setSearchResult(null)
    setFindExisting(false)
  }

  /* ---------------------------------------------------------------- */
  /* Saving                                                           */
  /* ---------------------------------------------------------------- */

  /* The ratings still without a star. Their message shows only while there
     are some, so it goes by itself as the last one is rated. */
  const unrated = VENDOR_RATING_CRITERIA.filter((name) => form.rating[name] <= 0)
  const ratingError = errors.rating && unrated.length > 0 ? errors.rating : null

  /* The average of the ratings given so far, or null while none is - worked
     out on every render, so it follows each click. This one value is both
     what the form shows and what Save sends. */
  const overall = overallVendorRating(form.rating)

  /* Whether the Overall Rating saved on the vendor being edited is already
     that average. When it is not - it was saved under another rule, or never
     saved - Update has something to send even if no field was touched. */
  const overallIsSaved = editing && Number(vendorRating(vendor, companyId)?.[VENDOR_OVERALL_RATING]) === overall

  const validate = () => {
    const found = {}

    if (!form.ledger_name) found.ledger_name = 'Please select a ledger'

    if (!form.contact.trim()) found.contact = 'Contact number is required'
    else if (!PHONE_PATTERN.test(cleanPhone(form.contact))) found.contact = 'Enter a valid contact number'

    if (form.whatsapp.trim() && !PHONE_PATTERN.test(cleanPhone(form.whatsapp))) {
      found.whatsapp = 'Enter a valid WhatsApp number'
    }

    const email = form.email.trim()
    if (!email) found.email = 'Email is required'
    else if (!EMAIL_PATTERN.test(email)) found.email = 'Enter a valid email address'

    // Optional, so each is checked for shape only when it has something in it.
    const gst = form.gst_no.trim()
    if (gst && !isValidGstNumber(gst)) found.gst_no = 'Enter a valid 15-character GST number'

    const pan = form.pan_no.trim().toUpperCase()
    if (pan && !PAN_PATTERN.test(pan)) found.pan_no = 'Enter a valid 10-character PAN'

    if (unrated.length > 0) found.rating = RATING_REQUIRED

    return found
  }

  /**
   * The vendor as the backend takes it: the ledger and the ratings under the
   * active company's id, the rest as it is in the form, text trimmed. A place
   * goes up as its dropdown shows it, so what is on screen is what is saved.
   *
   * The Overall Rating goes last among the ratings, as the number the form
   * is showing. Validation has made sure all nine are given by the time this
   * runs, so there is always one; were there not, the property is left out
   * rather than sent as null.
   */
  const buildVendor = () => ({
    company_details: {
      [companyId]: { ledger_name: form.ledger_name },
    },
    rating: {
      [companyId]: {
        ...Object.fromEntries(VENDOR_RATING_CRITERIA.map((name) => [name, form.rating[name]])),
        ...(overall === null ? {} : { [VENDOR_OVERALL_RATING]: overall }),
      },
    },
    address: form.address.trim(),
    contact: form.contact.trim(),
    email: form.email.trim(),
    gst_no: form.gst_no.trim().toUpperCase(),
    country: listed(countries, form.country),
    state: listed(states, form.state),
    city: listed(cities, form.city),
    pan_no: form.pan_no.trim().toUpperCase(),
    whatsapp: form.whatsapp.trim(),
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    // Enter in a field submits the form even while Save is disabled.
    if (submitting) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // An Overall Rating that is not yet the average counts as a change - see
    // overallIsSaved.
    if (editing && overallIsSaved && JSON.stringify(form) === JSON.stringify(initial)) {
      toast.info('Nothing has been changed.')
      return
    }

    // Cannot normally happen - Add is disabled without a company - but a
    // vendor filed under no company is worth refusing out loud.
    if (!companyId) {
      toast.error('Select a company before saving a vendor.')
      return
    }

    /* Which vendor this save changes, if any: the row being edited, under
       the name its identifier arrived with, or the found vendor the user set
       on the form. Neither means a new vendor. */
    const identifier = editing
      ? vendorIdentifier(vendor)
      : selectedExisting?.vendor_id != null
        ? { vendor_id: selectedExisting.vendor_id }
        : null

    if (editing && !identifier) {
      toast.error('This vendor has no identifier, so it cannot be updated.')
      return
    }

    setSubmitting(true)

    try {
      const response = identifier
        ? await updateVendor({ ...identifier, ...buildVendor() })
        : await createVendor(buildVendor())

      // Only the message - whatever else the reply carries is the list's to show.
      toast.success(response?.msg || (identifier ? 'Vendor updated successfully' : 'Vendor saved successfully'))
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
      title={editing ? 'Edit Vendor' : 'Add Vendor'}
      size="xl"
      // A little less padding and gap than a dialog's usual, for the same
      // reason the fields are compact.
      className="gap-3 p-5"
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
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={!companyId}>
            {submitting ? 'Saving...' : editing ? 'Update Vendor' : 'Save Vendor'}
          </Button>
        </>
      }
    >
      {/* `p-1`: room for the focus ring, inside the dialog's scroll box. */}
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-2 p-1">
        {/* Without the ledgers there is no ledger to pick, and one is required. */}
        {ledgersError ? (
          <InlineAlert action={<RetryButton onClick={onRetryLedgers} />}>
            Ledgers could not be loaded. {ledgersError}
          </InlineAlert>
        ) : null}

        {/* ---------------- The fields ----------------
            Three to a row from `sm` up, one on a phone - see COMPACT at the
            top for what keeps each one short. */}
        <FormGrid className="gap-y-2 sm:grid-cols-3">
          {/* ---------------- Find Existing Vendor ----------------
              Add only: a vendor being edited already IS an existing vendor.
              The switch takes the row's spare third place, level with the
              boxes beside it, so it costs the form no height of its own. */}
          {!editing ? (
            <SwitchField
              id="find-existing-vendor"
              label="Find Existing Vendor"
              checked={findExisting}
              disabled={submitting || searching}
              onCheckedChange={toggleFindExisting}
              className="h-8 self-end"
            />
          ) : null}

          {/* One row of boxes while the switch is on - no panel. Named by
              their placeholders, as the search box above a list is, to stay
              one line tall; one under another on a phone. */}
          {!editing && findExisting ? (
            <div className="space-y-2 sm:col-span-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Field
                  id="vendor_search_gst_no"
                  aria-label="GST No."
                  placeholder="GST No."
                  maxLength={15}
                  autoComplete="off"
                  value={criteria.gst_no}
                  disabled={searching || submitting}
                  inputClassName={COMPACT.inputClassName}
                  onChange={(event) => setCriterion('gst_no', event.target.value.toUpperCase())}
                  onKeyDown={searchOnEnter}
                />
                <Field
                  id="vendor_search_pan_no"
                  aria-label="PAN No."
                  placeholder="PAN No."
                  maxLength={10}
                  autoComplete="off"
                  value={criteria.pan_no}
                  disabled={searching || submitting}
                  inputClassName={COMPACT.inputClassName}
                  onChange={(event) => setCriterion('pan_no', event.target.value.toUpperCase())}
                  onKeyDown={searchOnEnter}
                />
                <Field
                  id="vendor_search_email"
                  aria-label="Email"
                  placeholder="Email"
                  type="email"
                  autoComplete="off"
                  value={criteria.email}
                  disabled={searching || submitting}
                  inputClassName={COMPACT.inputClassName}
                  onChange={(event) => setCriterion('email', event.target.value)}
                  onKeyDown={searchOnEnter}
                />
                <Button
                  type="button"
                  size="sm"
                  icon={Search}
                  loading={searching}
                  disabled={submitting}
                  onClick={handleSearch}
                >
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {/* Nothing was typed, so nothing was sent. */}
              {criteriaError ? (
                <div role="alert">
                  <FieldError>{criteriaError}</FieldError>
                </div>
              ) : null}

              {/* ---- A vendor was found ----
                  Shown for review only - the form is untouched until Set on
                  Form is clicked. Eight values in two short rows. */}
              {searchResult ? (
                <div className="space-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-brand">Existing Vendor Found</p>
                    <Button
                      type="button"
                      size="xs"
                      icon={ArrowDownToLine}
                      disabled={submitting}
                      onClick={setFoundOnForm}
                    >
                      Set on Form
                    </Button>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                    {FOUND_VENDOR_FIELDS.map(([field, label]) => (
                      <div key={field} className="min-w-0 space-y-1">
                        <dt className={fieldLabelClass}>{label}</dt>
                        <dd className="text-xs font-medium break-words text-foreground">
                          {orDash(textOf(searchResult[field]))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          ) : null}
          {/* Every ledger of this company, from the ledger list - labelled by
              name, valued by `ledger_obj_id`. Picking one fills in the contact
              details where the ledger has them. Searchable, because a company
              can have a great many ledgers. */}
          <SelectField
            id="vendor_ledger_name"
            label="Vendor Name"
            required
            icon={Building2}
            placeholder={ledgerPlaceholder}
            value={selectedLedger ? String(getLedgerId(selectedLedger)) : ''}
            error={errors.ledger_name}
            disabled={submitting || loadingLedgers || ledgers.length === 0}
            searchable
            placeholder="Search Vendor..."
            searchPlaceholder="Search Vendor..."
            onValueChange={selectLedger}
            options={ledgerOptions}
            size="sm"
            // className={cn(COMPACT.className, 'sm:col-span-3')}
            className={cn(COMPACT.className, 'sm:col-span-3')}
          />

          {/* ---- Contact | WhatsApp | Email ---- */}
          <Field
            id="vendor_contact"
            label="Contact"
            required
            type="tel"
            inputMode="tel"
            maxLength={10}
            icon={Phone}
            value={form.contact}
            error={errors.contact}
            disabled={submitting}
            // Anything that is not part of a number is dropped as it is typed.
            onChange={(event) => setField('contact', cleanPhone(event.target.value))}
            {...COMPACT}
          />
          <Field
            id="vendor_whatsapp"
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            maxLength={10}
            icon={MessageCircle}
            value={form.whatsapp}
            error={errors.whatsapp}
            disabled={submitting}
            onChange={(event) => setField('whatsapp', cleanPhone(event.target.value))}
            {...COMPACT}
          />
          <Field
            id="vendor_email"
            label="Email"
            required
            type="email"
            icon={Mail}
            value={form.email}
            error={errors.email}
            disabled={submitting}
            onChange={(event) => setField('email', event.target.value)}
            {...COMPACT}
          />

          {/* ---- Country | State | City ----
              One chain: the states offered are the chosen country's, and the
              cities the chosen state's. */}
          <SelectField
            id="vendor_country"
            label="Country"
            searchable
            searchPlaceholder="Search country"
            placeholder={countriesLoading ? 'Loading...' : 'Select Country'}
            value={listed(countries, form.country)}
            disabled={submitting || countryOptions.length === 0}
            onValueChange={changeCountry}
            options={countryOptions}
            size="sm"
            className={COMPACT.className}
          />
          <SelectField
            id="vendor_state"
            label="State"
            searchable
            searchPlaceholder="Search state"
            placeholder={countriesLoading ? 'Loading...' : !form.country ? 'Select a country first' : 'Select State'}
            value={listed(states, form.state)}
            disabled={submitting || stateOptions.length === 0}
            onValueChange={changeState}
            options={stateOptions}
            size="sm"
            className={COMPACT.className}
          />
          <SelectField
            id="vendor_city"
            label="City"
            searchable
            searchPlaceholder="Search city"
            placeholder={
              !form.state
                ? 'Select a state first'
                : cityOptions.length === 0
                  ? 'No cities available for this state'
                  : 'Select City'
            }
            value={listed(cities, form.city)}
            disabled={submitting || cityOptions.length === 0}
            onValueChange={changeCity}
            options={cityOptions}
            size="sm"
            className={COMPACT.className}
          />

          {/* ---- GST No. | PAN No. | Find Existing Vendor ---- */}
          <Field
            id="vendor_gst_no"
            label="GST No."
            maxLength={15}
            value={form.gst_no}
            error={errors.gst_no}
            disabled={submitting}
            // Typed in lower case, stored in upper - no holding shift for
            // fifteen characters.
            onChange={(event) => setField('gst_no', event.target.value.toUpperCase())}
            className={COMPACT.className}
            inputClassName={cn(COMPACT.inputClassName, 'uppercase')}
          />
          <Field
            id="vendor_pan_no"
            label="PAN No."
            maxLength={10}
            value={form.pan_no}
            error={errors.pan_no}
            disabled={submitting}
            onChange={(event) => setField('pan_no', event.target.value.toUpperCase())}
            className={COMPACT.className}
            inputClassName={cn(COMPACT.inputClassName, 'uppercase')}
          />

          {/* ---- A found vendor is on the form ----
              Says what Save will now do, and offers the way back. */}
          {selectedExisting ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs text-brand sm:col-span-3 dark:bg-brand/15"
            >
              <Link2 className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                An existing vendor is set on this form - review its details. Saving will update that vendor, not
                add a new one.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                icon={X}
                disabled={submitting}
                onClick={() => setSelectedExisting(null)}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </FormGrid>
        {/* ---------------- Address ----------------
            Last of all the fields: the one that takes the most typing, and
            the one a ledger or a found vendor most often fills in already. */}
        <TextareaField
          id="vendor_address"
          label="Address"
          rows={2}
          className={COMPACT.className}
          value={form.address}
          disabled={submitting}
          onChange={(event) => setField('address', event.target.value)}
        />

        {/* ---------------- The ratings ----------------
            Each is its name, its stars and the number they stand for, two to
            a row, under a hairline rather than a heading. Half stars can be
            chosen: see StarRating. Nine ratings leave the tenth place of the
            grid free, and the Overall Rating takes it - no extra line. */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {VENDOR_RATING_CRITERIA.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <span
                  className={cn(
                    fieldLabelClass,
                    'min-w-0 flex-1 leading-snug',
                    // After a save was refused, the ones still to rate stand out.
                    ratingError && form.rating[name] <= 0 && 'text-destructive',
                  )}
                >
                  {name}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </span>

                <StarRating
                  half
                  label={name}
                  max={VENDOR_RATING_MAX}
                  value={form.rating[name]}
                  invalid={Boolean(ratingError) && form.rating[name] <= 0}
                  disabled={submitting}
                  onChange={(rating) => setRating(name, rating)}
                />

                {/* The number the stars stand for - what is sent - so a half
                    is never left to be judged by eye. */}
                <span aria-hidden="true" className="w-10 shrink-0 text-right text-xs font-medium text-foreground tabular-nums">
                  {form.rating[name] > 0 ? form.rating[name] : '-'}
                </span>
              </div>
            ))}

            {/* ---- Overall Rating ----
                Read-only: the same stars, showing the average of the ones
                above, with the number beside them. A dash until there is a
                rating to average - never a row of empty stars reading 0. */}
            <div className="flex items-center gap-2">
              <span className={cn(fieldLabelClass, 'min-w-0 flex-1 leading-snug font-semibold text-brand')}>
                {VENDOR_OVERALL_RATING}
              </span>

              {/* Spaced to stand in the same column as the stars above it. */}
              <StarRating
                readOnly
                label={VENDOR_OVERALL_RATING}
                max={VENDOR_RATING_MAX}
                value={overall ?? 0}
                className="gap-1 px-0.5"
              />

              <span
                id="vendor_overall_rating"
                aria-live="polite"
                className="w-10 shrink-0 text-right text-xs font-semibold text-brand tabular-nums"
              >
                {overall === null ? '—' : `${overall.toFixed(1)}/${VENDOR_RATING_MAX}`}
              </span>
            </div>
          </div>

          {ratingError ? (
            <div role="alert">
              <FieldError>{ratingError}</FieldError>
            </div>
          ) : null}
        </div>

      </form>
    </Modal>
  )
}

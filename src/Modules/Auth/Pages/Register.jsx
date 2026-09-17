import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Contact, Mail, Phone, ReceiptText, User } from 'lucide-react'

import {
  Field,
  FieldError,
  FormGrid,
  PasswordField,
  SelectField,
  fieldLabelClass,
} from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { INDIAN_STATES } from '@/Constants/indianStates'
import { ROUTES } from '@/Constants/routes'
import { TermsAndConditions } from '@/Info/TermsAndConditions'
import { toast } from '@/Library/toast'
import { api } from '@/Services/authService'
import SystemRequirements from '@/Info/SystemRequirements'
import AuthShell from '../Components/AuthShell'

// The form stores short values; the backend expects these exact words.
const USER_TYPE = { professional: 'Accounting Professional', msme: 'MSME' }
const TALLY_CATEGORY = { gold: 'Gold', silver: 'Silver' }

/* ------------------------------------------------------------------ */
/* Small building block used only by this page                        */
/* ------------------------------------------------------------------ */

/** A single radio button with its text label beside it. */
function RadioOption({ value, label }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={value} value={value} />
      <Label htmlFor={value} className="font-normal">
        {label}
      </Label>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The registration page                                              */
/* ------------------------------------------------------------------ */

// The ERP and Tally plan that go with each user type. An Accounting
// Professional is always on Tally, and Tally always has a plan (Gold unless
// they pick Silver); an MSME starts on Intelligere, which has no plan at all.
const DEFAULTS_BY_ACCOUNT_TYPE = {
  professional: { erp: 'Tally', tallyCategory: 'gold' },
  msme: { erp: 'Intelligere', tallyCategory: '' },
}

// The values the form starts out with.
const EMPTY_FORM = {
  accountType: 'msme',
  name: '',
  email: '',
  mobile: '',
  gstNumber: '',
  password: '',
  state: '',
  address: '',
  // ERP and the Tally plan always follow the account type above.
  ...DEFAULTS_BY_ACCOUNT_TYPE.msme,
  // Who invited this user. Empty for anyone who came to /register on their
  // own; filled in from the URL when they arrived through a referral link
  // (/register/<uuid>) - see below.
  referralBy: '',
  agreed: false,
}

export default function Register() {

  const navigate = useNavigate();

  // `/register/<uuid>` - the uuid of whoever shared the referral link, or
  // undefined on a plain /register visit.
  const { referralBy } = useParams()

  // Seeded once, when the page first renders: if there is a uuid in the URL
  // the form starts with it already filled in, so it travels with the
  // registration without the new user ever seeing it.
  const [form, setForm] = useState({ ...EMPTY_FORM, referralBy: referralBy || '' })
  const [errors, setErrors] = useState({})

  // True while the API call is in flight - used to disable the button so the
  // user cannot submit the same registration twice.
  // Anything the server says (success or error) is shown as a toast,
  // so the form itself holds no message state.
  const [submitting, setSubmitting] = useState(false)
  // Whether the terms and conditions modal is open.
  const [modalType, setModalType] = useState(null)

  // One handler for every field: pass the field name and its new value.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    // Clear that field's error as soon as the user edits it.
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  // MSME users don't choose a Tally plan, so that whole section is hidden for them.
  const isMsme = form.accountType === 'msme'
  // ERP is not Tally, so that whole section is hidden for them.
  const isTally = form.erp === 'Tally'

  // When the user switches ERP, we need to fix up the Tally plan: switching to
  // Tally puts Gold in, switching away from Tally clears the plan, so the form
  // can never carry a plan for an ERP that has none.
  const handleErpChange = (value) => {
    setForm((previous) => ({
      ...previous,
      erp: value,
      // Automatically select 'gold' when Tally is chosen
      tallyCategory: value === 'Tally' ? 'gold' : '',
    }))
    // Clear any potential errors for these two fields
    setErrors((previous) => ({ ...previous, erp: undefined, tallyCategory: undefined }))
  }

  // Switching account type also moves ERP and the Tally plan to whatever that
  // type uses: an Accounting Professional lands on Tally + Gold, an MSME lands
  // on Intelligere with no plan.
  const handleAccountTypeChange = (value) => {
    setForm((previous) => ({
      ...previous,
      accountType: value,
      ...DEFAULTS_BY_ACCOUNT_TYPE[value],
    }))
    setErrors((previous) => ({ ...previous, erp: undefined, tallyCategory: undefined }))
  }

  // Checks the form and returns an object of error messages.
  // An empty object means everything passed.
  const validate = () => {
    const found = {}

    if (!form.name.trim()) found.name = 'Name is required'

    if (!form.email.trim()) found.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      found.email = 'Enter a valid email address'

    if (!form.mobile.trim()) found.mobile = 'Mobile number is required'
    else if (!/^[6-9]\d{9}$/.test(form.mobile))
      found.mobile = 'Enter a valid 10-digit mobile number'

    // GST is optional here, but if one is typed it must be well formed.
    if (
      form.gstNumber &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gstNumber)
    )
      found.gstNumber = 'Enter a valid 15-character GST number'

    if (!form.password) found.password = 'Password is required'
    else if (form.password.length < 6) found.password = 'Use at least 6 characters'

    // The two radio groups are kept in step by the handlers above, so these
    // only ever fire if something got the form into a state the backend
    // rejects: a Professional on anything but Tally, or Tally with no plan.
    if (form.accountType === 'professional' && form.erp !== 'Tally')
      found.erp = 'Accounting Professionals are registered on Tally'
    else if (!form.erp) found.erp = 'Please select an ERP'

    if (form.erp === 'Tally' && !form.tallyCategory)
      found.tallyCategory = 'Please select a Tally category'

    if (!form.state) found.state = 'Please select a state'
    if (!form.address.trim()) found.address = 'Address is required'
    if (!form.agreed) found.agreed = 'Please accept the terms and conditions'

    return found
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const found = validate()
    setErrors(found)

    // Stop here if anything failed validation.
    if (Object.keys(found).length > 0) return

    setSubmitting(true)

    try {
      // This page owns its own payload: the form is turned into exactly
      // what the backend asks for, right here where the fields are.
      const data = await api.post('useraccount/register/', {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile.trim(),
        password: form.password,
        referralby: form.referralBy || '',
        gstnumber: form.gstNumber.trim(),
        state: form.state,
        address: form.address.trim(),
        erp: form.erp,
        user_type: USER_TYPE[form.accountType],
        // Only Tally has plans, so anyone on another ERP sends this empty.
        tally_category: (form.erp === 'Tally' && TALLY_CATEGORY[form.tallyCategory]) || '',
        userUuid: '',
        validate: '',
      })

      // Show whatever the backend said, or a default if it said nothing.
      toast.success(data?.msg || 'Registration successful. You can log in now.')
      // Route to the login page, replacing the current history entry so Back
      navigate(ROUTES.LOGIN, { replace: true })
      setForm(EMPTY_FORM)
    } catch (error) {
      // `error.message` is the text the backend sent back, nothing else.
      toast.error(error.message)
    } finally {
      // `finally` runs whether it worked or not, so the button can never
      // stay stuck on "Registering...".
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      width="max-w-lg"
      footer={
        /* ---------- Link across to the login page ----------
           `asChild` tells Button to render the <Link> it wraps instead of a
           <button>, so we keep the styling but get real routing: the URL
           changes to /login with no full page reload. */
        <Button asChild variant="secondary" className="mt-1 border-1 border-brand/40">
          <Link to={ROUTES.LOGIN}>Login Here</Link>
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Who is signing up - two radios across the top */}
        <RadioGroup
          value={form.accountType}
          onValueChange={handleAccountTypeChange}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:justify-items-center grid-cols-[2fr_1fr]"
        >
          <RadioOption value="msme" label="MSME" />
          <RadioOption value="professional" label="Accounting Professional" />
        </RadioGroup>

        {/* Main fields: two columns on desktop, one on mobile */}
        <FormGrid>
          <Field
            id="name"
            label="Name"
            required
            icon={User}
            placeholder="Name"
            autoComplete="name"
            value={form.name}
            error={errors.name}
            onChange={(e) => setField('name', e.target.value)}
          />

          <Field
            id="email"
            label="Email"
            required
            icon={Mail}
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={form.email}
            error={errors.email}
            onChange={(e) => setField('email', e.target.value)}
          />

          {/* Mobile number keeps a fixed +91 prefix inside the box */}
          <Field
            id="mobile"
            label="Mobile Number"
            required
            icon={Phone}
            prefix="+91"
            inputMode="numeric"
            maxLength={10}
            placeholder="Mobile Number"
            autoComplete="tel-national"
            value={form.mobile}
            error={errors.mobile}
            // Strip anything that is not a digit as the user types.
            onChange={(e) => setField('mobile', e.target.value.replace(/\D/g, ''))}
          />

          <Field
            id="gstNumber"
            label="GST Number"
            icon={ReceiptText}
            placeholder="GST Number"
            maxLength={15}
            value={form.gstNumber}
            error={errors.gstNumber}
            // GST numbers are always stored in capitals.
            onChange={(e) => setField('gstNumber', e.target.value.toUpperCase())}
          />

          {/* The show / hide eye is part of PasswordField. */}
          <PasswordField
            id="password"
            label="Password"
            required
            placeholder="Password"
            autoComplete="new-password"
            value={form.password}
            error={errors.password}
            onChange={(e) => setField('password', e.target.value)}
          />

          {/* State picker, filled from the shared constants file */}
          <SelectField
            id="state"
            label="State"
            required
            placeholder="Select a State"
            searchable
            searchPlaceholder="Search state..."
            value={form.state}
            error={errors.state}
            onValueChange={(value) => setField('state', value)}
            options={INDIAN_STATES.map((state) => ({ value: state.name, label: state.name }))}
          />

          {/* Address spans the full width of the card */}
          <Field
            id="address"
            label="Address"
            required
            icon={Contact}
            placeholder="Address"
            autoComplete="street-address"
            className="sm:col-span-2"
            value={form.address}
            error={errors.address}
            onChange={(e) => setField('address', e.target.value)}
          />
        </FormGrid>

        {/* ERP choice on the left, Tally plan on the right. Each heading is
            the label for its whole group of radios, so it is tied to the
            group with aria-labelledby and lettered like every other label. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 grid-cols-[1fr_1fr]">
          <div className="space-y-2">
            <p id="erp-label" className={fieldLabelClass}>
              ERP
            </p>
            <RadioGroup
              aria-labelledby="erp-label"
              value={form.erp}
              // onValueChange={(value) => setField('erp', value)}
              onValueChange={handleErpChange}
              className="flex flex-wrap gap-6"
            >
              {isMsme && <RadioOption value="Intelligere" label="Intelligere" />}
              <RadioOption value="Tally" label="Tally" />
            </RadioGroup>
            <FieldError id="erp-error">{errors.erp}</FieldError>
          </div>

          {/* Tally Category belongs to Tally only - it is hidden on any other ERP */}
          {isTally && (
            <div className="space-y-2">
              <p id="tally-category-label" className={fieldLabelClass}>
                Tally Category
              </p>
              <RadioGroup
                aria-labelledby="tally-category-label"
                value={form.tallyCategory}
                onValueChange={(value) => setField('tallyCategory', value)}
                className="flex flex-wrap gap-6"
              >
                <RadioOption value="gold" label="Gold" />
                <RadioOption value="silver" label="Silver" />
              </RadioGroup>
              <FieldError id="tally-category-error">{errors.tallyCategory}</FieldError>
            </div>
          )}
        </div>

        {/* Terms checkbox on the left, helper links on the right */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="terms"
                checked={form.agreed}
                aria-invalid={Boolean(errors.agreed) || undefined}
                aria-describedby={errors.agreed ? 'terms-error' : undefined}
                onCheckedChange={(checked) => setField('agreed', checked === true)}
              />
              <Label htmlFor="terms" className="font-normal">
                I agree to the{' '}
                <button
                  type="button"
                  // `type="button"` keeps this from submitting the form.
                  // `preventDefault` stops the surrounding <Label> from
                  // ticking the checkbox when the link itself is clicked.
                  onClick={(event) => {
                    event.preventDefault()
                    setModalType('terms')
                  }}
                  className="cursor-pointer font-semibold text-brand underline-offset-4 hover:underline"
                >
                  terms and conditions
                </button>
              </Label>
            </div>
            <FieldError id="terms-error">{errors.agreed}</FieldError>
          </div>

          {/* <div className="flex flex-col gap-2 text-sm sm:items-end">
            <button
              type="button"
              onClick={() => setModalType('requirements')}
              className="cursor-pointer text-brand hover:underline"
            >
              Check System Requirements
            </button>
            <a href="#payment" className="text-brand hover:underline">
              Generate Payment Link
            </a>
          </div> */}
        </div>

        {/* Submit */}
        <div className="pt-1 text-center">
          {/* `loading` disables it while the request is running, so one
              click = one account. */}
          <Button type="submit" loading={submitting}>
            {submitting ? 'Registering...' : 'Register'}
          </Button>

        </div>
      </form>
           

      {/* ---------- Terms and conditions ----------
          Opened by the link next to the checkbox above. The wording itself
          lives in TermsAndConditions.jsx; this only decides how it is shown.
          It renders through a portal, so sitting inside the card here does
          not affect where it appears. */}
      <Modal
        open={modalType !== null}
        onOpenChange={(open) => !open && setModalType(null)}
        title={modalType === "terms" ? "Terms and Conditions" : "Check System Requirements"}
        description={modalType === "terms" && "Please read these before creating your account."}
        size={modalType === "terms" ? "xxl" : "md"}
        backdrop="blur"
        footer={
          <Button type="button" variant="ghost" onClick={() => setModalType(null)}>
            Close
          </Button>
        }
      >
        {modalType === "terms" ? (
          <TermsAndConditions />
        ) : (
          <SystemRequirements />
        )}
      </Modal>
    </AuthShell>
      
  )
}

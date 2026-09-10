import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Contact,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ReceiptText,
  User,
} from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Checkbox } from '@/Components/ui/checkbox'
import { Input } from '@/Components/ui/input'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/Components/ui/select'
import { INDIAN_STATES } from '@/Constants/indianStates'
import { ROUTES } from '@/Constants/routes'
import { TermsAndConditions } from '@/Info/TermsAndConditions'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { api } from '@/Services/authService'
import SystemRequirements from '@/Info/SystemRequirements'

// The form stores short values; the backend expects these exact words.
const USER_TYPE = { professional: 'Accounting Professional', msme: 'MSME' }
const TALLY_CATEGORY = { gold: 'Gold', silver: 'Silver' }

/* ------------------------------------------------------------------ */
/* Small building blocks used only by this page                       */
/* ------------------------------------------------------------------ */

/**
 * A labelled text box with an icon sitting inside it on the left.
 * `icon` is a lucide icon component. `children` is for anything extra
 * on the right hand side of the box (such as the show-password eye).
 */
function IconField({ id, label, icon: Icon, error, className, children, ...props }) {
  return (
    <div className={cn('', className)}>
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>

      {/* `relative` lets us position the icon on top of the input */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-brand">
          <Icon className="size-4" />
        </span>

        <Input
          id={id}
          className={cn(
            'h-11 rounded-md border-transparent bg-brand-soft pl-10 text-foreground placeholder:text-brand-light',
            children && 'pr-10',
            error && 'border-destructive',
          )}
          {...props}
        />

        {children}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

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

// The values the form starts out with.
const EMPTY_FORM = {
  accountType: 'professional',
  name: '',
  email: '',
  mobile: '',
  gstNumber: '',
  password: '',
  state: '',
  address: '',
  erp: 'Tally',
  tallyCategory: 'gold',
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
  const [showPassword, setShowPassword] = useState(false)

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

  // Switching account type also fixes up the Tally plan:
  // MSME clears it, switching back puts the default choice in.
  const handleAccountTypeChange = (value) => {
    setForm((previous) => ({
      ...previous,
      accountType: value,
      tallyCategory: value === 'msme' ? '' : EMPTY_FORM.tallyCategory,
    }))
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
        // MSME users never pick a plan, so this stays empty for them.
        tally_category: TALLY_CATEGORY[form.tallyCategory] || '',
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
    <div className="flex flex-col items-center justify-center gap-6 bg-brand-soft/60 px-4 py-10">
      {/* ---------- Page heading ---------- */}
      <h1 className="text-center font-normal text-4xl font-light text-brand-light">
        Welcome to <span className="font-bold text-brand">Intelligere</span>
      </h1>

      {/* ---------- The form card ---------- */}
      <Card className="w-full max-w-3xl border-border/70 shadow-sm">
        <CardContent className="px-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Who is signing up - two radios across the top */}
            <RadioGroup
              value={form.accountType}
              onValueChange={handleAccountTypeChange}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:justify-items-center grid-cols-[2fr_1fr]"
            >
              <RadioOption value="professional" label="Accounting Professional" />
              <RadioOption value="msme" label="MSME" />
            </RadioGroup>

            {/* Main fields: two columns on desktop, one on mobile */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 my-[5px]">
              <IconField
                id="name"
                label="Name"
                icon={User}
                placeholder="Name"
                autoComplete="name"
                value={form.name}
                error={errors.name}
                onChange={(e) => setField('name', e.target.value)}
              />

              <IconField
                id="email"
                label="Email"
                icon={Mail}
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={form.email}
                error={errors.email}
                onChange={(e) => setField('email', e.target.value)}
              />

              {/* Mobile number keeps a fixed +91 prefix inside the box */}
              <div className="">
                <Label htmlFor="mobile" className="text-sm text-muted-foreground">
                  Mobile Number
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 pl-3 text-brand">
                    <Phone className="size-4" />
                    <span className="text-sm text-brand-light">+91</span>
                  </span>
                  <Input
                    id="mobile"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Mobile Number"
                    autoComplete="tel-national"
                    value={form.mobile}
                    // Strip anything that is not a digit as the user types.
                    onChange={(e) =>
                      setField('mobile', e.target.value.replace(/\D/g, ''))
                    }
                    className={cn(
                      'h-11 rounded-md border-transparent bg-brand-soft pl-18 text-foreground placeholder:text-brand-light',
                      errors.mobile && 'border-destructive',
                    )}
                  />
                </div>
                {errors.mobile ? (
                  <p className="text-xs text-destructive">{errors.mobile}</p>
                ) : null}
              </div>

              <IconField
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

              <IconField
                id="password"
                label="Password"
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="new-password"
                value={form.password}
                error={errors.password}
                onChange={(e) => setField('password', e.target.value)}
              >
                {/* This button flips the input between text and password */}
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-brand-light hover:text-brand"
                >
                  {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
              </IconField>

              {/* State picker, filled from the shared constants file */}
              <div className="">
                <Label htmlFor="state" className="text-sm text-muted-foreground">
                  State
                </Label>
                <Select
                  value={form.state}
                  onValueChange={(value) => setField('state', value)}
                >
                  <SelectTrigger
                    id="state"
                    className={cn(
                      'w-full rounded-md border-transparent bg-brand-soft data-[size=default]:h-11',
                      errors.state && 'border-destructive',
                    )}
                  >
                    <SelectValue placeholder="Select a State" />
                  </SelectTrigger>
                  <SelectContent searchable searchPlaceholder="Search state...">
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state.code} value={state.name}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.state ? (
                  <p className="text-xs text-destructive">{errors.state}</p>
                ) : null}
              </div>

              {/* Address spans the full width of the card */}
              <IconField
                id="address"
                label="Address"
                icon={Contact}
                placeholder="Address"
                autoComplete="street-address"
                className="sm:col-span-2"
                value={form.address}
                error={errors.address}
                onChange={(e) => setField('address', e.target.value)}
              />
            </div>

            {/* ERP choice on the left, Tally plan on the right */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 grid-cols-[1fr_1fr]">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">ERP</p>
                <RadioGroup
                  value={form.erp}
                  onValueChange={(value) => setField('erp', value)}
                  className="flex flex-wrap gap-6"
                >
                  <RadioOption value="Tally" label="Tally" />
                  {isMsme && <RadioOption value="Intelligere" label="Intelligere" />}
                </RadioGroup>
              </div>

              {/* Tally Category is only for Accounting Professionals - MSME users don't pick a plan */}
              {isTally && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Tally Category</p>
                  <RadioGroup
                    value={form.tallyCategory}
                    onValueChange={(value) => setField('tallyCategory', value)}
                    className="flex flex-wrap gap-6"
                  >
                    <RadioOption value="gold" label="Gold" />
                    <RadioOption value="silver" label="Silver" />
                  </RadioGroup>
                </div>
              )}
            </div>

            {/* Terms checkbox on the left, helper links on the right */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between my-[5px]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="terms"
                    checked={form.agreed}
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
                      className="font-semibold text-brand underline-offset-4 hover:underline"
                    >
                      terms and conditions
                    </button>
                  </Label>
                </div>
                {errors.agreed ? (
                  <p className="text-xs text-destructive">{errors.agreed}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 text-sm sm:items-end">
                <button
                  type="button"
                  onClick={() => setModalType('requirements')}
                  className="text-brand hover:underline"
                >
                  Check System Requirements
                </button>
                <a href="#payment" className="text-brand hover:underline">
                  Generate Payment Link
                </a>
              </div>
            </div>

            {/* Submit */}
            <div className="text-center pt-1">
              <Button
                type="submit"
                variant="default"
                // Disabled while the request is running, so one click = one account.
                disabled={submitting}
              >
                {submitting ? 'Registering...' : 'Register'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ---------- Link across to the login page ----------
          `asChild` tells Button to render the <Link> it wraps instead of a
          <button>, so we keep the styling but get real routing: the URL
          changes to /login with no full page reload. */}
      <Button
        asChild
        variant="secondary"
        className="bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground"
      >
        <Link to={ROUTES.LOGIN}>Login Here</Link>
      </Button>

      {/* ---------- Terms and conditions ----------
          Opened by the link next to the checkbox above. The wording itself
          lives in TermsAndConditions.jsx; this only decides how it is shown.
          "Accept" ticks the checkbox and closes the modal. */}
      <Modal
        open={modalType !== null}
        onOpenChange={(open) => !open && setModalType(null)}
        title={modalType === "terms" ? "Terms and Conditions" : "Check System Requirements"}
        description={modalType === "terms" && "Please read these before creating your account."}
        size={modalType === "terms" ? "xxl" : "md"}
        backdrop="blur"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalType(null)}>
              Close
            </Button>
          </>
        }
      >
        {modalType === "terms" ? (
          <TermsAndConditions />
        ) : (
          <SystemRequirements />
        )}
      </Modal>
    </div>
  )
}

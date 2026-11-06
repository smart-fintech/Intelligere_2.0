import { useEffect, useRef, useState } from 'react'
import { KeyRound, LogIn, Mail, Store } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { Field, PasswordField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'
import { toast } from '@/Library/toast'
import AuthShell from '@/Modules/Auth/Components/AuthShell'
import { getVendorEmail, signInVendor } from '@/Modules/VendorPortal/vendorSession'
import {
  PASSWORD_EMPTY_MSG,
  setVendorPassword,
  vendorForgotPassword,
  vendorLogin,
} from '@/Services/Procurement/vendorPortalService'

/**
 * The vendor portal's sign-in (procurement/vendor_login/).
 *
 *   - A vendor without a password yet (the backend answers "Password is empty")
 *     sets one here, 6 to 20 characters, and is signed in with it.
 *   - "Forgot password?" mails a reset link to the email typed above it.
 *   - The reset page sends the vendor back to /?email=...&pass=... (AppRoutes
 *     forwards that here): it is signed in with those at once, and they are
 *     taken off the address bar first, so the password is not left in it.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PASSWORD_MIN = 6
const PASSWORD_MAX = 20

/** Which box a refusal is about, by the backend's message. */
const fieldOf = (message) => {
  if (/vendor not found|email/i.test(message)) return 'email'
  if (/password/i.test(message)) return 'password'
  return null
}

function SetPasswordModal({ email, onDone, onClose }) {
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    const found = {}
    if (form.password.length < PASSWORD_MIN || form.password.length > PASSWORD_MAX) {
      found.password = `${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`
    }
    if (!form.confirm) found.confirm = 'Enter the password again.'
    else if (form.confirm !== form.password) found.confirm = 'Does not match the password.'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      const reply = await setVendorPassword({ email, password: form.password })
      toast.success(reply?.msg || 'Password set.')
      await onDone(form.password)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={() => {
        if (!saving) onClose()
      }}
      size="sm"
      title="Set your password"
      description={`First sign-in for ${email}. Choose the password you will sign in with.`}
    >
      <form onSubmit={handleSave} className="space-y-4" noValidate>
        <PasswordField
          id="vendor-new-password"
          label="Password"
          required
          autoComplete="new-password"
          value={form.password}
          error={errors.password}
          onChange={(event) => setField('password', event.target.value)}
        />
        <PasswordField
          id="vendor-confirm-password"
          label="Confirm Password"
          required
          autoComplete="new-password"
          value={form.confirm}
          error={errors.confirm}
          onChange={(event) => setField('confirm', event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={KeyRound} loading={saving}>
            Set Password
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function VendorLoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Arriving from the reset page, its email is filled in while it signs in.
  const [form, setForm] = useState(() => ({ email: searchParams.get('email') ?? '', password: '' }))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  // The email that has no password yet - the set-password dialog is open for it.
  const [settingFor, setSettingFor] = useState(null)
  const autoTried = useRef(false)

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /** Signs in with the backend's answer; true when the vendor is in. */
  const signIn = async (email, password) => {
    setSubmitting(true)
    try {
      const reply = await vendorLogin({ email, password })
      if (reply?.msg === PASSWORD_EMPTY_MSG) {
        setSettingFor(email)
        return false
      }
      signInVendor(email)
      toast.success(reply?.msg || 'Signed in.')
      navigate(ROUTES.VENDOR_PORTAL, { replace: true })
      return true
    } catch (failure) {
      const field = fieldOf(failure.message)
      if (field) setErrors({ [field]: failure.message })
      else toast.error(failure.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  // From the reset page: sign in with what it sent, after taking it off the address bar.
  useEffect(() => {
    if (autoTried.current) return
    autoTried.current = true
    const email = searchParams.get('email')
    const password = searchParams.get('pass')
    if (!email || !password) return
    setSearchParams({}, { replace: true })
    // After this render, as the request it starts - not while the effect runs.
    queueMicrotask(() => signIn(email.trim().toLowerCase(), password))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    const found = {}
    if (!form.email.trim()) found.email = 'Email is required'
    else if (!EMAIL_PATTERN.test(form.email.trim())) found.email = 'Enter a valid email address'
    if (!form.password) found.password = 'Password is required'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    signIn(form.email.trim().toLowerCase(), form.password)
  }

  const handleForgot = async () => {
    const email = form.email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      setErrors({
        email: 'Enter your email first - the reset link is sent to it.',
      })
      return
    }
    setSendingReset(true)
    try {
      const reply = await vendorForgotPassword(email)
      toast.success(reply?.msg || 'Reset password email sent.')
    } catch (failure) {
      if (fieldOf(failure.message) === 'email') setErrors({ email: failure.message })
      else toast.error(failure.message)
    } finally {
      setSendingReset(false)
    }
  }

  // Already signed in (and not arriving from a reset link): straight to the portal.
  if (getVendorEmail() && !searchParams.get('email')) return <Navigate to={ROUTES.VENDOR_PORTAL} replace />

  return (
    <AuthShell
      footer={
        <>
          Signing in for your company?
          <Button asChild variant="secondary" className="mt-1 border-1 border-brand/40">
            <Link to={ROUTES.LOGIN}>Company Login</Link>
          </Button>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Store className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-brand">Vendor Login</h2>
          <p className="text-xs text-muted-foreground">Sign in with the email your bid invitation was sent to.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          id="vendor-email"
          label="Email"
          required
          icon={Mail}
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={form.email}
          error={errors.email}
          onChange={(event) => setField('email', event.target.value)}
        />
        <PasswordField
          id="vendor-password"
          label="Password"
          required
          placeholder="Password"
          autoComplete="current-password"
          value={form.password}
          error={errors.password}
          onChange={(event) => setField('password', event.target.value)}
        />
        <p className="-mt-2 text-xs text-muted-foreground">
          First time here? Enter your email and any password - you will be asked to set one.
        </p>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0"
            loading={sendingReset}
            onClick={handleForgot}
          >
            Forgot password?
          </Button>
        </div>

        <Button type="submit" icon={LogIn} loading={submitting} className="w-full">
          {submitting ? 'Logging in...' : 'Login'}
        </Button>
      </form>

      {settingFor ? (
        <SetPasswordModal
          email={settingFor}
          onClose={() => setSettingFor(null)}
          onDone={async (password) => {
            setSettingFor(null)
            await signIn(settingFor, password)
          }}
        />
      ) : null}
    </AuthShell>
  )
}

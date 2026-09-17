import { useState } from 'react'
import { LogIn, Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Field, PasswordField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'
import { toast } from '@/Library/toast'
import { api } from '@/Services/authService'
import AuthShell from '../Components/AuthShell'

// The values the form starts out with.
const EMPTY_FORM = { email: '', password: '' }

export default function Login() {
  // `useNavigate` is how you move to another URL from inside JavaScript
  // (a <Link> is for something the user clicks). We use it after a
  // successful login to send the user on to the dashboard.
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  // True while the API call is in flight - used to disable the button so the
  // user cannot fire the same login twice.
  const [submitting, setSubmitting] = useState(false)

  // One handler for every field: pass the field name and its new value.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    // Clear that field's error as soon as the user edits it.
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  // Checks the form and returns an object of error messages.
  // An empty object means everything passed.
  const validate = () => {
    const found = {}

    if (!form.email.trim()) found.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      found.email = 'Enter a valid email address'

    if (!form.password) found.password = 'Password is required'

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
      // Just the call. The tokens and user details in the response are
      // written to localStorage centrally (see Services/authService.js), so
      // there is nothing to save here.
      const data = await api.post('useraccount/login/', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      })

      // ---- Signed in: go to the dashboard, NOW ----
      // A successful sign-in is the only thing this waits for. The profile
      // is not asked for here at all - AppLayout loads it as the dashboard's
      // shell mounts, in the background, and the header fills itself in when
      // it arrives. So a slow, failing or unreachable profile API can never
      // keep anyone on this screen: this page no longer knows it exists.
      //
      // `replace: true` drops the login page from the history, so pressing
      // Back from the dashboard does not return to a form already used.
      navigate(ROUTES.DASHBOARD, { replace: true })

      toast.success(data?.msg)
    } catch (error) {
      // `error.message` is the text the backend sent back, nothing else.
      toast.error(error.message)
    } finally {
      // `finally` runs whether it worked or not, so the button can never
      // stay stuck on "Signing in...".
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      footer={
        <>
          New to Intelligere?
          <Button asChild variant="secondary"  className="mt-1 border-1 border-brand/40">
            <Link to={ROUTES.REGISTER}>Register Here</Link>
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

        {/* The show / hide eye is part of PasswordField. */}
        <PasswordField
          id="password"
          label="Password"
          required
          placeholder="Password"
          autoComplete="current-password"
          value={form.password}
          error={errors.password}
          onChange={(e) => setField('password', e.target.value)}
        />

        {/* ---------- Forgot password ----------
            Sits right under the password box, pushed to the right.
            <Link> is the router's replacement for <a>: it changes the URL
            without reloading the whole page. */}
        <div className="flex justify-end">
          <Link
            to={ROUTES.FORGOT_PASSWORD}
            className="text-sm font-medium text-brand underline-offset-4 transition-colors hover:text-brand-dark hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {/* ---------- Submit ----------
            The standard action button, full width. `loading` disables it
            while the request is running, so one click = one attempt. */}
        <Button type="submit" icon={LogIn} loading={submitting} className="w-full">
          {submitting ? 'Logging in...' : 'Login'}
        </Button>
      </form>
    </AuthShell>
  )
}

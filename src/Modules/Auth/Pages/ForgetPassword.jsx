import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Field } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'
import { toast } from '@/Library/toast'
import { api } from '@/Services/authService'
import AuthShell from '../Components/AuthShell'

/**
 * Forgot password: one email box that asks the backend to send a reset link
 * (useraccount/request-reset-email/), then goes back to the login page.
 */
export default function ForgotPassword() {

  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({})

  // True while the API call is in flight - used to disable the button so the
  // user cannot fire the same login twice.
  const [submitting, setSubmitting] = useState(false)


  // One handler for every field: pass the field name and its new value.
  const setField = (field, value) => {
    setEmail(value)
    // Clear that field's error as soon as the user edits it.
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  // Checks the form and returns an object of error messages.
  // An empty object means everything passed.
  const validate = () => {
    const found = {}

    if (!email.trim()) found.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      found.email = 'Enter a valid email address'

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
      const data = await api.post('useraccount/request-reset-email/', {
        email: email.trim().toLowerCase(),
      })

      toast.success(data?.msg || 'Password reset link sent.')

      // `replace: true` drops the login page from the history, so pressing
      // Back from the dashboard does not return to a form already used.
      navigate(ROUTES.LOGIN, { replace: true })
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
          <Button asChild variant="secondary" className="mt-1 border-1 border-brand/40">
            <Link to={ROUTES.REGISTER}>Register Here</Link>
          </Button>
        </>
      }
    >
      {/* A real <form>, so Enter in the email box sends it as well as the
          button. */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          id="email"
          label="Email"
          required
          icon={Mail}
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(e) => setField('email', e.target.value)}
        />

        <div className="flex justify-end">
          <Button type="submit" loading={submitting}>
            {submitting ? 'Sending reset link...' : 'Forget Password'}
          </Button>
        </div>
      </form>
    </AuthShell>
  )
}

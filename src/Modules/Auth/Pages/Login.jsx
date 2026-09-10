import { useState } from 'react'
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Input } from '@/Components/ui/input'
import { Label } from '@/Components/ui/label'
import { ROUTES } from '@/Constants/routes'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { api } from '@/Services/authService'
import { fetchProfile } from '@/Store/Slices/profileSlice'

/* ------------------------------------------------------------------ */
/* Small building block used only by this page                        */
/* ------------------------------------------------------------------ */

/**
 * A labelled text box with a brand-coloured icon inside it on the left.
 * `icon` is a lucide icon component. `children` is for anything extra on
 * the right hand side of the box (here: the show-password eye).
 */
function IconField({ id, label, icon: Icon, error, children, ...props }) {
  return (
    <div className="space-y-1.5">
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

/* ------------------------------------------------------------------ */
/* The login page                                                     */
/* ------------------------------------------------------------------ */

// The values the form starts out with.
const EMPTY_FORM = { email: '', password: '' }

export default function Login() {
  // `useNavigate` is how you move to another URL from inside JavaScript
  // (a <Link> is for something the user clicks). We use it after a
  // successful login to send the user on to the dashboard.
  const navigate = useNavigate()

  // `dispatch` is how a screen starts something that lives in the Redux
  // store - here, loading the profile once the user is in.
  const dispatch = useDispatch()

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)

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

      toast.success(data?.msg)

      // Load the profile into the store now, so the profile page and
      // anything else that needs it already has it. Deliberately NOT
      // awaited: the user should reach the dashboard straight away, and
      // this finishes on its own a moment later.
      dispatch(fetchProfile())

      // `replace: true` drops the login page from the history, so pressing
      // Back from the dashboard does not return to a form already used.
      navigate(ROUTES.DASHBOARD, { replace: true })
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
    <div className="flex min-h-screen items-center justify-center bg-brand-soft/60 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* ---------- Page heading ---------- */}
        <h1 className="text-center font-normal text-4xl font-light text-brand-light">
          Welcome to <span className="font-bold text-brand">Intelligere</span>
        </h1>

        {/* ---------- The form card ---------- */}
        <Card className="overflow-hidden border-border/70 py-0 shadow-lg shadow-brand/5">
          {/* A thin brand-coloured strip across the top of the card. */}

          <CardContent className="px-6 py-7">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

              <IconField
                id="password"
                label="Password"
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
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

              {/* ---------- Forgot password ----------
                  Sits right under the password box, pushed to the right.
                  <Link> is the router's replacement for <a>: it changes the
                  URL without reloading the whole page. */}
              <div className="flex justify-end">
                <Link
                  to={ROUTES.FORGOT_PASSWORD}
                  className="text-sm font-medium text-brand underline-offset-4 transition-colors hover:text-brand-dark hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {/* ---------- Submit ----------
                  Full width, solid brand blue, with a soft brand-tinted
                  shadow that grows on hover and a tiny press-down on click. */}
              <Button
                type="submit"
                // Disabled while the request is running, so one click = one attempt.
                disabled={submitting}
                className="w-full bg-brand text-base text-brand-foreground shadow-md shadow-brand/25 transition-all hover:bg-brand-dark hover:shadow-lg hover:shadow-brand/30 active:scale-[0.99]"
              >
                <LogIn className="size-4" />
                {submitting ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ---------- Link across to the register page ---------- */}
        <p className="text-center text-sm text-muted-foreground">
          New to Intelligere?{' '}<br />
          <Button
            asChild
            variant="secondary"
            className="bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground"
          >
            <Link to={ROUTES.REGISTER}>Register Here</Link>
          </Button>
        </p>
      </div>
    </div>
  )
}

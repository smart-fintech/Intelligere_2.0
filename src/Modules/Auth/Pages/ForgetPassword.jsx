import { Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Input } from '@/Components/ui/input'
import { Label } from '@/Components/ui/label'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useState } from 'react'
import { toast } from '@/Library/toast'
import { api } from '@/Services/authService'
import { cn } from '@/Library/utils'

/**
 * PLACEHOLDER PAGE.
 *
 * It exists so the "Forgot password?" link on the login page has somewhere
 * to land instead of hitting the 404 route. The real screen (email box ->
 * useraccount/password-reset-complete/ -> reset form) still has to be built.
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
    <div className="flex min-h-screen items-center justify-center bg-brand-soft/60 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* ---------- Page heading ---------- */}
        <h1 className="text-center font-normal text-4xl font-light text-brand-light">
          Welcome to <span className="font-bold text-brand">Intelligere</span>
        </h1>
        <Card className="w-full max-w-md overflow-hidden border-border/70 py-0 shadow-lg shadow-brand/5">

          <CardContent className="space-y-4 px-6 py-8 text-left">
            <IconField
              id="email"
              label="Email"
              icon={Mail}
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              error={errors.email}
              onChange={(e) => setField('email', e.target.value)}
            />


            {/* ---------- Submit ----------
                  Full width, solid brand blue, with a soft brand-tinted
                  shadow that grows on hover and a tiny press-down on click. */}
            <div className="text-right">
              <Button
                type="submit"
                variant="default"
                // Disabled while the request is running, so one click = one attempt.
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Sending reset link...' : 'Forget Password'}
              </Button>
            </div>
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

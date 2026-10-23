import { useRef, useState } from 'react'
import { User } from 'lucide-react'

import { Field, PasswordField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { PORTAL_AUTH, authenticatePortal } from '@/Services/gstPortalService'

const FORM_ID = 'portal-auth-form'

/**
 * GST PORTAL AUTHENTICATION - opened when E-Invoice or E-Way Bill is ticked
 * and the company has no portal credentials for it (hasPortalCredentials).
 * One feature at a time: its name is in the title, and the submit goes to
 * that feature's endpoint only (authenticatePortal). The username and
 * password live here alone, and go with the modal. What the API answers is
 * shown as a toast, never inside the modal: a failure here (its msg), the
 * success by the workspace (onAuthenticated) - one toast per answer.
 *
 *   setting            'eInvoice' | 'eWayBill' - mounted only while one is set
 *   companyId          the company being authenticated
 *   onAuthenticated(setting, reply)   the backend said the feature's success message
 *   onClose()          cancelled - the box stays unticked
 */
export default function PortalAuthModal({ setting, companyId, onAuthenticated, onClose }) {
  const feature = PORTAL_AUTH[setting]
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // A second submit (double click, Enter twice) while one is on its way does nothing.
  const busy = useRef(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy.current) return
    const found = {}
    if (!username.trim()) found.username = 'Username is required'
    if (!password.trim()) found.password = 'Password is required'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    busy.current = true
    setSubmitting(true)
    try {
      const reply = await authenticatePortal(setting, { username: username.trim(), password, companyId })
      onAuthenticated(setting, reply)
    } catch (error) {
      // `error.message` is the backend's own msg (authService / authenticatePortal) - or, with no
      // answer at all, authService's "Cannot reach the server..."; the modal stays open to try again.
      toast.error(error?.message || `${feature.label} authentication failed. Please try again.`)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
      size="sm"
      title={`${feature.label} Authentication`}
      description={`Enter the company's ${feature.label} portal username and password. ${feature.label} is turned on once they are accepted.`}
      closeOnBackdropClick={false}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
      footer={
        <>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {submitting ? 'Authenticating...' : 'Authenticate'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="space-y-3" aria-label={`${feature.label} authentication`}>
        <Field
          id={`${setting}-portal-username`}
          label="Username"
          required
          icon={User}
          autoComplete="off"
          value={username}
          error={errors.username}
          disabled={submitting}
          onChange={(event) => setUsername(event.target.value)}
        />
        <PasswordField
          id={`${setting}-portal-password`}
          label="Password"
          required
          autoComplete="new-password"
          value={password}
          error={errors.password}
          disabled={submitting}
          onChange={(event) => setPassword(event.target.value)}
        />
      </form>
    </Modal>
  )
}

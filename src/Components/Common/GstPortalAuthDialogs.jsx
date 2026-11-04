import { KeyRound, User } from 'lucide-react'

import { Field } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'

const USERNAME_FORM = 'gst-portal-username-form'
const OTP_FORM = 'gst-portal-otp-form'

/** companydata.gst_username holds 20 characters; the backend refuses a longer one. */
const USERNAME_MAX_LENGTH = 20

/**
 * The GST portal's sign-in dialogs - the company's portal username, then the
 * OTP - for a read from the portal (Hooks/useGstPortalAuth, which they are
 * driven by). Render them next to the button that fetches:
 *
 *   const portal = useGstPortalAuth({ ... })
 *   <GstPortalAuthDialogs portal={portal} />
 */
export function GstPortalAuthDialogs({ portal }) {
  const { step, submitting, username, otp } = portal

  return (
    <>
      <Modal
        open={step === 'username'}
        onOpenChange={portal.close}
        size="sm"
        title="GST Portal Authentication"
        description="Enter the company's GST Portal username. An OTP will be sent to the mobile number registered on the portal."
        closeOnBackdropClick={false}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={Boolean(submitting)} onClick={portal.cancel}>
              Cancel
            </Button>
            <Button type="submit" form={USERNAME_FORM} loading={submitting === 'send'} disabled={!username.trim()}>
              Send OTP
            </Button>
          </>
        }
      >
        <form id={USERNAME_FORM} noValidate onSubmit={portal.submitUsername}>
          <Field
            id="gst-portal-username"
            label="GST Portal Username"
            required
            icon={User}
            autoComplete="off"
            maxLength={USERNAME_MAX_LENGTH}
            value={username}
            disabled={Boolean(submitting)}
            onChange={(event) => portal.setUsername(event.target.value)}
          />
        </form>
      </Modal>

      <Modal
        open={step === 'otp'}
        onOpenChange={portal.close}
        size="sm"
        title="OTP Verification"
        description="Enter the OTP the GST portal sent to the mobile number registered for this username."
        closeOnBackdropClick={false}
        footer={
          <>
            <Button
              type="button"
              variant="link"
              className="mr-auto px-0"
              loading={submitting === 'send'}
              disabled={Boolean(submitting)}
              onClick={() => portal.resendOtp()}
            >
              Resend OTP
            </Button>
            <Button type="button" variant="ghost" disabled={Boolean(submitting)} onClick={portal.cancel}>
              Cancel
            </Button>
            <Button type="submit" form={OTP_FORM} loading={submitting === 'verify'} disabled={!otp.trim() || submitting === 'send'}>
              Verify OTP
            </Button>
          </>
        }
      >
        <form id={OTP_FORM} noValidate onSubmit={portal.submitOtp} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            GST Portal Username: <span className="font-medium text-primary">{username}</span>
          </p>
          <Field
            id="gst-portal-otp"
            label="OTP"
            required
            icon={KeyRound}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={otp}
            disabled={Boolean(submitting)}
            onChange={(event) => portal.setOtp(event.target.value)}
          />
        </form>
      </Modal>
    </>
  )
}

export default GstPortalAuthDialogs

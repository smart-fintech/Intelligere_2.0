import { useRef, useState } from 'react'
import { DownloadCloud, KeyRound, User } from 'lucide-react'

import { Field } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { fetchGstr2b, sendGstOtp, verifyGstOtp } from '@/Services/gstCompareService'

const USERNAME_FORM = 'gst-portal-username-form'
const OTP_FORM = 'gst-portal-otp-form'

/**
 * FETCH DATA FROM THE GST PORTAL - the Fetch button and the two steps it may
 * need before the portal answers:
 *
 *   no portal user on the company   ask for it (the OTP request saves it on the company)
 *   the portal session has run out  send an OTP, ask for it, then fetch again
 *
 * `onFetched()` runs once GSTR-2B is stored on the backend. The username and
 * OTP live here alone, and go with the dialogs.
 *
 *   companyId, startMonth, endMonth, year   what to fetch
 *   disabled                                 the period is not chosen yet
 */
export default function GstPortalFetch({ companyId, startMonth, endMonth, year, disabled, onFetched }) {
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // null | 'username' | 'otp'
  const [step, setStep] = useState(null)
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  // A second click while a request is on its way does nothing.
  const busy = useRef(false)

  const sendOtp = async (user) => {
    await sendGstOtp({ companyId, username: user })
    setUsername(user)
    setOtp('')
    setStep('otp')
  }

  const fetchFromPortal = async () => {
    if (busy.current) return
    busy.current = true
    setFetching(true)
    try {
      const reply = await fetchGstr2b({ companyId, startMonth, endMonth, year })
      if (reply?.gst_username === '' || reply?.msg === 'gst_username is required') {
        setUsername('')
        setStep('username')
      } else if (reply?.msg === 'OTP required') {
        await sendOtp(reply.gst_username)
      } else if (reply?.source) {
        if (reply.success) toast.success(reply.success)
        if (reply.error) toast.error(reply.error)
        onFetched()
      } else {
        toast.error(reply?.msg || 'The GST portal did not return any data.')
      }
    } catch (error) {
      // A missing route answers with a whole HTML page, which is no message to show.
      toast.error(error.status === 404 ? 'Fetching from the GST portal is not available on this server yet. Please upload the file.' : error.message)
    } finally {
      busy.current = false
      setFetching(false)
    }
  }

  const submitUsername = async (event) => {
    event.preventDefault()
    const user = username.trim()
    if (!user || busy.current) return
    busy.current = true
    setSubmitting(true)
    try {
      await sendOtp(user)
    } catch (error) {
      toast.error(error.message)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  const submitOtp = async (event) => {
    event.preventDefault()
    const code = otp.trim()
    if (!code || busy.current) return
    busy.current = true
    setSubmitting(true)
    try {
      const reply = await verifyGstOtp({ companyId, username, otp: code })
      setStep(null)
      if (reply?.msg) toast.success(reply.msg)
    } catch (error) {
      toast.error(error.message)
      return
    } finally {
      busy.current = false
      setSubmitting(false)
    }
    fetchFromPortal()
  }

  const close = (next) => {
    if (!next && !submitting) setStep(null)
  }

  return (
    <>
      <Button icon={DownloadCloud} loading={fetching} disabled={disabled} onClick={fetchFromPortal}>
        Fetch
      </Button>

      <Modal
        open={step === 'username'}
        onOpenChange={close}
        size="sm"
        title="Portal User Name"
        description="The company's user name on the GST portal. An OTP is sent to its registered mobile next."
        closeOnBackdropClick={false}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setStep(null)}>
              Cancel
            </Button>
            <Button type="submit" form={USERNAME_FORM} loading={submitting} disabled={!username.trim()}>
              Submit
            </Button>
          </>
        }
      >
        <form id={USERNAME_FORM} noValidate onSubmit={submitUsername}>
          <Field
            id="gst-portal-username"
            label="Portal User Name"
            required
            icon={User}
            autoComplete="off"
            value={username}
            disabled={submitting}
            onChange={(event) => setUsername(event.target.value)}
          />
        </form>
      </Modal>

      <Modal
        open={step === 'otp'}
        onOpenChange={close}
        size="sm"
        title="OTP"
        description="Enter the OTP the GST portal sent to the company's registered mobile."
        closeOnBackdropClick={false}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setStep(null)}>
              Cancel
            </Button>
            <Button type="submit" form={OTP_FORM} loading={submitting} disabled={!otp.trim()}>
              Submit
            </Button>
          </>
        }
      >
        <form id={OTP_FORM} noValidate onSubmit={submitOtp}>
          <Field
            id="gst-portal-otp"
            label="OTP"
            required
            icon={KeyRound}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={otp}
            disabled={submitting}
            onChange={(event) => setOtp(event.target.value)}
          />
        </form>
      </Modal>
    </>
  )
}

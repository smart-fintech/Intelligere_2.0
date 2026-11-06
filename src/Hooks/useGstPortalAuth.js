import { useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import {
  GST_PORTAL_OTP_REQUIRED,
  GST_PORTAL_USERNAME_REQUIRED,
  sendGstPortalOtp,
  verifyGstPortalOtp,
} from '@/Services/Gst/gstReturnService'

/**
 * A READ FROM THE GST PORTAL, and the two steps it may need before the
 * portal answers - GST Compare's GSTR-2B, Sales Entries' GSTR-1:
 *
 *   no portal user on the company   ask for it, send the OTP (which saves it
 *                                   on the company), verify, fetch again
 *   the portal session has run out  send the OTP to the user the backend
 *                                   named, verify, fetch again
 *
 *   const portal = useGstPortalAuth({ companyId, premiumName, request, onAnswer, onFailure })
 *   portal.fetch(params)     runs request(params) - false when one is on its way
 *   portal.fetching          true while it is
 *   <GstPortalAuthDialogs portal={portal} />   the username and OTP dialogs
 *
 *   premiumName   what the OTP is sent and verified under (gst-authentication/
 *                 checks the company bought it)
 *   request       params => the module's portal call
 *   onAnswer      (reply, params) => any answer that is not a sign-in step
 *   onFailure     (error, params) => the call threw
 *
 * The fetch after a verified OTP sends the very request the first fetch
 * made, and is not authenticated a second time: if the portal still asks,
 * that is shown as an error rather than texting another OTP.
 */

const STILL_ASKING = 'The GST portal is still asking for authentication. Please click Fetch to try again.'

export default function useGstPortalAuth({ companyId, premiumName, request, onAnswer, onFailure }) {
  const [fetching, setFetching] = useState(false)
  // null | 'send' | 'verify' - which portal request a dialog is waiting on
  const [submitting, setSubmitting] = useState(null)
  // null | 'username' | 'otp'
  const [step, setStep] = useState(null)
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  // A second click while a request is on its way does nothing.
  const busy = useRef(false)
  // What the first fetch asked for - fetched again once the OTP is verified.
  const params = useRef(null)

  /** Runs one portal request at a time; `false` when another is on its way. */
  const exclusive = async (kind, task) => {
    if (busy.current) return false
    busy.current = true
    setSubmitting(kind)
    try {
      await task()
      return true
    } finally {
      busy.current = false
      setSubmitting(null)
    }
  }

  /** Texts the OTP to `user` and moves to the OTP dialog. Throws when the portal would not send it. */
  const sendOtp = async (user) => {
    const reply = await sendGstPortalOtp({ companyId, username: user, premiumName })
    setUsername(user)
    setOtp('')
    setStep('otp')
    toast.success(reply?.msg || 'OTP sent successfully.')
  }

  const resendOtp = (user = username) =>
    exclusive('send', () => sendOtp(user)).catch((error) => toast.error(error.message))

  const run = async ({ afterAuth }) => {
    busy.current = true
    setFetching(true)
    let otpFor = null
    try {
      const reply = await request(params.current)
      const needsUser = reply?.msg === GST_PORTAL_USERNAME_REQUIRED
      const needsOtp = reply?.msg === GST_PORTAL_OTP_REQUIRED
      if ((needsUser || needsOtp) && afterAuth) {
        toast.error(STILL_ASKING)
      } else if (needsUser) {
        setUsername('')
        setStep('username')
      } else if (needsOtp) {
        otpFor = reply.gst_username || ''
      } else {
        onAnswer(reply, params.current)
      }
    } catch (error) {
      onFailure(error, params.current)
    } finally {
      busy.current = false
      setFetching(false)
    }
    if (otpFor === null) return
    // The user is known: straight to the OTP dialog, which offers Resend OTP if this send fails.
    setUsername(otpFor)
    setOtp('')
    setStep('otp')
    resendOtp(otpFor)
  }

  const fetch = (next) => {
    if (busy.current) return false
    params.current = next
    run({ afterAuth: false })
    return true
  }

  const submitUsername = async (event) => {
    event.preventDefault()
    const user = username.trim()
    if (!user) return
    // A failed send keeps this dialog open with the name as typed, to try again.
    await exclusive('send', () => sendOtp(user)).catch((error) => toast.error(error.message))
  }

  const submitOtp = async (event) => {
    event.preventDefault()
    const code = otp.trim()
    if (!code) return
    // A wrong or expired OTP keeps this dialog open, the OTP still in it to correct.
    const verified = await exclusive('verify', async () => {
      const reply = await verifyGstPortalOtp({ companyId, username, otp: code, premiumName })
      setStep(null)
      toast.success(reply?.msg || 'You are authorized for the GST process.')
    }).catch((error) => {
      toast.error(error.message)
      return false
    })
    if (verified && !busy.current) run({ afterAuth: true })
  }

  return {
    fetch,
    fetching,
    submitting,
    step,
    username,
    setUsername,
    otp,
    setOtp,
    submitUsername,
    submitOtp,
    resendOtp,
    cancel: () => setStep(null),
    close: (next) => {
      if (!next && !submitting) setStep(null)
    },
  }
}

import { useRef, useState } from 'react'

import useGstPortalAuth from '@/Hooks/useGstPortalAuth'
import { toast } from '@/Library/toast'
import {
  checkGstr1Data,
  fileGstr1Final,
  GST_AUTH_REQUIRED,
  GST_PORTAL_OTP_REQUIRED,
  GST_PORTAL_SIGNED_IN,
  GSTR_1_FILING_UNKNOWN,
  GSTR_1_PREMIUM,
  prepareGstr1Filing,
} from '@/Services/Gst/gstReturnService'

/**
 * FILING GSTR-1 FROM HISTORY - the Sales Invoices ticked (one company, one
 * month), in the backend's three steps (Services/Gst/gstReturnService), always
 * with the same document ids:
 *
 *   1. check-gstr1-data/    ready and signed in? Signing in when the portal
 *                           asks - the username, the OTP - is useGstPortalAuth's
 *                           (under the GSTR 1 premium), and then this step again
 *   2. file-gstr1/          the return saved on the portal and the EVC OTP texted;
 *                           GST_AUTH_REQUIRED here signs in and runs 1 and 2 again
 *                           (nothing is filed by them)
 *   3. gstr1-final-filing/  only when File GSTR-1 is pressed in the EVC dialog, with
 *                           ret_period and the invoice ids step 2 answered
 *
 * Step 3 is IRREVERSIBLE and is never sent by itself:
 *   filed                      the acknowledgement number shown (`outcome`), onSettled()
 *   GSTR_1_FILING_UNKNOWN      the portal never answered - it may be filed. Said, and
 *                              kept on screen; the dialog closes, nothing is sent again
 *   GST_AUTH_REQUIRED          refused before the portal was asked: sign in again,
 *                              then the EVC dialog once more - the user files again
 *   anything else              its message (and the portal step) in the dialog, which
 *                              stays open - a mistyped OTP can be corrected
 *
 *   const filing = useGstr1Filing({ companyId, onSettled })
 *   filing.start(invoiceIds)  -> false when one is already on its way
 *   filing.busy, filing.preparing, filing.portal (GstPortalAuthDialogs),
 *   filing.evc / evcOpen / evcOtp / setEvcOtp / evcError / submitEvc / resendEvc / cancelEvc,
 *   filing.outcome / dismissOutcome
 */

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** The backend's message, with the portal step it stopped at when it names one. */
const failureText = (failure, fallback) => {
  const message = text(failure?.message) || fallback
  const step = text(failure?.data?.step)
  return step ? `${message} (${step})` : message
}

export default function useGstr1Filing({ companyId, onSettled }) {
  // { invoiceIds, retPeriod } once step 2 is done - the EVC dialog's
  const [evc, setEvc] = useState(null)
  const [evcOtp, setEvcOtp] = useState('')
  const [evcError, setEvcError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // { kind: 'filed' | 'unknown', message, ackNo }
  const [outcome, setOutcome] = useState(null)
  const filingNow = useRef(false)

  /** Steps 1 and 2 ('prepare'), or step 1 alone ('reauth' - signing in again before step 3). */
  const request = async ({ stage, invoiceIds }) => {
    const check = await checkGstr1Data({ companyId, invoiceIds })
    if (stage !== 'prepare' || check?.msg !== GST_PORTAL_SIGNED_IN) return check
    try {
      return { ...(await prepareGstr1Filing({ companyId, invoiceIds })), prepared: true }
    } catch (failure) {
      if (failure.message === GST_AUTH_REQUIRED) return { msg: GST_PORTAL_OTP_REQUIRED, gst_username: text(check.gst_username) }
      throw failure
    }
  }

  const portal = useGstPortalAuth({
    companyId,
    premiumName: GSTR_1_PREMIUM,
    request,
    onAnswer: (reply, asked) => {
      if (reply?.prepared && text(reply.ret_period)) {
        const ids = Array.isArray(reply.invoice_ids) && reply.invoice_ids.length > 0 ? reply.invoice_ids : asked.invoiceIds
        setEvc({ invoiceIds: ids, retPeriod: text(reply.ret_period) })
        setEvcOtp('')
        setEvcError('')
        toast.success(reply.msg || 'The GSTR-1 return is saved on the portal.', { description: 'Enter the EVC OTP sent to the registered mobile to file it.' })
      } else if (asked.stage === 'reauth' && reply?.msg === GST_PORTAL_SIGNED_IN) {
        toast.success('Signed in to the GST portal.', { description: 'Enter the EVC OTP and press File GSTR-1 again.' })
      } else {
        toast.error(text(reply?.msg) || 'GSTR-1 could not be prepared.')
      }
    },
    onFailure: (failure) => toast.error(failureText(failure, 'GSTR-1 could not be prepared.')),
  })

  const start = (invoiceIds) => {
    if (filingNow.current || evc || portal.fetching) return false
    setOutcome(null)
    return portal.fetch({ stage: 'prepare', invoiceIds })
  }

  const settle = (next) => {
    setEvc(null)
    setEvcOtp('')
    setEvcError('')
    setOutcome(next)
    onSettled?.()
  }

  const submitEvc = async (event) => {
    event?.preventDefault()
    const code = evcOtp.trim()
    if (!evc || !code || filingNow.current || portal.fetching) return
    filingNow.current = true
    setSubmitting(true)
    setEvcError('')
    try {
      const reply = await fileGstr1Final({ companyId, retPeriod: evc.retPeriod, evcOtp: code, invoiceIds: evc.invoiceIds })
      const ackNo = text(reply?.ack_no)
      toast.success(text(reply?.msg) || 'GSTR-1 filed.', ackNo ? { description: `Acknowledgement No. ${ackNo}`, duration: 15000 } : undefined)
      // The backend's message names the ack no too - shown once, beside its label.
      settle({ kind: 'filed', message: ackNo ? 'GSTR-1 filed.' : text(reply?.msg) || 'GSTR-1 filed.', ackNo })
    } catch (failure) {
      if (failure.message === GSTR_1_FILING_UNKNOWN) {
        toast.error(GSTR_1_FILING_UNKNOWN, { duration: 20000 })
        settle({ kind: 'unknown', message: GSTR_1_FILING_UNKNOWN, ackNo: '' })
      } else if (failure.message === GST_AUTH_REQUIRED) {
        // Refused before the portal was asked: sign in again, then the dialog is back for the user to file.
        setEvcOtp('')
        portal.fetch({ stage: 'reauth', invoiceIds: evc.invoiceIds })
      } else {
        const message = failureText(failure, 'GSTR-1 could not be filed.')
        setEvcError(message)
        toast.error(message)
      }
    } finally {
      filingNow.current = false
      setSubmitting(false)
    }
  }

  return {
    start,
    portal,
    preparing: portal.fetching,
    busy: portal.fetching || submitting || evc !== null || portal.step !== null,
    evc,
    // Hidden while signing in again (or a new EVC OTP is asked for) - back once that is over.
    evcOpen: evc !== null && !portal.fetching && portal.step === null,
    evcOtp,
    setEvcOtp,
    evcError,
    submitting,
    submitEvc,
    /** Steps 1 and 2 again for the same invoices - a new EVC OTP; nothing is filed. */
    resendEvc: () => {
      if (!evc || filingNow.current) return
      setEvcError('')
      portal.fetch({ stage: 'prepare', invoiceIds: evc.invoiceIds })
    },
    /** Closes the dialog: the return stays saved on the portal, not filed. */
    cancelEvc: () => {
      if (filingNow.current) return
      setEvc(null)
      setEvcOtp('')
      setEvcError('')
    },
    outcome,
    dismissOutcome: () => setOutcome(null),
  }
}

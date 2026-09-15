import { useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import { fetchGstDetails, isValidGstNumber } from '@/Services/gstService'

/**
 * The "Fill from GSTIN" lookup, as every form in the app runs it.
 *
 * Two forms have the switch - Add company and the Ledger form - and before
 * this hook each wrote the same flow out by hand. Now both call this, so a
 * GST number is checked, fetched, reported and failed in exactly the same way
 * wherever it is typed:
 *
 *   const gst = useGstLookup()
 *
 *   const result = await gst.lookup(form.gst_no, {
 *     successMessage: 'Details filled in.',
 *   })
 *   if (result.fieldError) setErrors({ gst_no: result.fieldError })
 *   if (result.details) {
 *     setForm((previous) => ({ ...previous, name: result.details.name || previous.name }))
 *   }
 *
 *   gst.looking   true while a request is on its way - for the button
 *
 * ------------------------------------------------------------------
 * WHAT IT DOES, AND WHAT IT LEAVES TO THE FORM
 * ------------------------------------------------------------------
 * This hook owns everything that must be the same everywhere:
 *
 *   - the checks before a request is spent (empty, wrong shape)
 *   - one request at a time, however fast the button is clicked
 *   - no second request for a number it has just looked up
 *   - the success message, then the warning for a cancelled registration
 *   - the error message when it fails - said once, never retried
 *
 * The form keeps the one thing that genuinely differs: which of the returned
 * fields go into which of ITS fields. A company and a ledger are named
 * differently, so that mapping is not something to share.
 *
 * The request itself - the base64 decoding, the nested address, the three
 * reply shapes - is Services/gstService, which this calls. Nothing here
 * touches the network directly.
 *
 * ------------------------------------------------------------------
 * WHAT `lookup` HANDS BACK
 * ------------------------------------------------------------------
 *   { details }       it worked - details are gstService's shape:
 *                     { name, legalName, gstNumber, address, pincode,
 *                       state, district, registrationType, status }
 *   { fieldError }    the number is empty or malformed - show this under the
 *                     GST field. No request was made.
 *   {}                the request failed; the message has already been shown.
 *                     Also what a click during a running request gets.
 */
export function useGstLookup() {
  const [looking, setLooking] = useState(false)

  /*
   * Two refs, because both are read inside the click handler and must be the
   * CURRENT value, not the one from the render that created the handler:
   *
   *   inFlightRef   stops a second request while one is running. `looking`
   *                 alone cannot do it - two clicks inside the same render
   *                 would both read it as false.
   *
   *   lastRef       the number last looked up and what came back. Asking
   *                 again for the same number hands that back instead of
   *                 spending another request.
   */
  const inFlightRef = useRef(false)
  const lastRef = useRef({ gstin: null, details: null })

  /** Tells the user it worked, and flags a registration that is not live. */
  const announce = (details, successMessage) => {
    toast.success(successMessage || 'Details filled in from GSTIN.')

    // A cancelled or suspended registration is a valid GST number but not
    // a party anyone should be invoicing, so it is said out loud rather than
    // left for the user to spot.
    if (details.status && details.status.toLowerCase() !== 'active') {
      toast.warning(`This GST registration is ${details.status.toLowerCase()}.`)
    }
  }

  const lookup = async (rawGstin, { successMessage } = {}) => {
    const gstin = String(rawGstin ?? '').trim().toUpperCase()

    // Checked here so an obviously wrong number never costs a request.
    if (!gstin) return { fieldError: 'GST number is required' }
    if (!isValidGstNumber(gstin)) {
      return { fieldError: 'Enter a valid 15-character GST number' }
    }

    // The same number as last time: the answer is already here.
    if (lastRef.current.gstin === gstin && lastRef.current.details) {
      announce(lastRef.current.details, successMessage)
      return { details: lastRef.current.details }
    }

    if (inFlightRef.current) return {}

    inFlightRef.current = true
    setLooking(true)

    try {
      const details = await fetchGstDetails(gstin)

      lastRef.current = { gstin, details }
      announce(details, successMessage)

      return { details }
    } catch (error) {
      // Said once. The caller's form is left exactly as it was - nothing is
      // reset, and nothing tries again on its own.
      toast.error(error.message)
      return {}
    } finally {
      inFlightRef.current = false
      setLooking(false)
    }
  }

  return { lookup, looking }
}

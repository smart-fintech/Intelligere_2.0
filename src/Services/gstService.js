/**
 * READING A COMPANY'S DETAILS FROM ITS GST NUMBER.
 *
 * One call, usable from anywhere:
 *
 *   import { fetchGstDetails } from '@/Services/gstService'
 *
 *   const details = await fetchGstDetails('24BAUPS2722Q2ZV')
 *   //  {
 *   //    name:        'DIGITAL DOCUMENTATION SYSTEMS',
 *   //    gstNumber:   '24BAUPS2722Q2ZV',
 *   //    legalName:   'MEHUL MANIKANT SHAH',
 *   //    address:     '6TH FLOOR 5/H SUMERU CENTER C.G.ROAD PALDI',
 *   //    pincode:     '380007',
 *   //    state:       'Gujarat',
 *   //    district:    'Ahmedabad',
 *   //    registrationType: 'Regular',
 *   //    status:      'Cancelled',
 *   //    raw:         { ...whatever the service actually sent... }
 *   //  }
 *
 * It throws an Error whose `message` is the text to show the user - the same
 * arrangement as Services/authService, so a screen only ever needs
 * `catch (error) { toast.error(error.message) }`.
 *
 * The Add company form is the first caller (the "Fill from GSTIN" switch).
 * Anything else that needs a company's details from its GST number - a
 * customer form, a ledger screen - calls the same function and reads the
 * fields it wants off the result.
 *
 * ------------------------------------------------------------------
 * WHERE THE CALL ACTUALLY GOES, AND WHY IT IS NOT ALANKIT DIRECTLY
 * ------------------------------------------------------------------
 * Alankit's GSP endpoint is built for server-to-server calls and sends no
 * Access-Control-Allow-Origin header, so a browser calling it directly gets
 * its reply thrown away:
 *
 *   Access to XMLHttpRequest at 'https://gsp.alankitgst.com/...'
 *   has been blocked by CORS policy
 *
 * No front-end code can fix that - the header has to come from their server.
 * So the call goes through something of ours, and ENV.GST_LOOKUP_URL says
 * what:
 *
 *   DEVELOPMENT   /gst-api/commonapi/v1.1/search
 *                 The Vite dev server forwards it to Alankit and adds the
 *                 subscription key on the way (see vite.config.js). Same
 *                 origin as the page, so there is no CORS to fail.
 *
 *   PRODUCTION    our own backend - the Django GstDetails view.
 *                 A built site has no dev server in front of it, so this
 *                 MUST be changed before deploying. It is two lines in .env
 *                 and nothing here:
 *
 *                   VITE_GST_LOOKUP_URL=<backend>/tally/gst-details/
 *                   VITE_GST_LOOKUP_METHOD=post
 *
 * Both are handled below, because the two speak differently: the GSP wants
 * a GET with query parameters and answers with base64, while our backend
 * wants a POST body and answers with the fields already pulled out.
 *
 * ------------------------------------------------------------------
 * WHY THIS FILE DOES NOT USE `api` FROM authService
 * ------------------------------------------------------------------
 * That instance exists to talk to our backend: it prefixes every path with
 * our base URL, attaches the user's token, and treats a 401 as "refresh and
 * retry". None of that belongs on a request that may go to a third party,
 * and sending our token to another company's server would be a real leak.
 * So this file uses axios directly, with whatever URL is configured.
 */

import axios from 'axios'

import { ENV } from '@/Config/env'
import { findStateByName } from '@/Constants/indianStates'

/* ------------------------------------------------------------------ */
/* Is this even a GST number?                                         */
/* ------------------------------------------------------------------ */

/**
 * 15 characters: 2 state digits, a 10-character PAN, an entity digit, a
 * fixed "Z", then a checksum character.
 *
 * Exported because a form wants to check the field BEFORE spending a
 * request - and because the same rule is worth writing once.
 */
export const isValidGstNumber = (gstNumber) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
    String(gstNumber ?? '').trim().toUpperCase(),
  )

/* ------------------------------------------------------------------ */
/* The GSP reply arrives base64-encoded                               */
/* ------------------------------------------------------------------ */

/**
 * Turns the `data` string of a GSP reply back into the record it holds.
 *
 * The service answers with { status_cd, data } where `data` is base64 of a
 * JSON object. Two details that catch people out:
 *
 *   - the padding "=" signs are sometimes missing, and atob refuses a
 *     string whose length is not a multiple of four, so they are added back
 *   - atob gives one byte per character, not text. A company name with any
 *     non-English character would come out mangled without decoding those
 *     bytes as UTF-8, which is what TextDecoder is for.
 */
export const decodeGstPayload = (encoded) => {
  if (!encoded) return null

  // Already an object? A backend proxy may well have decoded it for us.
  if (typeof encoded === 'object') return encoded

  try {
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder('utf-8').decode(bytes))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Turning a reply into something a form can use                      */
/* ------------------------------------------------------------------ */

/**
 * The address comes as separate parts, any of which may be missing or an
 * empty string, so they are joined in reading order and the gaps dropped.
 *
 *   flno "6TH FLOOR" + bno "5/H" + bnm "SUMERU CENTER" + st "C.G.ROAD" + loc "PALDI"
 */
const buildAddress = (addr = {}) =>
  [addr.flno, addr.bno, addr.bnm, addr.st, addr.loc]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')

/**
 * A decoded GSP record, renamed into the fields a screen actually wants.
 *
 * Exported on its own so a caller that already HAS a record (from a
 * backend that decoded it, or from a test) can reuse the mapping.
 */
export const toCompanyDetails = (record) => {
  const address = record?.pradr?.addr ?? {}

  return {
    // The trading name is the one on the signboard; the legal name is the
    // registered one, and is a better fallback than an empty box.
    name: record?.tradeNam || record?.lgnm || '',
    legalName: record?.lgnm || '',
    gstNumber: record?.gstin || '',
    address: buildAddress(address),
    pincode: address.pncd || '',
    // Matched against our own list so it comes back spelled exactly as a
    // <Select> option, whatever case it arrived in.
    state: findStateByName(address.stcd)?.name || '',
    district: address.dst || '',
    registrationType: record?.dty || '',
    // "Active" or "Cancelled". Worth showing: a cancelled GST number is
    // valid text but not a company anyone should be invoicing.
    status: record?.sts || '',
    raw: record,
  }
}

/**
 * The same thing for our own backend's reply, which has already done the
 * decoding and the renaming - its own way:
 *
 *   { ledger_name, ledger_gstin, ledger_address, ledger_pincode,
 *     ledger_state, ledger_gst_reg_type }
 *
 * That shape carries no legal name, district or status, so those come back
 * empty rather than wrong.
 */
const fromLedgerShape = (payload) => ({
  name: payload.ledger_name || '',
  legalName: '',
  gstNumber: payload.ledger_gstin || '',
  address: payload.ledger_address || '',
  pincode: payload.ledger_pincode || '',
  state: findStateByName(payload.ledger_state)?.name || '',
  district: '',
  registrationType: payload.ledger_gst_reg_type || '',
  status: '',
  raw: payload,
})

/**
 * Whatever came back, in the one shape the rest of the app knows.
 *
 * Three arrangements are recognised, so the same call works whether it went
 * to the GSP through the dev proxy or to our own backend:
 *
 *   1. { status_cd: "1", data: "<base64>" }   the GSP itself
 *   2. { ledger_name, ledger_gstin, ... }     our Django view
 *   3. { gstin, pradr, ... }                  a decoded record, as-is
 *
 * Anything else throws with the reason the service gave, if it gave one.
 */
const readReply = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The GST service sent something we could not read.')
  }

  // ---- 1. The GSP's own shape ----
  if (payload.status_cd !== undefined) {
    // "1" means found. Anything else comes with a reason, usually under
    // `error.message` - "invalid gstin", "no records found", and so on.
    if (String(payload.status_cd) !== '1' || !payload.data) {
      throw new Error(
        payload.error?.message ||
          payload.msg ||
          'No company was found for that GST number.',
      )
    }

    const record = decodeGstPayload(payload.data)
    if (!record) throw new Error('The GST service sent something we could not read.')

    return toCompanyDetails(record)
  }

  // ---- 2. Our backend's shape ----
  if (payload.ledger_gstin || payload.ledger_name) return fromLedgerShape(payload)

  // ---- 3. A plain decoded record ----
  if (payload.gstin || payload.pradr) return toCompanyDetails(payload)

  // Some backends answer 200 with a message instead of an error status.
  throw new Error(payload.msg || 'No company was found for that GST number.')
}

/* ------------------------------------------------------------------ */
/* The call                                                           */
/* ------------------------------------------------------------------ */

/**
 * Looks a GST number up and hands back the company's details.
 *
 * Throws an Error carrying the message to show the user: an invalid number,
 * whatever the service complained about, or a plain "could not reach it".
 */
export const fetchGstDetails = async (gstNumber) => {
  const gstin = String(gstNumber ?? '').trim().toUpperCase()

  // Checked here as well as in the form, because this is the door every
  // caller comes through and a bad number is a wasted request.
  if (!isValidGstNumber(gstin)) {
    throw new Error('Enter a valid 15-character GST number.')
  }

  const options = {
    headers: {
      'Content-Type': 'application/json',
      // Only sent when one is configured, which is normally never: the dev
      // proxy and the backend both add it themselves, where it is safe.
      ...(ENV.GST_SUBSCRIPTION_KEY
        ? { 'Ocp-Apim-Subscription-Key': ENV.GST_SUBSCRIPTION_KEY }
        : {}),
    },
    // A GST lookup that has not answered in 20 seconds is not going to.
    timeout: 20000,
  }

  let payload
  try {
    // Our backend takes a body; the GSP takes query parameters. Which one
    // is being talked to is a setting, not a code change - see the note at
    // the top of this file.
    const response =
      ENV.GST_LOOKUP_METHOD === 'post'
        ? await axios.post(ENV.GST_LOOKUP_URL, { gstin }, options)
        : await axios.get(ENV.GST_LOOKUP_URL, {
            ...options,
            params: { gstin, action: 'TP' },
          })

    payload = response.data
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('The GST service took too long to answer. Please try again.', {
        cause: error,
      })
    }

    // No `response` means the reply never arrived: offline, the dev server
    // not running, or the browser blocking a cross-origin call because
    // GST_LOOKUP_URL still points straight at the GSP.
    if (!error.response) {
      throw new Error('Could not reach the GST service. Please try again.', {
        cause: error,
      })
    }

    throw new Error(
      error.response.data?.error?.message ||
        error.response.data?.msg ||
        'The GST service could not answer that request.',
      { cause: error },
    )
  }

  return readReply(payload)
}

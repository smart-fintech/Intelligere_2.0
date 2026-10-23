/**
 * GST portal authentication - E-Invoice and E-Way Bill, each on its own:
 *
 *   POST gst_portal_integration/einvoice-auth/   { username, password, company_id }
 *     -> { msg: "EInvoiceAuth Successfully" }
 *   POST gst_portal_integration/ewaybill-auth/   { username, password, company_id }
 *     -> { msg: "EwayBillAuth Successfully" }
 *
 * A failure answers { msg: "<why>" } ("username, password, company_id is
 * required", "Please fill company GSTIN before E-Way Bill authentication",
 * ...). Only the feature's own success message counts as authenticated -
 * any other answer is a failure, its msg the reason.
 *
 * Whether a company needs authenticating is read from its record
 * (tally/user-companies-list/): the feature's portal username AND password
 * both filled. Whether the feature is ON is its own flag (e_invoice /
 * e_way_bill) - credentials alone never say that. Neither feature ever reads
 * or sends the other's credentials.
 */

import { api } from '@/Services/authService'

/** Each feature, by the invoice setting it belongs to (form.settings.eInvoice / eWayBill). */
export const PORTAL_AUTH = Object.freeze({
  eInvoice: Object.freeze({
    label: 'E-Invoice',
    url: 'gst_portal_integration/einvoice-auth/',
    success: 'EInvoiceAuth Successfully',
    usernameField: 'e_invoice_portal_username',
    passwordField: 'e_invoice_portal_password',
    flagField: 'e_invoice',
  }),
  eWayBill: Object.freeze({
    label: 'E-Way Bill',
    url: 'gst_portal_integration/ewaybill-auth/',
    success: 'EwayBillAuth Successfully',
    usernameField: 'e_way_bill_portal_username',
    passwordField: 'e_way_bill_portal_password',
    flagField: 'e_way_bill',
  }),
})

/** Whether a setting is one that needs portal authentication before it is ticked. */
export const needsPortalAuth = (setting) => Object.hasOwn(PORTAL_AUTH, setting)

const filled = (value) => {
  const text = value === null || value === undefined ? '' : String(value).trim()
  return text !== '' && !['null', 'none', 'undefined'].includes(text.toLowerCase())
}

/**
 * Whether the company record holds BOTH of this feature's portal credentials.
 * The store's record never carries a password (companyService drops them as
 * the list is read) - only whether it was filled, in `filled_credentials`.
 */
export const hasPortalCredentials = (company, setting) => {
  const feature = PORTAL_AUTH[setting]
  if (!feature) return false
  const password = Object.hasOwn(company?.filled_credentials ?? {}, feature.passwordField)
    ? company.filled_credentials[feature.passwordField] === true
    : filled(company?.[feature.passwordField])
  return filled(company?.[feature.usernameField]) && password
}

const sameMessage = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/**
 * Authenticates one feature for one company - its own endpoint only.
 * -> the reply, when it carries the feature's success message; throws an
 *    Error with the backend's msg otherwise (a refused request throws the
 *    same way, from authService).
 */
export const authenticatePortal = async (setting, { username, password, companyId }) => {
  const feature = PORTAL_AUTH[setting]
  if (!feature) throw new Error('Unknown GST portal feature.')
  const reply = await api.post(feature.url, { username, password, company_id: companyId })
  if (!sameMessage(reply?.msg, feature.success)) {
    throw new Error(typeof reply?.msg === 'string' && reply.msg.trim() ? reply.msg.trim() : `${feature.label} authentication failed.`)
  }
  return reply
}

/* ------------------------------------------------------------------ */
/* E-Invoice (IRN) and E-Way Bill - generate and cancel, by document   */
/* ------------------------------------------------------------------ */

/**
 * Every one is POST { document_id } -> { msg, ... }; a refusal throws with the
 * backend's msg (authService). The document is the history row's own
 * document_id - never its place in the list.
 *
 *   gst_portal_integration/einvoice-generate-irn/  -> { msg, irn_no, irn_date, ack_no, qrcode_irn_no_image }
 *   gst_portal_integration/einvoice-cancel-irn/    -> { msg }
 *   gst_portal_integration/ewaybill-generate/      -> { msg, ewaybill_no, ewaybill_date }
 *   gst_portal_integration/ewaybill-cancel/        -> { msg }
 */
const byDocument = (url) => (documentId) => api.post(url, { document_id: documentId })

export const generateEinvoiceIrn = byDocument('gst_portal_integration/einvoice-generate-irn/')
export const cancelEinvoiceIrn = byDocument('gst_portal_integration/einvoice-cancel-irn/')
export const generateEwayBill = byDocument('gst_portal_integration/ewaybill-generate/')
export const cancelEwayBill = byDocument('gst_portal_integration/ewaybill-cancel/')

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const flag = (value) => value === true || ['true', '1', 'yes'].includes(text(value).toLowerCase())

/**
 * A history row's e_invoice_details, read safely (missing or partly missing
 * is all empty / false):
 *   einvoice   { generated, cancelled, irn, ackNo, ackDate, qr }
 *   ewaybill   { generated, cancelled, number, date, validUpTo }
 * Each on its own - one never says anything about the other. A cancelled one
 * (its cancel date set) is not offered for generating again.
 */
export const readEinvoiceDetails = (record) => {
  let details = record?.e_invoice_details
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details)
    } catch {
      details = null
    }
  }
  if (!details || typeof details !== 'object' || Array.isArray(details)) details = {}
  return {
    einvoice: {
      generated: flag(details.e_invoice_generated),
      cancelled: Boolean(text(details.cancel_einvoice_date)),
      irn: text(details.irn_no),
      ackNo: text(details.ack_no),
      ackDate: text(details.irn_date),
      qr: text(details.qrcode_irn_no_image),
    },
    ewaybill: {
      generated: flag(details.eway_Bill_generated),
      cancelled: Boolean(text(details.cancel_ewaybill_date)),
      number: text(details.ewaybill_no),
      date: text(details.ewaybill_date),
      validUpTo: text(details.valid_up_to),
    },
  }
}

/** The IRN band's values from the IRN generation's reply (the row's own, where the reply has none). */
export const einvoiceFromReply = (reply, fallback = {}) => ({
  irn: text(reply?.irn_no) || fallback.irn || '',
  ackNo: text(reply?.ack_no) || fallback.ackNo || '',
  ackDate: text(reply?.irn_date) || fallback.ackDate || '',
  qr: text(reply?.qrcode_irn_no_image) || fallback.qr || '',
})

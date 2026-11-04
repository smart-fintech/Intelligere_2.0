/**
 * GST RETURNS FROM THE PORTAL - the OTP sign-in and return reads more than
 * one module makes to the backend's gst_portal_integration/ app (E-Invoice
 * and E-Way Bill are Services/gstPortalService):
 *
 *   POST gst_portal_integration/gst-authentication/   sends / verifies the portal OTP
 *   POST gst_portal_integration/gstr1-return-data/    reads a month's GSTR-1 - see below
 *   POST gst_portal_integration/check-gstr1-data/     files GSTR-1 from Sales Invoices -
 *   POST gst_portal_integration/file-gstr1/             three steps, see "Filing GSTR-1"
 *   POST gst_portal_integration/gstr1-final-filing/
 *   POST gst_portal_integration/ims/                  IMS - reads its invoices / PUT saves
 *   PUT  gst_portal_integration/ims/                    their actions, see "IMS"
 *
 * Every call names the premium feature it is counted against (`premiumName`,
 * Payment/premiumFeatures): gst-authentication/ checks the company has bought
 * THAT one, so a module signs in under its own - GST Compare "GSTR 2B",
 * Sales Entries "GSTR 1". The sign-in flow itself is Hooks/useGstPortalAuth.
 *
 * Failures reach the caller as an Error carrying the backend's message
 * (authService).
 */

import { api } from '@/Services/authService'

const GST_AUTH_URL = 'gst_portal_integration/gst-authentication/'
const GSTR_1_FETCH_URL = 'gst_portal_integration/gstr1-return-data/'

/** What a portal read answers (200) when the portal must be signed in to first. */
export const GST_PORTAL_USERNAME_REQUIRED = 'gst_username is required'
export const GST_PORTAL_OTP_REQUIRED = 'OTP required'

/** Texts the OTP to the company's registered mobile. Also saves `username` on the company. */
export const sendGstPortalOtp = ({ companyId, username, premiumName }) =>
  api.post(GST_AUTH_URL, {
    company_id: companyId,
    username,
    is_send_otp: true,
    gst_otp: '',
    premium_name: premiumName,
  })

/** Verifies the OTP. The string "false": an empty or false is_send_otp fails the view's required check. */
export const verifyGstPortalOtp = ({ companyId, username, otp, premiumName }) =>
  api.post(GST_AUTH_URL, {
    company_id: companyId,
    username,
    is_send_otp: 'false',
    gst_otp: otp,
    premium_name: premiumName,
  })

/* ------------------------------------------------------------------ */
/* GSTR-1                                                              */
/* ------------------------------------------------------------------ */

export const GSTR_1_PREMIUM = 'GSTR 1'

/** What the backend answers (500) when the month had no B2B / B2C invoices to save. */
export const GSTR_1_NO_INVOICES = 'No B2B / B2C invoices found for this month'

/**
 * Reads a month's GSTR-1 sections from the portal - `sections`, the api_section
 * values (b2b, b2c, cdnr, cdnur, exp, advance, hsn, nil, doc, ecom, summary;
 * the screen's list is Constants/salesEntries GSTR_1_*). Every section is kept in
 * GSTPortalData.GSTR1_data for the company / month / year; the invoices of
 * b2b and b2c then REPLACE this user's multi ledger entries
 * (B2CWithoutInvMultiParty). A section stored before is not read from the
 * portal again. Answers:
 *
 *   200 { msg: "GSTR1 : 12 records saved" }
 *   200 { msg: "gst_username is required", gst_username: "" }
 *   200 { msg: "OTP required", gst_username }
 *   500 { msg: "B2BA : <portal message>, B2CL : ... | GSTR1 : 12 records saved" }   some sections failed
 *   500 { msg: "<portal message>" }, { msg: "No B2B / B2C invoices found for this month" }, ...
 *
 * so a partial success arrives THROWN - Modules/SalesEntries/MultiLedger/gstr1Reply reads both.
 */
export const fetchGstr1 = ({ companyId, month, year, sections }) =>
  api.post(GSTR_1_FETCH_URL, {
    company_id: companyId,
    month: Number(month),
    year: Number(year),
    premium_name: GSTR_1_PREMIUM,
    api_section: [...sections],
  })

/* ------------------------------------------------------------------ */
/* Filing GSTR-1                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sales Invoices of one company and one month (`invoiceIds` - their
 * document_id), filed in three steps, always with the same ids:
 *
 *   checkGstr1Data      ready, and signed in?   200 { msg: "OTP not required" | "OTP required"
 *                                                     | "gst_username is required", gst_username }
 *   prepareGstr1Filing  saves the return on the portal and texts the EVC OTP
 *                       -> 200 { msg, ret_period: "042026", invoice_ids }
 *   fileGstr1Final      files it with that OTP - IRREVERSIBLE
 *                       -> 200 { msg: "Filed GSTR1 and ack no : ...", ack_no }
 *
 * Every refusal is a 500 { msg } - premium / quota, invoices of another
 * month, missing GSTIN or PAN, a portal error (+ `step`, the portal step it
 * stopped at) or GST_AUTH_REQUIRED (sign in, then the same step again).
 * GSTR_1_FILING_UNKNOWN: the portal never answered the filing - it may have
 * been filed, so it is NEVER sent again by itself.
 */
const GSTR_1_CHECK_URL = 'gst_portal_integration/check-gstr1-data/'
const GSTR_1_PREPARE_URL = 'gst_portal_integration/file-gstr1/'
const GSTR_1_FINAL_URL = 'gst_portal_integration/gstr1-final-filing/'

export const GST_PORTAL_SIGNED_IN = 'OTP not required'
export const GST_AUTH_REQUIRED = 'GST Auth required'
export const GSTR_1_FILING_UNKNOWN = 'GSTR-1 filing status unknown. Check the GST portal before filing again.'

export const checkGstr1Data = ({ companyId, invoiceIds }) => api.post(GSTR_1_CHECK_URL, { company_id: companyId, invoice_ids: [...invoiceIds] })

export const prepareGstr1Filing = ({ companyId, invoiceIds }) => api.post(GSTR_1_PREPARE_URL, { company_id: companyId, invoice_ids: [...invoiceIds] })

export const fileGstr1Final = ({ companyId, retPeriod, evcOtp, invoiceIds }) =>
  api.post(GSTR_1_FINAL_URL, { company_id: companyId, ret_period: retPeriod, evc_otp: evcOtp, invoice_ids: [...invoiceIds] })

/* ------------------------------------------------------------------ */
/* IMS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The GST portal's Invoice Management System - the "IMS" premium. One URL
 * (the old project's invoice/IMSAPI/, moved):
 *
 *   fetchIms         POST { company_id } -> { b2b: [row], b2ba, b2bcn, b2bcna, b2bdn, b2bdna, ecom, ecoma }
 *   saveImsActions   PUT  { company_id, <section>: [{ ...the row as fetched, change }] }
 *                    -> { msg: "Action completed successfully" }
 *
 * A row's columns are the portal's, named for showing ("GSTIN of Supplier",
 * "Invoice Number", "Action", "Status" ...) and not the same in every section;
 * the backend maps the whole row back for the portal, its `Action` being the
 * status before and `change` the one chosen (A / R / P / N). Both may answer
 * the sign-in steps (GST_PORTAL_USERNAME_REQUIRED / GST_PORTAL_OTP_REQUIRED).
 */
const IMS_URL = 'gst_portal_integration/ims/'

export const IMS_PREMIUM = 'IMS'

export const fetchIms = ({ companyId }) => api.post(IMS_URL, { company_id: companyId })

export const saveImsActions = ({ companyId, sections }) => api.put(IMS_URL, { company_id: companyId, ...sections })

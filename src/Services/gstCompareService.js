/**
 * GST COMPARE - every request and Tally message of the module, against the
 * backend's gst_compare/ and gst_portal_integration/ apps:
 *
 *   POST gst_compare/process-files/          uploaded register + portal data -> the comparison
 *   POST gst_compare/AnnualgstpurchaseAPI/   Tally vouchers + portal data    -> the comparison
 *   POST gst_compare/ErpGSTPurchaseAPI/      Intelligere's own purchase documents + portal data
 *                                            -> the comparison (the backend reads the documents itself)
 *   PUT  gst_compare/process-files/          is_Check 0: saves edited invoice no. / date (JSON)
 *                                            otherwise: builds the GSTR-3B workbook -> { path }
 *   POST gst_compare/PurchaseRegisterRCM/    calculates tax on the ticked rows
 *   POST gst_compare/move_to_match/          moves ticked rows to matched -> { data, msg }
 *   POST gst_compare/entry_status/           Block Entry / Not To Be Considered
 *   POST gst_compare/pastdata/               a financial year's saved comparison
 *   POST gst_compare/pastmonthsdata/         ...and the months it covers
 *   POST gst_portal_integration/gstr2b/      reads GSTR-2B from the portal - see below
 *                                            (signing in first: Services/gstReturnService)
 *
 * A comparison is always { leftdata, rightdata }, each { M, S, U } - see
 * Modules/GstCompare/gstCompareModel. The rows of U include `unmatch`, which
 * on the left holds the comparison's id: every later request names it.
 *
 * FormData goes out as multipart because the views read repeated keys with
 * request.data.getlist('is_Check'), which a JSON body has not got.
 *
 * Failures reach the caller as an Error carrying the backend's message
 * (authService).
 *
 * The three compare calls take an optional axios `config` last - for
 * onUploadProgress; it changes nothing that is sent.
 */

import { ENV } from '@/Config/env'
import { getERP } from '@/Library/secureStorage'
import { api, apiSetup } from '@/Services/authService'

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

const PROCESS_FILES_URL = 'gst_compare/process-files/'
const GSTR_2B_FETCH_URL = 'gst_portal_integration/gstr2b/'

/** The premium feature the portal calls are counted against (Payment/premiumFeatures). */
export const GSTR_2B_PREMIUM = 'GSTR 2B'

/** The modules of the two Tally exchanges - sent as `module_name`, answered as `return_module_name`. */
export const GST_COMPARE_FETCH_MODULE = 'GST_Compare_Data_Fetch'
export const GST_COMPARE_VOUCHER_UPDATE_MODULE = 'GST_Compare_Voucher_Update'

/** A plain object as FormData; a list repeats its key. */
const toFormData = (fields) => {
  const body = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((one) => body.append(key, one))
    else body.append(key, value === null || value === undefined ? '' : value)
  })
  return body
}

/** The period and matching options every comparison is run with. */
const comparisonFields = ({ startMonth, endMonth, year, compareDate, compareInvoice }) => ({
  date: String(Boolean(compareDate)),
  Invoice_number: String(Boolean(compareInvoice)),
  start_month: startMonth,
  month: endMonth,
  year,
})

/**
 * The portal side of a comparison: the uploaded files, or - with none - an
 * empty gstfile0, which tells the backend to use the GSTR-2B it stored.
 */
const portalFields = (portalFiles) =>
  portalFiles.length > 0
    ? Object.fromEntries(portalFiles.map((file, index) => [`gstfile${index}`, file]))
    : { gstfile0: '' }

/** Compares uploaded purchase register file(s) with the portal data. */
export const compareUploadedFiles = (options, ledgerFiles, portalFiles, config, companyId) =>
  api.post(
    PROCESS_FILES_URL,
    toFormData({
      ...comparisonFields(options),
      ...Object.fromEntries(ledgerFiles.map((file, index) => [`tallyfile${index}`, file])),
      ...portalFields(portalFiles),
      source: (getERP()).toLowerCase(),
      company_id: companyId,
    }),
    { ...MULTIPART, ...config },
  )

/** The ERP a purchase ledger was fetched from, sent as `source`. */
export const ERP_SOURCE = Object.freeze({ TALLY: 'tally', INTELLIGERE: 'intelligere' })

/** Compares the vouchers fetched from Tally (GST_Compare_Data_Fetch's `data`) with the portal data. */
export const compareTallyVouchers = (options, tallyData, portalFiles, config, companyId) =>
  api.post(
    'gst_compare/AnnualgstpurchaseAPI/',
    toFormData({
      dataof: 'Monthly',
      ...comparisonFields(options),
      source: ERP_SOURCE.TALLY,
      leftdata: JSON.stringify(tallyData),
      ...portalFields(portalFiles),
      company_id: companyId,
    }),
    { ...MULTIPART, ...config },
  )

/**
 * Compares the period's purchase documents in Intelligere with the portal data.
 * Nothing is fetched first: the backend reads the documents itself, so this has
 * no leftdata - which is why it is not the Tally endpoint, that one requires it.
 */
export const compareIntelligereData = (options, portalFiles, config, companyId) =>
  api.post(
    'gst_compare/ErpGSTPurchaseAPI/',
    toFormData({
      dataof: 'Monthly',
      ...comparisonFields(options),
      source: ERP_SOURCE.INTELLIGERE,
      ...portalFields(portalFiles),
      company_id: companyId,
    }),
    { ...MULTIPART, ...config },
  )

/**
 * Saves edited invoice numbers / dates:
 *   { "<row key>": { "Invoice No.", "Invoice Date" }, "1DATA_ID": id, "is_Check": 0 }
 * is_Check must stay the NUMBER 0 - it is what tells this PUT from the GSTR-3B one.
 */
export const saveEditedEntries = (compareId, edits, companyId) =>
  api.put(PROCESS_FILES_URL, { ...edits, '1DATA_ID': compareId, is_Check: 0, company_id: companyId })

/** Builds the GSTR-3B workbook from the ticked portal rows -> { path }. */
export const generateGstr3b = (compareId, keys, companyId) =>
  api.put(PROCESS_FILES_URL, toFormData({ is_Check: keys, '1DATA_ID': compareId, company_id: companyId }), MULTIPART)

/** Where a generated workbook is served from. */
export const gstr3bFileUrl = (path) => `${ENV.API_BASE_URL}media/GSTR3B/${path}`

/**
 * The ticked ledger rows, each key with its "[rate, type]" as Python-readable
 * text. A row with nothing chosen is ["-", "-"], and the backend takes its
 * default: a half-chosen one must not send `null`, which it cannot parse.
 */
const ledgerSelection = (compareId, keys, picks = {}) => {
  const fields = { '1DATA_ID': String(compareId) }
  keys.forEach((key) => {
    fields[key] = JSON.stringify([picks[key]?.rate ?? '-', picks[key]?.type ?? '-'])
  })
  return toFormData(fields)
}

/** Calculates reverse-charge tax on the ticked ledger rows -> the comparison. */
export const applyRcm = (compareId, keys, picks) =>
  api.post('gst_compare/PurchaseRegisterRCM/', ledgerSelection(compareId, keys, picks), MULTIPART)

/**
 * Moves ticked ledger rows to matched -> { data: the comparison, msg, ok }.
 *
 * A 400 here still carries the updated comparison in `data`: some rows may have
 * moved while others could not. So it is read as an answer rather than thrown,
 * which would lose everything but the message.
 */
export const moveToMatch = async (compareId, keys) => {
  const { data, status } = await apiSetup.post('gst_compare/move_to_match/', ledgerSelection(compareId, keys), {
    ...MULTIPART,
    validateStatus: (code) => (code >= 200 && code < 300) || code === 400,
  })
  return { data: data?.data, msg: data?.msg, ok: status !== 400 }
}

/** What entry_status/ can mark portal rows as. */
export const ENTRY_OPERATION = Object.freeze({
  BLOCK: 'blocked_entries',
  NOT_CONSIDERED: 'not_to_be_considered',
})

/** Marks ticked portal rows -> the comparison, the rows' keys now prefixed B / NC. */
export const setEntryStatus = (compareId, keys, operation) =>
  api.post('gst_compare/entry_status/', toFormData({ ID: compareId, is_Check: keys, operation }), MULTIPART)

/** A financial year's saved comparison -> the comparison, or { msg } when there is none. */
export const getPastData = (startYear, endYear, companyId) =>
  api.post('gst_compare/pastdata/', { start_year: startYear, end_year: endYear, company_id: companyId })

/** The months that year's saved comparison covers -> a list, or { msg } when there are none. */
export const getPastMonths = (startYear, endYear, companyId) =>
  api.post('gst_compare/pastmonthsdata/', { start_year: startYear, end_year: endYear, company_id: companyId })

/* ------------------------------------------------------------------ */
/* The GST portal                                                      */
/* ------------------------------------------------------------------ */

/**
 * Asks the backend to read GSTR-2B from the portal for the months of `year`
 * (start_month not after end_month). It stores them where the comparison's
 * empty gstfile0 reads them; source "B2B" also saves them as B2B data, which
 * needs the company's IGST / CGST / SGST ledgers. Answers (200):
 *   { msg: "gst_username is required", gst_username: "" }   no portal user yet
 *   { msg: "OTP required", gst_username }                    the portal session has run out
 *   { msg: "April : 12 records saved, ..." }                 read and stored ("... : Data fetched" for
 *                                                            months stored earlier)
 * Anything else - "Ledgers not found IGST", "company not found", a month the
 * portal had nothing for - is a 500, so it is thrown.
 */
export const fetchGstr2b = ({ companyId, startMonth, endMonth, year }) =>
  api.post(GSTR_2B_FETCH_URL, {
    company_id: companyId,
    start_month: Number(startMonth),
    end_month: Number(endMonth),
    year: String(year),
    source: 'gst_compare',
    premium_name: GSTR_2B_PREMIUM,
  })

/*
 * Signing in to the portal first (gst-authentication/) is shared with the
 * other portal modules: Services/gstReturnService, under GSTR_2B_PREMIUM.
 */

/* ------------------------------------------------------------------ */
/* The Tally messages                                                  */
/* ------------------------------------------------------------------ */

/**
 * The purchase vouchers of a period. An end month before the start month runs
 * into the next year. The reply's `data` is [{ "1": voucher, "2": voucher, ... }].
 */
export const buildVoucherFetchMessage = (companyName, { year, startMonth, endMonth, voucherTypes }) => ({
  payload: {
    module_name: GST_COMPARE_FETCH_MODULE,
    company_name: companyName,
    data: {
      start_year: String(year),
      start_month: String(startMonth),
      end_month: String(endMonth),
      voucher_type: [...voucherTypes],
    },
  },
})

/**
 * Writes corrected numbers, dates and narrations back to the vouchers:
 * data is [{ guid, voucher_type, invoice_number, date, old_date, old_narration, new_narration }].
 * The reply's `data` is [{ guid, invoice_number, status, msg }].
 */
export const buildVoucherUpdateMessage = (companyName, rows) => ({
  payload: {
    module_name: GST_COMPARE_VOUCHER_UPDATE_MODULE,
    company_name: companyName,
    data: rows,
  },
})

/**
 * CSV exports of the dashboard lists.
 *
 *   POST  tally/download-csv/   { source, ...which data }
 *                            -> { msg: "CSV generated successfully", download_url: "..." }
 *
 * The backend builds the file and answers with a link to it. This file only
 * makes that request; fetching the file from `download_url` is done by the
 * project's one download utility, downloadFileFromUrl in Utils/fileDownload
 * (the same one the Profile page's Activity Log uses) - see
 * Components/Common/CsvDownloadButton, which puts the two together.
 *
 * What each page sends:
 *
 *   Bank Details      { source: 'bank_details',   company_name }   the selected company
 *   Ledger Details    { source: 'ledger_details', company_name }   the selected company
 *   Company Details   { source: 'companydata',    email }          the signed-in user
 */

import { api } from '@/Services/authService'

const DOWNLOAD_CSV_URL = 'tally/download-csv/'

/** The `source` names the backend knows each export by. */
export const CSV_SOURCES = {
  BANK: 'bank_details',
  LEDGER: 'ledger_details',
  COMPANY: 'companydata',
}

/**
 * Asks the backend to generate a CSV. Resolves with its reply - read
 * `download_url` from it. A failure arrives as an Error carrying the
 * backend's own message (see authService).
 */
export const generateCsv = (payload) => api.post(DOWNLOAD_CSV_URL, payload)
